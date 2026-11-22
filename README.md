# Wedding invitation

A small, dependency-free single-page wedding invitation. Open `index.html` in a browser to preview it.

## Personalize it

Edit the `INVITATION` object at the top of `script.js`:

- Set `couple` to show the couple's names on the opening screen; if empty, the event title is used.
- Replace the date/end date, venue, address, Maps and Apple Maps links, and contacts.
- To use your video, place it in this folder (or an `assets` folder) and set `videoSrc` to its relative path, for example `"assets/our-invitation.mp4"`. The video plays (with sound) when the guest taps "Buka Jemputan" and stops on its last frame.
- Until a video is set, a placeholder background with the weekday and date is shown.

RSVP: set `rsvpEndpoint` to a form URL that accepts a JSON POST (`name`, `attendance`, plus `pax` when attending and `notes` when filled); if empty, the response opens a prefilled WhatsApp message to `rsvpWhatsApp`.

Shared wishes: set `wishesEndpoint` to a web app URL. `GET` must return JSON like `[{"name":"..","message":".."}]` (newest first); `POST` receives the same object as a text/plain JSON body. The list refreshes every 15 seconds while open. Without an endpoint, wishes stay in the guest's own browser. A Google Apps Script bound to a Sheet (columns: time, name, message) works:

```js
function doGet() {
  const rows = SpreadsheetApp.getActiveSheet().getDataRange().getValues().slice(1).reverse();
  return ContentService.createTextOutput(JSON.stringify(rows.slice(0, 100).map(r => ({ name: r[1], message: r[2] })))).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  SpreadsheetApp.getActiveSheet().appendRow([new Date(), String(d.name).slice(0, 60), String(d.message).slice(0, 300)]);
  return ContentService.createTextOutput("ok");
}
```

Deploy as Web app (execute as you, access: Anyone) and paste the URL into `wishesEndpoint`.

Recommended: use [google-apps-script.gs](./google-apps-script.gs) instead. It handles both RSVP (tab `Kehadiran`: time, name, attendance, pax, notes) and wishes (tab `Ucapan`: time, name, message) in one web app. Paste the same `/exec` URL into both `rsvpEndpoint` and `wishesEndpoint`. RSVP is also sent as a text/plain JSON body.

## Guest Experience site (`guest.html`)

One separate Guest Experience website. Its landing page is the shared photo gallery (app bar with an **Add** button, "All" / "My uploads" tabs, two-column grid with "By name" labels). It is not linked from the invitation; share it by link or QR code only (for example `https://your-site.netlify.app/guest.html`).

- **Kongsi Rezeki**: a floating bubble (dismissible) that opens the Salam Kaut popup with the framed DuitNow QR, a thank-you message and a Save QR button.
- **Be Our Photographer**: in-page camera (front/rear, filters Normal, B&W, Light, Canon, Kodak), preview/retake, choose from the device gallery or take photos, up to 10 photos per guest, upload with progress and retry, and a shared gallery with full-screen viewing.

Files: `guest.html`, `guest.css` + `guest.js` (QR popup), `photo.css` + `photo.js` (photographer and the shared screen router). `guest.css` uses flat off-white surfaces, thin borders and muted accents, so the invitation's look is unchanged.

Edit `GUEST_CONFIG` at the top of `guest.js`:

- `gift.qr`: save your DuitNow QR image as `duitnow-qr.png` next to `guest.html` (a "coming soon" note shows if the file is missing).
- `endpoint`: the `/exec` URL of the backend below.

Backend: [photo-apps-script.gs](./photo-apps-script.gs), a separate Apps Script that keeps every secret on Google's side.

- Photos are compressed in the browser (max 1600 px JPEG) and uploaded straight to Cloudinary with a one-time signature. The Cloudinary API secret lives only in the script's Script Properties. Each photo is logged in the `Foto` tab of the wedding Sheet.

Setup:

1. Create a free Cloudinary account and copy the **Cloud name**, **API key** and **API secret** from the dashboard.
2. Go to script.google.com > **New project** and paste `photo-apps-script.gs` (keep it separate from the RSVP script).
3. **Project Settings > Script properties**: add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
4. **Deploy > New deployment > Web app** (Execute as: Me, Who has access: Anyone) and authorise it (it asks for Sheets access).
5. Paste the `/exec` URL into `GUEST_CONFIG.endpoint` in `guest.js`, then re-upload the site.

Moderation: photos appear in the gallery immediately. To hide one, change its `Status` in the `Foto` tab from `Approved` to `Hidden` (the gallery refreshes within about 20 seconds).

Limits: 10 photos per device; about 240 photo uploads per minute across all guests; photos JPG/PNG/WEBP. The camera needs HTTPS (Netlify provides it).
