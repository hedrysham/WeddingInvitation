// Shared settings for the Guest Experience site (guest.html). Loaded before photo.js.
window.GUEST_CONFIG = {
  // /exec URL of the photo-apps-script.gs deployment (used for photos).
  endpoint: "",
  // QR Contribution popup.
  gift: {
    bank: "CIMB",
    holder: "Hedrysham Bin Shaari",
    // DuitNow QR image placed next to guest.html; a friendly note is shown if missing.
    qr: "duitnow-qr.png"
  },
};

(() => {
  const cfg = window.GUEST_CONFIG;
  const q = (s) => document.querySelector(s);
  const toast = (m) => window.showToast?.(m);

  /* ---------- Ripple on tap ---------- */
  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest(".btn");
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px`;
    target.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });

  /* ---------- QR Contribution popup ---------- */
  const gift = cfg.gift;
  const modal = q("#qr-modal");
  let lastFocus = null;
  let closeTimer;
  const qrImg = q("#qr-img");
  q("#qr-bank").textContent = gift.bank;
  q("#qr-holder").textContent = gift.holder;
  qrImg.addEventListener("error", () => {
    q("#qr-frame").hidden = true;
    q("#qr-save").hidden = true;
    q("#qr-missing").hidden = false;
  });
  qrImg.src = gift.qr;
  q("#qr-save").href = gift.qr;

  function openQr() {
    clearTimeout(closeTimer);
    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.getBoundingClientRect();
    modal.classList.add("is-open");
    document.body.classList.add("is-locked");
    history.pushState({ screen: "gallery", qr: true }, "", "#gallery");
    q(".qr-modal__close").focus({ preventScroll: true });
  }

  function closeQr(viaHistory) {
    if (modal.hidden) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    closeTimer = setTimeout(() => { modal.hidden = true; }, 260);
    lastFocus?.focus?.({ preventScroll: true });
    if (!viaHistory && history.state?.qr) history.back();
  }

  q("#promo-open").addEventListener("click", openQr);
  q("#promo-close").addEventListener("click", () => q("#promo").classList.add("is-dismissed"));

  modal.querySelectorAll("[data-qr-close]").forEach((el) => el.addEventListener("click", () => closeQr(false)));
  window.addEventListener("popstate", () => closeQr(true));
  document.addEventListener("keydown", (event) => {
    if (modal.hidden) return;
    if (event.key === "Escape") closeQr(false);
    if (event.key === "Tab") {
      const items = [...modal.querySelectorAll("button:not([disabled]), a[href], input:not([disabled])")].filter((el) => el.offsetParent);
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

})();
