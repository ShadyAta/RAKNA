/* app.js — Smart Parking Booking Logic (localStorage)
   Keys:
     - pw_slots  : array of slot states ("available"/"booked")
     - pw_bookings : array of booking objects
*/

const DEFAULT_COUNT = 12;
const SLOTS_KEY = "pw_slots";
const BOOK_KEY = "pw_bookings";

/* Utils */
const nowRounded = () => {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  return d.toISOString().slice(0, 16);
};

/* Slots */
function loadSlots() {
  try {
    const s = JSON.parse(localStorage.getItem(SLOTS_KEY));
    if (!Array.isArray(s)) throw 0;
    return s;
  } catch {
    const arr = new Array(DEFAULT_COUNT).fill("available");
    localStorage.setItem(SLOTS_KEY, JSON.stringify(arr));
    return arr;
  }
}
function saveSlots(slots) {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
}

/* Bookings */
function loadBookings() {
  try {
    return JSON.parse(localStorage.getItem(BOOK_KEY)) || [];
  } catch {
    return [];
  }
}
function saveBookings(b) {
  localStorage.setItem(BOOK_KEY, JSON.stringify(b));
}

/* Ensure correct slot count */
function ensureSlots(n) {
  let slots = loadSlots();
  if (slots.length === n) return slots;
  if (slots.length < n)
    slots = slots.concat(new Array(n - slots.length).fill("available"));
  else {
    // trim and remove bookings for removed slots
    const bookings = loadBookings().filter((r) => r.slotId < n);
    saveBookings(bookings);
    slots = slots.slice(0, n);
  }
  saveSlots(slots);
  return slots;
}

/* Render for booking.html */
function renderGrid() {
  const grid = document.getElementById("parking-grid");
  if (!grid) return;
  const slots = loadSlots();
  const bookings = loadBookings();
  grid.innerHTML = "";
  slots.forEach((st, i) => {
    const card = document.createElement("div");
    card.className = "slot " + (st === "available" ? "available" : "booked");
    const b = bookings.find((x) => x.slotId === i);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `Slot ${i + 1}`;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = b
      ? `${b.name} • ${new Date(b.start).toLocaleString()}`
      : "Available";

    const badge = document.createElement("div");
    badge.className = "slot-badge";
    badge.textContent = b ? "Booked" : "Free";

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(badge);

    card.addEventListener("click", () => onSlotClick(i, b));
    grid.appendChild(card);
  });
}

/* Slot click behavior */
function onSlotClick(slotId, booking) {
  if (booking) {
    const ok = confirm(
      `Booking Details\nName: ${booking.name}\nStart: ${new Date(
        booking.start
      ).toLocaleString()}\nDuration: ${
        booking.hours
      }h\n\nDo you want to cancel this booking?`
    );
    if (ok) {
      cancelBooking(booking.id);
      alert("Booking cancelled");
      renderGrid();
    }
    return;
  }
  openModal(slotId);
}

/* Modal control */
function openModal(slotId) {
  const modal = document.getElementById("modal");
  if (!modal) return;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.getElementById("slot-id").value = slotId;
  document.getElementById("name").value = "";
  document.getElementById("start").value = nowRounded();
  document.getElementById("hours").value = 1;
  setTimeout(() => document.getElementById("name").focus(), 80);
}
function closeModal() {
  const modal = document.getElementById("modal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

/* Booking functions */
function createBooking({ slotId, name, startISO, hours }) {
  const bookings = loadBookings();
  const start = new Date(startISO);
  const end = new Date(start.getTime() + hours * 3600 * 1000);

  const conflict = bookings.some(
    (r) =>
      r.slotId === slotId && new Date(r.start) < end && new Date(r.end) > start
  );
  if (conflict) return { ok: false, msg: "This slot is already booked." };

  const b = {
    id: "book_" + Date.now(),
    slotId,
    name,
    start: start.toISOString(),
    end: end.toISOString(),
    hours,
    createdAt: new Date().toISOString(),
  };
  bookings.push(b);
  saveBookings(bookings);

  const slots = loadSlots();
  slots[slotId] = "booked";
  saveSlots(slots);

  return { ok: true, booking: b };
}

function cancelBooking(id) {
  let bookings = loadBookings();
  const b = bookings.find((x) => x.id === id);
  if (!b) return;
  bookings = bookings.filter((x) => x.id !== id);
  saveBookings(bookings);

  const slots = loadSlots();
  if (slots[b.slotId] !== undefined) {
    const remaining = bookings.some((x) => x.slotId === b.slotId);
    if (!remaining) {
      slots[b.slotId] = "available";
      saveSlots(slots);
    }
  }
}

/* Admin helpers */
window.ParkWellAdmin = {
  loadSlots,
  saveSlots,
  loadBookings,
  saveBookings,
  cancelBooking,
};

/* Booking form handling */
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("parking-grid")) {
    const slots = loadSlots();
    const slotInput = document.getElementById("slot-count");
    slotInput.value = slots.length || DEFAULT_COUNT;

    renderGrid();

    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("cancel-btn").addEventListener("click", closeModal);
    document.getElementById("modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") closeModal();
    });

    document.getElementById("booking-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const slotId = Number(document.getElementById("slot-id").value);
      const name = document.getElementById("name").value.trim();
      const start = document.getElementById("start").value;
      const hours = Number(document.getElementById("hours").value);

      if (!name || !start || hours <= 0) {
        alert("Please fill the form correctly.");
        return;
      }

      const res = createBooking({ slotId, name, startISO: start, hours });
      if (!res.ok) {
        alert(res.msg);
        return;
      }

      closeModal();
      flashSlot(slotId);
    });

    document.getElementById("apply-count").addEventListener("click", () => {
      const n =
        Number(document.getElementById("slot-count").value) || DEFAULT_COUNT;
      if (n < 4 || n > 36) {
        alert("Slots must be between 4 and 36");
        return;
      }
      ensureSlots(n);
      renderGrid();
    });

    document.getElementById("reset-all").addEventListener("click", () => {
      if (!confirm("Reset all bookings and set all slots free?")) return;
      saveBookings([]);
      const s = loadSlots().map(() => "available");
      saveSlots(s);
      renderGrid();
      alert("All bookings cleared.");
    });
  }

  if (document.getElementById("bookings-list")) {
    renderAdmin();
  }
});

/* Flash effect */
function flashSlot(slotId) {
  const cards = Array.from(document.querySelectorAll(".slot"));
  const card = cards[slotId];
  if (!card) {
    renderGrid();
    return;
  }
  card.classList.add("booked");
  setTimeout(() => {
    renderGrid();
  }, 700);
}

/* Admin page renderer */
function renderAdmin() {
  const list = document.getElementById("bookings-list");
  const slotsEl = document.getElementById("admin-slots");
  const countEl = document.getElementById("admin-count");
  if (!list) return;
  const slots = loadSlots();
  const bookings = loadBookings();
  slotsEl.textContent = slots.length;
  countEl.textContent = bookings.length;

  if (bookings.length === 0) {
    list.innerHTML = '<div style="padding:14px">No bookings</div>';
    return;
  }

  let html =
    "<table><thead><tr><th>ID</th><th>Slot</th><th>Name</th><th>Start</th><th>End</th><th>Hours</th><th>Actions</th></tr></thead><tbody>";
  bookings.forEach((b) => {
    html += `<tr>
      <td>${b.id}</td>
      <td>Slot ${b.slotId + 1}</td>
      <td>${b.name}</td>
      <td>${new Date(b.start).toLocaleString()}</td>
      <td>${new Date(b.end).toLocaleString()}</td>
      <td>${b.hours}</td>
      <td><button class="admin-cancel" data-id="${b.id}">Cancel</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  list.innerHTML = html;

  list.querySelectorAll(".admin-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!confirm("Cancel this booking?")) return;
      cancelBooking(id);
      renderAdmin();
      alert("Booking cancelled");
    });
  });

  window.exportData = function () {
    const data = { slots: loadSlots(), bookings: loadBookings() };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smartparking_export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  window.clearAll = function () {
    saveBookings([]);
    const s = loadSlots().map(() => "available");
    saveSlots(s);
  };
}
