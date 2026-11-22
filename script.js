const INVITATION = {
  // Isi nama pengantin (cth. "Nana & Yusran"); jika kosong, tajuk majlis dipaparkan.
  couple: "",
  date: "2027-01-02T11:00:00+08:00",
  endDate: "2027-01-02T16:00:00+08:00",
  title: "Majlis Perkahwinan",
  venue: "Bunga Raya Resort Parit Buntar",
  dressCode: "Traditional & Elegant",
  schedule: [
    { time: "11:00 AM", label: "Majlis Bermula", icon: "fa-solid fa-door-open" },
    { time: "12:30 PM", label: "Ketibaan Pengantin", icon: "fa-regular fa-heart" },
    { time: "4:00 PM", label: "Majlis Selesai", icon: "fa-regular fa-circle-check" }
  ],
  address: "1, Jalan Pejabat, Kampung Permatang Tok Mamat\n34200 Parit Buntar, Perak",
  mapsUrl: "https://maps.google.com/?q=Bunga+Raya+Resort+Parit+Buntar+1+Jalan+Pejabat+Kampung+Permatang+Tok+Mamat+34200+Parit+Buntar+Perak",
  appleMapsUrl: "https://maps.apple.com/?q=Bunga+Raya+Resort+Parit+Buntar+1+Jalan+Pejabat+Kampung+Permatang+Tok+Mamat+34200+Parit+Buntar+Perak",
  contacts: [
    { name: "Syahriza Shaari", side: "Pihak Pengantin Lelaki", phone: "+60183244645" },
    { name: "Regina Shaari", side: "Pihak Pengantin Lelaki", phone: "+60124972179" }
  ],
  // Kosongkan untuk hantar RSVP melalui WhatsApp; atau letak URL borang (POST JSON).
  rsvpEndpoint: "https://script.google.com/macros/s/AKfycbwpRMLibzXLFUBWwBNGcIjdC_LbZtkpHBJU8H6ea3pRuZbZ61cXRDbwtwG4xc3dB7I0/exec",
  rsvpWhatsApp: "60129744056",
  // URL web app (cth. Google Apps Script) untuk kongsi ucapan: GET -> [{name, message}], POST -> simpan ucapan.
  wishesEndpoint: "https://script.google.com/macros/s/AKfycbwpRMLibzXLFUBWwBNGcIjdC_LbZtkpHBJU8H6ea3pRuZbZ61cXRDbwtwG4xc3dB7I0/exec",
  videoSrc: "invitation.mp4",
  venuePhoto: "bunga-raya.jpg"
};

const TIME_ZONE = "Asia/Kuala_Lumpur";
const MONTHS = ["JAN", "FEB", "MAC", "APR", "MEI", "JUN", "JUL", "OGOS", "SEP", "OKT", "NOV", "DIS"];

const $ = (selector) => document.querySelector(selector);
const video = $("#invitation-video");
const gate = $("#gate");
const popup = $("#popup");
const popupBody = $("#popup-body");
const toast = $("#toast");
let toastTimer;
let countdownTimer;
let closeTimer;
let wishObserver;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
}[character]));

const startDate = new Date(INVITATION.date);
const endDate = new Date(INVITATION.endDate);
const displayName = INVITATION.couple || INVITATION.title;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

const formatDate = (options) => new Intl.DateTimeFormat("ms-MY", { timeZone: TIME_ZONE, ...options }).format(startDate);
const formatTime = (date) => new Intl.DateTimeFormat("ms-MY", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(date).toUpperCase();
const fullDate = () => formatDate({ weekday: "long", day: "numeric", month: "long", year: "numeric" });

/* Placeholder shown until a video is supplied */
(function renderPlaceholder() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "numeric", year: "numeric" })
    .formatToParts(startDate).map((part) => [part.type, part.value]));
  const weekday = new Intl.DateTimeFormat("ms-MY", { timeZone: TIME_ZONE, weekday: "long" }).format(startDate);
  const dateText = `${parts.day} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
  $("#placeholder-day").textContent = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  $("#placeholder-date").textContent = dateText;
  $("#placeholder-names").textContent = displayName;
})();

if (INVITATION.videoSrc) {
  video.src = INVITATION.videoSrc;
  video.addEventListener("loadeddata", () => {
    video.classList.add("is-ready");
    $("#placeholder").classList.add("is-hidden");
  }, { once: true });
}

/* Opening gate */
$("#open-invitation").addEventListener("click", async () => {
  gate.classList.add("is-open");
  setTimeout(() => { gate.hidden = true; }, 1000);
  if (!INVITATION.videoSrc) return;
  try {
    await video.play();
  } catch {
    video.muted = true;
    try { await video.play(); } catch { showToast("Video tidak dapat dimainkan."); }
  }
});

/* Calendar helpers */
const toCalendarDate = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const escapeCalendar = (value) => String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const locationText = () => `${INVITATION.venue}, ${INVITATION.address.replace(/\n/g, ", ")}`;

function downloadCalendarFile() {
  const content = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wedding Invitation//MS", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${toCalendarDate(startDate)}@wedding-invitation`, `DTSTAMP:${toCalendarDate(new Date())}`,
    `DTSTART:${toCalendarDate(startDate)}`, `DTEND:${toCalendarDate(endDate)}`,
    `SUMMARY:${escapeCalendar(INVITATION.title)}`,
    `DESCRIPTION:${escapeCalendar(`Anda dijemput ke ${INVITATION.title}.`)}`,
    `LOCATION:${escapeCalendar(locationText())}`,
    "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "jemputan-perkahwinan.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function startCountdown() {
  const cells = popupBody.querySelectorAll("[data-count]");
  const done = $("#cal-done");
  const grid = $("#countdown");
  const tick = () => {
    const remaining = Math.max(0, startDate - Date.now());
    const values = {
      hari: Math.floor(remaining / 86400000),
      jam: Math.floor(remaining / 3600000) % 24,
      minit: Math.floor(remaining / 60000) % 60,
      saat: Math.floor(remaining / 1000) % 60
    };
    cells.forEach((cell) => {
      const text = String(values[cell.dataset.count]).padStart(2, "0");
      if (cell.textContent !== text) cell.textContent = text;
    });
    if (remaining === 0) {
      done.hidden = false;
      grid.hidden = true;
      clearInterval(countdownTimer);
    }
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* Wishes storage (per device; connect a backend to share between guests) */
const WISHES_KEY = "wedding-wishes";
function readWishes() {
  if (INVITATION.wishesEndpoint) return sharedWishes;
  try { return JSON.parse(localStorage.getItem(WISHES_KEY) || "[]"); } catch { return []; }
}

let sharedWishes = [];
async function refreshWishes() {
  const list = $("#wishes-list");
  if (!list) return;
  if (INVITATION.wishesEndpoint) {
    try {
      const response = await fetch(INVITATION.wishesEndpoint, { cache: "no-store" });
      const data = await response.json();
      if (Array.isArray(data)) sharedWishes = data.filter((wish) => wish && wish.name && wish.message).slice(0, 500);
    } catch { /* keep what is shown */ }
  }
  const target = $("#wishes-list");
  if (target) target.innerHTML = wishesMarkup();
}

function wishesMarkup() {
  const wishes = readWishes();
  if (!wishes.length) return `<p class="wishes__empty">Jadilah yang pertama menulis ucapan.</p>`;
  return `<p class="wishes__count">${wishes.length} Ucapan</p>
    <ol class="wishes">${wishes.map((wish) => `<li class="wish"><p class="wish__name">${escapeHtml(wish.name)}</p><p class="wish__msg">${escapeHtml(wish.message)}</p></li>`).join("")}</ol>`;
}

const mapsEmbedUrl = () => `https://maps.google.com/maps?q=${encodeURIComponent(`${INVITATION.venue} ${INVITATION.address.replace(/\n/g, " ")}`)}&z=15&output=embed`;

/* Popup content */
const POPUPS = {
  lokasi: {
    title: "",
    label: "Lokasi",
    render: () => `
      <section class="venue">
        <div class="venue__photo"><img src="${escapeHtml(INVITATION.venuePhoto)}" alt="${escapeHtml(INVITATION.venue)}" loading="lazy" onerror="this.parentNode.remove()"></div>
        <p class="eyebrow">${escapeHtml(INVITATION.title)}</p>
        <h4 class="venue__name">${escapeHtml(INVITATION.venue)}</h4>
        <dl class="venue__meta">
          <div><dt>Tarikh</dt><dd>${escapeHtml(fullDate())}</dd></div>
          <div><dt>Masa</dt><dd>${escapeHtml(formatTime(startDate))} - ${escapeHtml(formatTime(endDate))}</dd></div>
          ${INVITATION.dressCode ? `<div class="venue__dress"><dt>Kod Pakaian</dt><dd>${escapeHtml(INVITATION.dressCode)}</dd></div>` : ""}
        </dl>
        <div class="map"><iframe title="Peta lokasi majlis" src="${escapeHtml(mapsEmbedUrl())}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>
        <div class="btn-row">
          <a class="btn btn--solid" href="${escapeHtml(INVITATION.mapsUrl)}" target="_blank" rel="noopener noreferrer">Buka Google Maps</a>
          <a class="btn" href="${escapeHtml(INVITATION.appleMapsUrl)}" target="_blank" rel="noopener noreferrer">Apple Maps</a>
        </div>
      </section>`
  },
  kalendar: {
    title: "Kalendar",
    label: "Kalendar",
    render: () => `
      <section>
        <div class="section-head">
          <h4 class="section-title">Counting Down to Our Special Day</h4>
          <p class="section-sub">Two hearts, one promise, one beautiful journey ahead.</p>
        </div>
        <div class="countdown" id="countdown" aria-label="Kiraan detik">
          <div class="countdown__cell"><strong data-count="hari">00</strong><span>Hari</span></div>
          <div class="countdown__cell"><strong data-count="jam">00</strong><span>Jam</span></div>
          <div class="countdown__cell"><strong data-count="minit">00</strong><span>Minit</span></div>
          <div class="countdown__cell"><strong data-count="saat">00</strong><span>Saat</span></div>
        </div>
        <p class="cal__done" id="cal-done" hidden>Majlis telah berlangsung. Terima kasih atas doa dan kehadiran anda.</p>
        <p class="cal__date"><strong>${escapeHtml(fullDate())}</strong><br>${escapeHtml(formatTime(startDate))} - ${escapeHtml(formatTime(endDate))}</p>
        <div class="agenda">
          <h4 class="section-title agenda__title">Atur Cara Majlis</h4>
          <ol class="agenda__list">
            ${INVITATION.schedule.map((item) => `<li class="agenda__item"><span class="agenda__dot"><i class="${escapeHtml(item.icon)}" aria-hidden="true"></i></span><span class="agenda__time">${escapeHtml(item.time)}</span><span class="agenda__label">${escapeHtml(item.label)}</span></li>`).join("")}
          </ol>
        </div>
        <button class="btn btn--solid" type="button" id="apple-calendar" style="width:100%"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i>Download Calendar Event</button>
      </section>`,
    onOpen: () => {
      startCountdown();
      $("#apple-calendar").addEventListener("click", () => {
        downloadCalendarFile();
        showToast("Acara kalendar dimuat turun.");
      });
    }
  },
  hubungi: {
    title: "Hubungi",
    label: "Hubungi",
    render: () => `
      <div class="section-head"><p class="section-sub">Sebarang pertanyaan mengenai majlis, sila hubungi:</p></div>
      ${INVITATION.contacts.map((contact) => {
        const digits = contact.phone.replace(/\D/g, "");
        const text = encodeURIComponent("Assalamualaikum, saya ingin bertanya mengenai majlis perkahwinan anda.");
        return `
        <section class="card contact">
          <div>
            <p class="contact__side">${escapeHtml(contact.side)}</p>
            <h4 class="contact__name">${escapeHtml(contact.name)}</h4>
            <p class="contact__phone">${escapeHtml(contact.phone)}</p>
          </div>
          <div class="contact__actions">
            <a class="btn btn--solid btn--wa" href="https://wa.me/${digits}?text=${text}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i>Hubungi Pengantin</a>
            <a class="btn btn--icon" href="tel:+${digits}" aria-label="Telefon ${escapeHtml(contact.name)}"><i class="fa-solid fa-phone" aria-hidden="true"></i></a>
          </div>
        </section>`;
      }).join("")}`
  },
  kehadiran: {
    title: "Kehadiran",
    label: "Kehadiran",
    render: () => `
      <div class="section-head">
        <h4 class="section-title">Sahkan Kehadiran</h4>
        <p class="section-sub">Kehadiran anda amat kami hargai.</p>
      </div>
      <div class="card form-card" id="rsvp-card">
      <form id="rsvp-form" novalidate>
        <label class="field"><span class="field__label">Nama</span><input name="name" placeholder="Nama penuh" autocomplete="name" maxlength="80"></label>
        <fieldset class="choices">
          <legend>Kehadiran</legend>
          <div>
            <label><input type="radio" name="attendance" value="Hadir"><span>Hadir</span></label>
            <label><input type="radio" name="attendance" value="Tidak Hadir"><span>Tidak Hadir</span></label>
          </div>
        </fieldset>
        <label class="field field--select" id="pax-field"><span class="field__label">Bilangan Tetamu</span>
          <select name="pax">
            <option value="1">1 orang</option><option value="2">2 orang</option><option value="3">3 orang</option><option value="4">4 orang</option><option value="5">5 orang</option>
          </select>
        </label>
        <label class="field"><span class="field__label">Catatan (pilihan)</span><textarea name="notes" placeholder="Catatan tambahan" maxlength="200"></textarea></label>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="btn btn--solid" type="submit">Hantar</button>
      </form>
      <p class="form-note">Sila pastikan hanya hantar sekali sahaja borang RSVP ini. Sekiranya anda menghantar dua kali berturut-turut dari peranti yang sama, sistem akan disekat dan akan menjejaskan tetamu lain untuk mengisi borang. Terima kasih atas kerjasama anda.</p>
      </div>`,
    onOpen: () => {
      $("#rsvp-form").addEventListener("submit", submitRsvp);
      $("#rsvp-form").addEventListener("change", (event) => {
        if (event.target.name === "attendance") $("#pax-field").hidden = event.target.value !== "Hadir";
      });
      $("#pax-field").hidden = true;
      if (localStorage.getItem("rsvp-sent")) $("#form-error").textContent = "RSVP telah dihantar dari peranti ini.";
    }
  },
  ucapan: {
    title: "Ucapan",
    label: "Ucapan",
    render: () => `
      <div id="wishes-list">${wishesMarkup()}</div>
      <div class="card form-card wish-form" id="wish-form-wrap">
      <div class="section-head" style="margin-bottom:20px">
        <h4 class="section-title">Tulis Ucapan</h4>
        <p class="section-sub">Kongsikan doa dan ucapan anda.</p>
      </div>
      <form id="wishes-form" novalidate>
        <label class="field"><span class="field__label">Nama</span><input name="name" placeholder="Nama anda" autocomplete="name" maxlength="60"></label>
        <label class="field"><span class="field__label">Ucapan</span><textarea name="message" placeholder="Tulis ucapan anda di sini" maxlength="300"></textarea></label>
        <p class="form-error" id="form-error" role="alert"></p>
        <button class="btn btn--solid" type="submit">Hantar Ucapan</button>
      </form>
      </div>
      <button class="fab" id="write-wish" type="button"><i class="fa-solid fa-pen" aria-hidden="true"></i>Tulis Ucapan</button>`,
    onOpen: () => {
      $("#wishes-form").addEventListener("submit", submitWish);
      const fab = $("#write-wish");
      fab.addEventListener("click", () => {
        $("#wish-form-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => $("#wishes-form [name=name]").focus({ preventScroll: true }), 450);
      });
      // Hide the floating button while the form itself is on screen
      wishObserver = new IntersectionObserver(([entry]) => fab.classList.toggle("is-hidden", entry.isIntersecting), { root: popup, threshold: .15 });
      wishObserver.observe($("#wish-form-wrap"));
      refreshWishes();
      if (INVITATION.wishesEndpoint) countdownTimer = setInterval(refreshWishes, 15000);
    }
  }
};

const successMarkup = (title, text) => `<div class="success"><div class="success__icon"><i class="fa-solid fa-check" aria-hidden="true"></i></div><h4>${title}</h4><p>${text}</p></div>`;

async function submitRsvp(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#form-error");
  const submit = form.querySelector("[type=submit]");
  if (submit.disabled) return;
  const data = Object.fromEntries(new FormData(form));
  const name = (data.name || "").trim();
  const notes = (data.notes || "").trim();
  if (!name || !data.attendance) {
    error.textContent = "Sila isi nama dan pilih kehadiran.";
    return;
  }
  if (localStorage.getItem("rsvp-sent")) {
    error.textContent = "RSVP telah dihantar dari peranti ini.";
    return;
  }
  error.textContent = "";
  const label = submit.innerHTML;
  submit.disabled = true;
  submit.innerHTML = `<span class="spinner"></span>Menghantar...`;
  const payload = { name, attendance: data.attendance };
  if (notes) payload.notes = notes;
  if (data.attendance === "Hadir") payload.pax = Math.min(5, Number(data.pax) || 1);
  if (INVITATION.rsvpEndpoint) {
    try {
      const response = await fetch(INVITATION.rsvpEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(response.status);
    } catch {
      error.textContent = "Gagal menghantar. Sila cuba lagi.";
      submit.disabled = false;
      submit.innerHTML = label;
      return;
    }
  } else {
    const text = `RSVP ${INVITATION.title}\nNama: ${name}\nKehadiran: ${data.attendance}${payload.pax ? `\nBilangan: ${payload.pax} orang` : ""}${notes ? `\nCatatan: ${notes}` : ""}`;
    window.open(`https://wa.me/${INVITATION.rsvpWhatsApp}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }
  localStorage.setItem("rsvp-sent", "1");
  $("#rsvp-card").innerHTML = successMarkup("Terima Kasih!", "Kehadiran anda telah direkodkan. Semoga bertemu pada hari bahagia kami.");
  showToast("Terima kasih! Kehadiran anda telah direkodkan.");
}

async function submitWish(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("[type=submit]");
  if (submit.disabled) return;
  const data = new FormData(form);
  const name = String(data.get("name")).trim();
  const message = String(data.get("message")).trim();
  if (!name || !message) {
    $("#form-error").textContent = "Sila isi nama dan ucapan.";
    return;
  }
  const label = submit.innerHTML;
  if (INVITATION.wishesEndpoint) {
    submit.disabled = true;
    submit.innerHTML = `<span class="spinner"></span>Menghantar...`;
    try {
      const response = await fetch(INVITATION.wishesEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ name, message }) });
      if (!response.ok) throw new Error(response.status);
    } catch {
      $("#form-error").textContent = "Gagal menghantar. Sila cuba lagi.";
      submit.disabled = false;
      submit.innerHTML = label;
      return;
    }
    sharedWishes.unshift({ name, message });
    submit.disabled = false;
    submit.innerHTML = label;
  } else {
    const wishes = readWishes();
    wishes.unshift({ name, message });
    localStorage.setItem(WISHES_KEY, JSON.stringify(wishes.slice(0, 50)));
  }
  form.reset();
  $("#form-error").textContent = "";
  $("#wishes-list").innerHTML = wishesMarkup();
  showToast("Terima kasih! Ucapan anda telah disimpan.");
}
/* Popup open / close */
const navItems = document.querySelectorAll("[data-popup]");
const setActive = (name) => navItems.forEach((item) => {
  const active = item.dataset.popup === name;
  item.classList.toggle("is-active", active);
  if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
});

function openPopup(name) {
  const config = POPUPS[name];
  clearTimeout(closeTimer);
  clearInterval(countdownTimer);
  wishObserver?.disconnect();
  $("#popup-title").textContent = config.title;
  popup.setAttribute("aria-label", config.label);
  popup.dataset.view = name;
  popupBody.innerHTML = config.render();
  popup.scrollTop = 0;
  popup.hidden = false;
  popup.getBoundingClientRect();
  popup.classList.add("is-open");
  setActive(name);
  config.onOpen?.();
  popup.querySelector("[data-close]").focus({ preventScroll: true });
}

function closePopup() {
  clearInterval(countdownTimer);
  wishObserver?.disconnect();
  setActive(null);
  popup.classList.remove("is-open");
  closeTimer = setTimeout(() => { popup.hidden = true; popupBody.innerHTML = ""; }, 320);
}

navItems.forEach((button) => {
  button.addEventListener("click", () => {
    const name = button.dataset.popup;
    if (popup.classList.contains("is-open") && popup.dataset.view === name) closePopup();
    else openPopup(name);
  });
});
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", closePopup));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !popup.hidden) closePopup();
});


