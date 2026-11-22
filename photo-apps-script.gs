// Guest Experience backend (guest.html) - a SEPARATE Apps Script project from google-apps-script.gs.
// Handles "Be Our Photographer" uploads (Cloudinary).
//
// Setup (once):
// 1. script.google.com > New project, paste this file.
// 2. Project Settings > Script properties, add:
//      CLOUDINARY_CLOUD_NAME   (Cloudinary Dashboard)
//      CLOUDINARY_API_KEY      (Cloudinary Dashboard)
//      CLOUDINARY_API_SECRET   (Cloudinary Dashboard - never put this in the website)
// 3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
//    Paste the /exec URL into GUEST_CONFIG.endpoint in guest.js.
//
// Photos: the browser asks this script for a one-time signature, uploads the photo straight to
// Cloudinary, then confirms. Each confirmed photo is logged in the "Foto" tab of the
// wedding Sheet. Change a row's Status from "Approved" to "Hidden" to remove it from
// the gallery.

const SHEET_ID = "1PwsnW7ZYFk70JJaBjxUKvMLe5R0GGxfPcFYTrSbJlgQ";
const TAB = "Foto";
const HEADERS = ["Masa", "Nama", "Public ID", "Lebar", "Tinggi", "Status", "Sesi"];
const COL = { time: 0, name: 1, id: 2, w: 3, h: 4, status: 5, session: 6 };
const FOLDER = "wedding-guests";
const MAX_PER_GUEST = 10;
const MAX_SIGNS_PER_MINUTE = 240; // across all guests
const PAGE_SIZE = 24;

const props = () => PropertiesService.getScriptProperties();
const json = (data) => ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);

function sheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let s = ss.getSheetByName(TAB);
  if (!s) {
    s = ss.insertSheet(TAB);
    s.appendRow(HEADERS);
    s.setFrozenRows(1);
  }
  return s;
}

function clean(v, max) {
  v = String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
  return /^[=+\-@]/.test(v) ? "'" + v : v; // block spreadsheet formula injection
}

const validId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(v);

function sha1Hex(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, text, Utilities.Charset.UTF_8)
    .map((b) => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
}

// Cloudinary signature: sorted "key=value" pairs joined with "&", followed by the API secret.
function signParams(params, secret) {
  const base = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return sha1Hex(base + secret);
}

function rows() {
  const values = sheet().getDataRange().getValues();
  return values.slice(1);
}

/* ---------- GET: approved gallery, newest first ---------- */
function doGet(e) {
  const page = Math.max(0, parseInt((e && e.parameter && e.parameter.page) || "0", 10) || 0);
  const cache = CacheService.getScriptCache();
  const key = "gallery-" + page;
  const cached = cache.get(key);
  if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

  const approved = rows().filter((r) => r[COL.status] === "Approved" && r[COL.id]).reverse();
  const items = approved.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r) => ({
    id: r[COL.id],
    name: String(r[COL.name]).replace(/^'/, ""),
    time: r[COL.time] instanceof Date ? r[COL.time].toISOString() : String(r[COL.time]),
    w: Number(r[COL.w]) || 0,
    h: Number(r[COL.h]) || 0
  }));
  const body = JSON.stringify({
    cloud: props().getProperty("CLOUDINARY_CLOUD_NAME"),
    items,
    total: approved.length,
    hasMore: (page + 1) * PAGE_SIZE < approved.length
  });
  cache.put(key, body, 20);
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- POST: sign / confirm ---------- */
function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad-request" }); }
  if (data.action === "sign") return sign(data);
  if (data.action === "confirm") return confirm(data);
  return json({ ok: false, error: "bad-request" });
}

function sign(d) {
  const name = clean(d.name, 60);
  if (!name || !validId(d.session) || !validId(d.photo)) return json({ ok: false, error: "bad-request" });

  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const minuteKey = "signs-" + Math.floor(Date.now() / 60000);
    const used = Number(cache.get(minuteKey) || 0);
    if (used >= MAX_SIGNS_PER_MINUTE) return json({ ok: false, error: "busy" });

    // A device may hold at most MAX_PER_GUEST photos: confirmed rows plus signatures issued recently.
    const pendingKey = "pending-" + d.session;
    const pending = JSON.parse(cache.get(pendingKey) || "[]");
    const prefix = FOLDER + "/" + d.session + "_";
    const confirmed = rows().filter((r) => r[COL.session] === d.session).map((r) => String(r[COL.id]).replace(prefix, ""));
    const ids = Array.from(new Set(confirmed.concat(pending)));
    if (ids.indexOf(d.photo) === -1 && ids.length >= MAX_PER_GUEST) return json({ ok: false, error: "limit" });

    if (pending.indexOf(d.photo) === -1) pending.push(d.photo);
    cache.put(pendingKey, JSON.stringify(pending), 6 * 3600);
    cache.put(minuteKey, String(used + 1), 120);
  } finally {
    lock.releaseLock();
  }

  const p = props();
  // public_id is derived from the photo id, so retrying the same photo never creates a duplicate.
  const params = {
    allowed_formats: "jpg,jpeg,png,webp",
    public_id: FOLDER + "/" + d.session + "_" + d.photo,
    timestamp: Math.floor(Date.now() / 1000)
  };
  return json({
    ok: true,
    cloud: p.getProperty("CLOUDINARY_CLOUD_NAME"),
    apiKey: p.getProperty("CLOUDINARY_API_KEY"),
    params,
    signature: signParams(params, p.getProperty("CLOUDINARY_API_SECRET"))
  });
}

function confirm(d) {
  const name = clean(d.name, 60);
  if (!name || !validId(d.session) || typeof d.publicId !== "string" || typeof d.signature !== "string") {
    return json({ ok: false, error: "bad-request" });
  }
  if (d.publicId.indexOf(FOLDER + "/" + d.session + "_") !== 0) return json({ ok: false, error: "bad-request" });

  // Cloudinary's upload response signature proves this upload really happened on our account.
  const expected = sha1Hex(`public_id=${d.publicId}&version=${d.version}` + props().getProperty("CLOUDINARY_API_SECRET"));
  if (expected !== d.signature) return json({ ok: false, error: "invalid" });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const s = sheet();
    const exists = rows().some((r) => r[COL.id] === d.publicId);
    if (!exists) {
      s.appendRow([new Date(), name, d.publicId, Number(d.width) || "", Number(d.height) || "", "Approved", d.session]);
      CacheService.getScriptCache().remove("gallery-0");
    }
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true });
}
