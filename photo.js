const PHOTO = {
  // The backend URL is set once in GUEST_CONFIG (guest.js).
  photoEndpoint: window.GUEST_CONFIG?.endpoint || "",
  maxPhotos: 10,
  maxSide: 1600,
  quality: 0.82,
  maxBytes: 4 * 1024 * 1024
};

// Gentle, wedding-friendly looks. Each step is a CSS filter function so the live preview
// (CSS) and the saved photo (canvas) produce the same result.
const FILTERS = [
  { id: "normal", label: "Normal", steps: [] },
  { id: "bw", label: "B&W", steps: [["grayscale", 1], ["contrast", 1.08], ["brightness", 1.03]] },
  { id: "light", label: "Light", steps: [["brightness", 1.08], ["contrast", 0.92], ["saturate", 0.92]] },
  { id: "canon", label: "Canon", steps: [["contrast", 1.06], ["saturate", 1.1], ["sepia", 0.06], ["brightness", 1.02]] },
  { id: "kodak", label: "Kodak", steps: [["sepia", 0.2], ["saturate", 1.18], ["contrast", 1.05], ["brightness", 1.03]] }
];
const cssFilter = (filter) => filter.steps.map(([fn, v]) => `${fn}(${v})`).join(" ") || "none";
const filterById = (id) => FILTERS.find((f) => f.id === id) || FILTERS[0];

const $ = (s) => document.querySelector(s);
const TIME_ZONE = "Asia/Kuala_Lumpur";
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
};
const randomId = (n) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};

const state = {
  name: store.get("photo-guest") || "",
  session: store.get("photo-session") || "",
  uploaded: Number(store.get("photo-uploaded") || 0),
  photos: [], // { id, blob, url, done }
  filter: "normal",
  facing: "environment",
  stream: null,
  shot: null, // { raw: Blob, filter }
  uploading: false,
  screen: null
};
if (!state.session) { state.session = randomId(16); store.set("photo-session", state.session); }

let toastTimer;
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

const total = () => state.uploaded + state.photos.filter((p) => !p.done).length;
const remaining = () => Math.max(0, PHOTO.maxPhotos - total());

/* ---------- Screens & history (shared by the whole guest site) ---------- */
const SCREENS = ["camera", "preview", "review", "success", "gallery"];
const PHOTO_SCREENS = ["review", "success"];
const TITLES = { review: "Be Our Photographer", success: "Be Our Photographer" };
function show(name) {
  // The shared gallery is the landing screen of the guest site.
  if (!SCREENS.includes(name)) name = "gallery";
  if (name !== "camera") stopCamera();
  if (state.screen && state.screen !== name) window.Guest?.leave?.(state.screen);
  state.screen = name;
  SCREENS.forEach((s) => { $(`#screen-${s}`).hidden = s !== name; });
  const isCam = name === "camera" || name === "preview";
  document.body.classList.toggle("is-camera", isCam);
  $("#pg-top").hidden = name === "gallery";
  $("#top-title").textContent = TITLES[name] || "Hedry & Shafiqah";
  $("#top-gallery").hidden = !PHOTO_SCREENS.includes(name);
  $("#top-gallery").textContent = "Galeri";
  if (!isCam) window.scrollTo(0, 0);
  ({ camera: startCamera, review: renderReview, gallery: openGallery })[name]?.();
  window.Guest?.enter?.(name);
}

function go(name, replace = false) {
  history[replace ? "replaceState" : "pushState"]({ screen: name }, "", `#${name}`);
  show(name);
}

window.addEventListener("popstate", (event) => {
  if (!$("#lightbox").hidden) { closeLightbox(false); return; }
  const name = event.state?.screen || "gallery";
  if (state.screen === "preview" && name === "camera") state.shot = null;
  show(name);
});

document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
$("#top-gallery").addEventListener("click", () => go("gallery"));
$("#gallery-cta").addEventListener("click", () => go("camera"));

/* ---------- Camera ---------- */
const video = $("#cam-video");
let thumbTimer;

function updateCounters() {
  const count = `${total()}/${PHOTO.maxPhotos}`;
  $("#cam-count").textContent = count;
  $("#cam-tray-count").textContent = state.photos.filter((p) => !p.done).length;
  const last = [...state.photos].reverse().find((p) => !p.done);
  $("#cam-tray").style.backgroundImage = last ? `url("${last.url}")` : "";
  $("#cam-shutter").disabled = remaining() === 0;
  $("#cam-pick").style.visibility = remaining() === 0 ? "hidden" : "";
}

function camState(title, text, { retry = true, file = true } = {}) {
  $("#cam-state").hidden = !title;
  if (!title) return;
  $("#cam-state-title").textContent = title;
  $("#cam-state-text").textContent = text;
  $("#cam-retry").hidden = !retry;
  $("#cam-file-label").hidden = !file;
}

async function startCamera() {
  updateCounters();
  buildFilterChips($("#cam-filters"), (id) => { state.filter = id; video.style.filter = cssFilter(filterById(id)); });
  video.style.filter = cssFilter(filterById(state.filter));
  if (state.stream) return;
  if (remaining() === 0) {
    camState("Had foto dicapai", `Anda telah mencapai had ${PHOTO.maxPhotos} foto. Sila muat naik foto anda.`, { retry: false, file: false });
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    camState("Kamera tidak disokong", "Pelayar ini tidak menyokong kamera. Anda masih boleh memilih foto dari peranti.", { retry: false });
    return;
  }
  camState("Membuka kamera...", "Sila benarkan akses kamera apabila diminta.", { retry: false, file: false });
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: state.facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }
    });
    if (state.screen !== "camera") { stream.getTracks().forEach((t) => t.stop()); return; }
    state.stream = stream;
    camState("");
    video.srcObject = stream;
    await video.play().catch(() => {});
    const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
    const facing = settings.facingMode || state.facing;
    $("#cam-view").classList.toggle("is-mirrored", facing === "user");
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    $("#cam-switch").hidden = devices.filter((d) => d.kind === "videoinput").length < 2;
    thumbTimer = setInterval(drawLiveThumbs, 500);
  } catch (error) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      camState("Akses kamera ditolak", "Benarkan akses kamera dalam tetapan pelayar anda, kemudian cuba lagi.");
    } else if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      camState("Kamera tidak ditemui", "Tiada kamera dikesan pada peranti ini.", { retry: false });
    } else {
      camState("Kamera tidak dapat dibuka", "Pastikan tiada aplikasi lain sedang menggunakan kamera, kemudian cuba lagi.");
    }
  }
}

function stopCamera() {
  clearInterval(thumbTimer);
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
  video.srcObject = null;
}

$("#cam-retry").addEventListener("click", () => { stopCamera(); startCamera(); });
$("#cam-close").addEventListener("click", () => go(state.photos.some((p) => !p.done) ? "review" : "gallery"));
$("#cam-tray").addEventListener("click", () => go("review"));
$("#cam-switch").addEventListener("click", async () => {
  state.facing = state.facing === "user" ? "environment" : "user";
  stopCamera();
  await startCamera();
});

document.addEventListener("visibilitychange", () => {
  if (state.screen !== "camera") return;
  if (document.hidden) stopCamera(); else startCamera();
});
window.addEventListener("pagehide", stopCamera);

$("#cam-shutter").addEventListener("click", async () => {
  if (!state.stream || !video.videoWidth || remaining() === 0) return;
  const flash = $("#cam-flash");
  flash.classList.remove("is-on");
  void flash.offsetWidth;
  flash.classList.add("is-on");
  // Crop to the visible frame so the photo matches what the guest saw.
  const view = $("#cam-view").getBoundingClientRect();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const target = view.width / view.height;
  let sw = vw;
  let sh = vw / target;
  if (sh > vh) { sh = vh; sw = vh * target; }
  const scale = Math.min(1, PHOTO.maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d");
  if ($("#cam-view").classList.contains("is-mirrored")) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  const raw = await toBlob(canvas, 0.92);
  openPreview(raw, state.filter);
});

$("#cam-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { showToast("Sila pilih foto JPG, PNG atau WEBP."); return; }
  if (file.size > 25 * 1024 * 1024) { showToast("Foto terlalu besar."); return; }
  try {
    const img = await loadImage(file);
    const canvas = drawScaled(img, null);
    openPreview(await toBlob(canvas, 0.92), state.filter);
  } catch {
    showToast("Foto tidak dapat dibuka.");
  }
});

/* ---------- Filters ---------- */
function buildFilterChips(container, onPick, source) {
  container.innerHTML = "";
  FILTERS.forEach((f) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter";
    button.setAttribute("role", "radio");
    button.dataset.filter = f.id;
    button.setAttribute("aria-checked", String(f.id === (source ? state.shot.filter : state.filter)));
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    canvas.style.filter = cssFilter(f);
    button.append(canvas, f.label);
    button.addEventListener("click", () => {
      container.querySelectorAll(".filter").forEach((b) => b.setAttribute("aria-checked", String(b === button)));
      onPick(f.id);
    });
    container.append(button);
    if (source) drawCover(canvas, source, false);
  });
}

function drawCover(canvas, source, mirror) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) return;
  const side = Math.min(sw, sh);
  const ctx = canvas.getContext("2d");
  ctx.save();
  if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawLiveThumbs() {
  if (!video.videoWidth) return;
  const mirror = $("#cam-view").classList.contains("is-mirrored");
  $("#cam-filters").querySelectorAll("canvas").forEach((c) => drawCover(c, video, mirror));
}

const supportsCtxFilter = (() => {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!("filter" in ctx)) return false;
  ctx.filter = "grayscale(1)";
  return ctx.filter === "grayscale(1)";
})();

// Pixel fallback that follows the CSS filter-effects formulas (used where canvas filter is unsupported, e.g. older Safari).
function applyStepsToPixels(ctx, w, h, steps) {
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const matrices = steps.map(([fn, a]) => {
    if (fn === "grayscale") { const g = 1 - a; return [0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g, 0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g, 0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g]; }
    if (fn === "sepia") { const s = 1 - a; return [0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s]; }
    if (fn === "saturate") return [0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a, 0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a, 0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a];
    return null;
  });
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i]; let g = d[i + 1]; let b = d[i + 2];
    for (let s = 0; s < steps.length; s += 1) {
      const [fn, a] = steps[s];
      const m = matrices[s];
      if (m) {
        const nr = m[0] * r + m[1] * g + m[2] * b;
        const ng = m[3] * r + m[4] * g + m[5] * b;
        const nb = m[6] * r + m[7] * g + m[8] * b;
        r = clamp(nr); g = clamp(ng); b = clamp(nb);
      } else if (fn === "brightness") {
        r = clamp(r * a); g = clamp(g * a); b = clamp(b * a);
      } else if (fn === "contrast") {
        const o = 127.5 * (1 - a);
        r = clamp(r * a + o); g = clamp(g * a + o); b = clamp(b * a + o);
      }
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(image, 0, 0);
}

/* ---------- Image helpers ---------- */
const toBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", quality);
});

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load")); };
    img.src = url;
  });
}

function drawScaled(img, filter) {
  const scale = Math.min(1, PHOTO.maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  const steps = filter ? filter.steps : [];
  if (steps.length && supportsCtxFilter) ctx.filter = cssFilter(filter);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (steps.length && !supportsCtxFilter) applyStepsToPixels(ctx, canvas.width, canvas.height, steps);
  return canvas;
}

/* ---------- Preview ---------- */
let previewUrl;
async function openPreview(raw, filterId) {
  state.shot = { raw, filter: filterId };
  go("preview");
  const img = await loadImage(raw);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(raw);
  const preview = $("#preview-img");
  preview.src = previewUrl;
  preview.style.filter = cssFilter(filterById(filterId));
  buildFilterChips($("#preview-filters"), (id) => {
    state.shot.filter = id;
    preview.style.filter = cssFilter(filterById(id));
  }, img);
}

$("#preview-retake").addEventListener("click", () => { state.shot = null; history.back(); });

$("#preview-keep").addEventListener("click", async () => {
  if (!state.shot) return;
  const button = $("#preview-keep");
  button.disabled = true;
  try {
    const img = await loadImage(state.shot.raw);
    let blob = await toBlob(drawScaled(img, filterById(state.shot.filter)), PHOTO.quality);
    if (blob.size > PHOTO.maxBytes) blob = await toBlob(drawScaled(img, filterById(state.shot.filter)), 0.6);
    state.photos.push({ id: randomId(12), blob, url: URL.createObjectURL(blob), done: false });
    state.filter = state.shot.filter;
    state.shot = null;
    showToast(`Foto disimpan (${total()}/${PHOTO.maxPhotos})`);
    if (remaining() === 0) go("review", true); else history.back();
  } catch {
    showToast("Foto tidak dapat disimpan. Sila cuba lagi.");
  } finally {
    button.disabled = false;
  }
});

/* ---------- Review & upload ---------- */
function renderReview() {
  const pending = state.photos.filter((p) => !p.done);
  $("#review-count").textContent = `${total()}/${PHOTO.maxPhotos} foto`;
  const nameInput = $("#review-name");
  if (!nameInput.value) nameInput.value = state.name;
  nameInput.disabled = state.uploading;
  $("#review-name-field").hidden = pending.length === 0;
  $("#review-empty").hidden = pending.length > 0;
  $("#review-grid").innerHTML = state.photos.map((p) => `
    <div class="review-item${p.done ? " is-done" : ""}" data-id="${p.id}">
      <img src="${p.url}" alt="Foto anda">
      ${p.done || state.uploading ? "" : `<button class="review-item__remove" type="button" aria-label="Buang foto"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`}
    </div>`).join("");
  $("#upload-btn").hidden = pending.length === 0;
  $("#upload-btn").disabled = state.uploading;
  $("#review-more").hidden = remaining() === 0 || state.uploading;
}

$("#review-grid").addEventListener("click", (event) => {
  const button = event.target.closest(".review-item__remove");
  if (!button || state.uploading) return;
  const id = button.closest(".review-item").dataset.id;
  const photo = state.photos.find((p) => p.id === id);
  URL.revokeObjectURL(photo.url);
  state.photos = state.photos.filter((p) => p.id !== id);
  renderReview();
});

$("#review-more").addEventListener("click", () => go("camera"));
$("#success-more").addEventListener("click", () => go(remaining() ? "camera" : "gallery"));

async function api(body) {
  if (!PHOTO.photoEndpoint) throw Object.assign(new Error("setup"), { code: "setup" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(PHOTO.photoEndpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await response.json();
    if (!data.ok) throw Object.assign(new Error(data.error), { code: data.error });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function uploadToCloudinary(photo, sig, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", photo.blob, `${photo.id}.jpg`);
    form.append("api_key", sig.apiKey);
    form.append("signature", sig.signature);
    Object.entries(sig.params).forEach(([k, v]) => form.append(k, v));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${encodeURIComponent(sig.cloud)}/image/upload`);
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.public_id) resolve(data); else reject(new Error("upload"));
      } catch { reject(new Error("upload")); }
    };
    xhr.onerror = xhr.ontimeout = () => reject(new Error("network"));
    xhr.send(form);
  });
}

const UPLOAD_ERRORS = {
  setup: "Muat naik belum disediakan. Sila hubungi pengantin.",
  limit: `Had ${PHOTO.maxPhotos} foto bagi peranti ini telah dicapai.`,
  busy: "Ramai tetamu sedang memuat naik. Sila cuba lagi sebentar.",
  invalid: "Foto tidak dapat disahkan. Sila cuba lagi."
};

const UPLOAD_LABEL = `<i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>Upload My Photos`;

$("#upload-btn").addEventListener("click", async () => {
  if (state.uploading) return;
  const queue = state.photos.filter((p) => !p.done);
  if (!queue.length) return;
  if (!navigator.onLine) { $("#review-error").textContent = "Tiada sambungan internet. Sila cuba lagi."; return; }
  const name = $("#review-name").value.trim().replace(/\s+/g, " ");
  if (name.length < 2) { $("#review-error").textContent = "Sila isi nama anda."; $("#review-name").focus(); return; }
  state.name = name;
  store.set("photo-guest", name);
  state.uploading = true;
  $("#review-error").textContent = "";
  $("#upload-box").hidden = false;
  $("#upload-btn").innerHTML = `<span class="spinner"></span>Memuat naik...`;
  renderReview();
  const setProgress = (index, fraction) => {
    $("#upload-bar").style.width = `${Math.round(((index + fraction) / queue.length) * 100)}%`;
    $("#upload-text").textContent = `Memuat naik ${Math.min(index + 1, queue.length)} daripada ${queue.length} foto...`;
  };
  try {
    for (let i = 0; i < queue.length; i += 1) {
      const photo = queue[i];
      setProgress(i, 0);
      if (photo.blob.size > PHOTO.maxBytes || photo.blob.type !== "image/jpeg") throw new Error("invalid");
      const sig = await api({ action: "sign", name: state.name, session: state.session, photo: photo.id });
      const result = await uploadToCloudinary(photo, sig, (f) => setProgress(i, f * 0.95));
      await api({
        action: "confirm", name: state.name, session: state.session,
        publicId: result.public_id, version: result.version, signature: result.signature,
        width: result.width, height: result.height
      });
      photo.done = true;
      state.uploaded += 1;
      store.set("photo-uploaded", String(state.uploaded));
      setProgress(i, 1);
      renderReview();
    }
    const sent = state.photos.filter((p) => p.done).length;
    state.photos.forEach((p) => URL.revokeObjectURL(p.url));
    state.photos = [];
    state.uploading = false;
    $("#upload-box").hidden = true;
    $("#upload-btn").innerHTML = UPLOAD_LABEL;
    $("#success-title").textContent = `Terima kasih, ${state.name}!`;
    $("#success-text").textContent = `${sent} foto anda telah dimuat naik ke galeri tetamu.`;
    $("#success-more").hidden = remaining() === 0;
    galleryReset = true;
    go("success", true);
  } catch (error) {
    state.uploading = false;
    $("#upload-btn").innerHTML = `<i class="fa-solid fa-rotate-right" aria-hidden="true"></i>Cuba Semula`;
    $("#upload-text").textContent = "Muat naik terhenti. Foto yang telah berjaya tidak akan dimuat naik semula.";
    $("#review-error").textContent = UPLOAD_ERRORS[error.code] || "Gagal memuat naik. Semak sambungan internet dan cuba lagi.";
    renderReview();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (state.photos.some((p) => !p.done)) { event.preventDefault(); event.returnValue = ""; }
});

/* ---------- Gallery ---------- */
const gallery = { items: [], page: 0, hasMore: true, loading: false, cloud: "", cols: 0, tab: "all" };
let galleryReset = false;
const isMine = (item) => item.id.startsWith(`wedding-guests/${state.session}_`);
const galleryView = () => (gallery.tab === "mine" ? gallery.items.filter(isMine) : gallery.items);
const imageUrl = (id, width) => `https://res.cloudinary.com/${encodeURIComponent(gallery.cloud)}/image/upload/c_limit,w_${width},f_auto,q_auto/${id.split("/").map(encodeURIComponent).join("/")}`;
const formatDate = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ms-MY", { timeZone: TIME_ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
};
const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

function columnCount() {
  const w = $("#masonry").clientWidth || window.innerWidth;
  return w >= 900 ? 4 : w >= 600 ? 3 : 2;
}

function layoutMasonry(fresh) {
  const masonry = $("#masonry");
  const cols = columnCount();
  if (fresh || cols !== gallery.cols) {
    gallery.cols = cols;
    masonry.innerHTML = Array.from({ length: cols }, () => `<div class="masonry__col" data-h="0"></div>`).join("");
    galleryView().forEach((item, index) => placeItem(item, index));
  }
}

function placeItem(item, index) {
  const cols = [...$("#masonry").children];
  const target = cols.reduce((a, b) => (Number(b.dataset.h) < Number(a.dataset.h) ? b : a));
  const ratio = item.w && item.h ? item.h / item.w : 1.25;
  target.dataset.h = String(Number(target.dataset.h) + ratio + 0.12);
  const figure = document.createElement("figure");
  figure.className = "g-item";
  figure.innerHTML = `
    <button type="button" data-index="${index}" aria-label="Lihat foto oleh ${escapeHtml(item.name)}">
      <img src="${imageUrl(item.id, 400)}" srcset="${imageUrl(item.id, 400)} 400w, ${imageUrl(item.id, 800)} 800w"
        sizes="(min-width: 900px) 25vw, (min-width: 600px) 33vw, 50vw" ${item.w && item.h ? `width="${item.w}" height="${item.h}"` : ""}
        loading="lazy" decoding="async" alt="Foto oleh ${escapeHtml(item.name)}">
      <span class="g-item__by">By ${escapeHtml(item.name)}</span>
    </button>`;
  const img = figure.querySelector("img");
  const loaded = () => img.classList.add("is-loaded");
  if (img.complete) loaded(); else img.addEventListener("load", loaded, { once: true });
  img.addEventListener("error", loaded, { once: true });
  target.append(figure);
}

async function loadGalleryPage() {
  if (gallery.loading || !gallery.hasMore) return;
  if (!PHOTO.photoEndpoint) {
    gallery.hasMore = false;
    $("#gallery-empty").hidden = false;
    $("#gallery-empty").textContent = "Galeri belum disediakan.";
    return;
  }
  gallery.loading = true;
  let ok = false;
  $("#gallery-loader").hidden = false;
  $("#gallery-end").textContent = "";
  try {
    const response = await fetch(`${PHOTO.photoEndpoint}?page=${gallery.page}`, { cache: "no-store" });
    const data = await response.json();
    gallery.cloud = data.cloud || gallery.cloud;
    const known = new Set(gallery.items.map((i) => i.id));
    const fresh = (data.items || []).filter((i) => i && i.id && !known.has(i.id));
    if (!gallery.cols) layoutMasonry(true);
    fresh.forEach((item) => {
      gallery.items.push(item);
      if (gallery.tab === "all" || isMine(item)) placeItem(item, galleryView().length - 1);
    });
    gallery.page += 1;
    gallery.hasMore = Boolean(data.hasMore);
    gallery.total = data.total || gallery.total;
    ok = true;
    if (!gallery.hasMore && galleryView().length) $("#gallery-end").textContent = "Itu sahaja buat masa ini";
  } catch {
    $("#gallery-end").textContent = "Galeri tidak dapat dimuatkan. Cuba muat semula halaman.";
  } finally {
    gallery.loading = false;
    $("#gallery-loader").hidden = true;
    updateGalleryMeta();
  }
  // Keep fetching while the visible list is too short to reach the sentinel (e.g. "My uploads").
  if (ok && gallery.hasMore && state.screen === "gallery" && $("#gallery-sentinel").getBoundingClientRect().top < window.innerHeight + 600) loadGalleryPage();
}

function updateGalleryMeta() {
  const count = galleryView().length;
  $("#gallery-total").textContent = gallery.tab === "mine" ? (count ? `${count} foto` : "") : (gallery.total ? `${gallery.total} foto` : "");
  const empty = !gallery.loading && !gallery.hasMore && count === 0 && PHOTO.photoEndpoint;
  $("#gallery-empty").hidden = !empty;
  if (empty) $("#gallery-empty").textContent = gallery.tab === "mine" ? "Foto yang anda muat naik akan dipaparkan di sini." : "Belum ada foto. Jadilah yang pertama berkongsi!";
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  gallery.tab = tab.dataset.tab;
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("is-active", t === tab);
    t.setAttribute("aria-selected", String(t === tab));
  });
  layoutMasonry(true);
  updateGalleryMeta();
  if (gallery.hasMore) loadGalleryPage();
}));

const sentinelObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && state.screen === "gallery") loadGalleryPage();
}, { rootMargin: "600px 0px" });
sentinelObserver.observe($("#gallery-sentinel"));

function openGallery() {
  if (galleryReset || !gallery.items.length) {
    galleryReset = false;
    Object.assign(gallery, { items: [], page: 0, hasMore: true, cols: 0, total: 0 });
    $("#masonry").innerHTML = "";
    loadGalleryPage();
  }
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.screen === "gallery" && gallery.items.length) layoutMasonry(false); }, 150);
});

/* ---------- Lightbox ---------- */
let lightboxIndex = 0;
function renderLightbox() {
  const item = galleryView()[lightboxIndex];
  const img = $("#lb-img");
  img.src = imageUrl(item.id, 1600);
  img.alt = `Foto oleh ${item.name}`;
  $("#lb-name").textContent = item.name;
  $("#lb-date").textContent = formatDate(item.time);
  $("#lb-prev").disabled = lightboxIndex === 0;
  $("#lb-next").disabled = lightboxIndex >= galleryView().length - 1;
  if (lightboxIndex >= galleryView().length - 3) loadGalleryPage();
}

function openLightbox(index) {
  lightboxIndex = index;
  renderLightbox();
  $("#lightbox").hidden = false;
  document.body.classList.add("is-locked");
  history.pushState({ screen: "gallery", lightbox: true }, "", "#gallery");
  $("#lb-close").focus({ preventScroll: true });
}

function closeLightbox(viaButton) {
  $("#lightbox").hidden = true;
  $("#lb-img").removeAttribute("src");
  document.body.classList.remove("is-locked");
  if (viaButton) history.back();
}

const step = (delta) => {
  const next = lightboxIndex + delta;
  if (next < 0 || next >= galleryView().length) return;
  lightboxIndex = next;
  renderLightbox();
};

$("#masonry").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-index]");
  if (button) openLightbox(Number(button.dataset.index));
});
$("#lb-close").addEventListener("click", () => closeLightbox(true));
$("#lb-prev").addEventListener("click", () => step(-1));
$("#lb-next").addEventListener("click", () => step(1));
document.addEventListener("keydown", (event) => {
  if ($("#lightbox").hidden) return;
  if (event.key === "Escape") closeLightbox(true);
  if (event.key === "ArrowLeft") step(-1);
  if (event.key === "ArrowRight") step(1);
});
let touchX = null;
$("#lightbox").addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
$("#lightbox").addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
});

/* ---------- Start ---------- */
// Shared with guest.js.
Object.assign(window, { state, store, randomId });

(function init() {
  const hash = location.hash.slice(1);
  let start = ["camera", "gallery"].includes(hash) ? hash : "gallery";
  // Keep the gallery underneath so the first Back press returns to it.
  history.replaceState({ screen: "gallery" }, "", "#gallery");
  if (start === "gallery") show("gallery"); else go(start);
})();
