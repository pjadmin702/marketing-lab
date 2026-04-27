/**
 * Marketing-Lab overlay — runs in TikTok's main frame via Playwright addInitScript.
 *
 * - Adds a checkbox to every video-tile anchor (matches /@user/video/<id>).
 * - Tracks selected URLs in a Set.
 * - Floating bottom-right bar: count + "Send to Lab" button.
 * - On click, calls window.sendToLab(urls), which Playwright bridges to
 *   POST /api/ingest in the launcher process.
 * - Works on SPA navigations via MutationObserver.
 */
(() => {
  if (window.__mlabOverlay) return;
  if (!/(^|\.)tiktok\.com$/.test(location.hostname)) return;
  window.__mlabOverlay = true;

  const VIDEO_HREF_RE = /\/@[^/]+\/video\/(\d+)/;
  const SELECTED = new Set();
  const TILES_BY_URL = new Map(); // url -> Set<HTMLElement> (one per checkbox so we can sync state)

  /* ---------- floating bar ---------- */

  const bar = document.createElement("div");
  bar.id = "mlab-bar";
  bar.style.cssText = [
    "position:fixed", "bottom:24px", "right:24px", "z-index:2147483647",
    "display:flex", "gap:10px", "align-items:center",
    "background:#18181b", "color:#fff",
    "padding:10px 14px", "border-radius:14px",
    "box-shadow:0 10px 30px rgba(0,0,0,0.45)",
    "font:600 13px/1.2 -apple-system,system-ui,Segoe UI,Roboto,sans-serif",
    "user-select:none",
  ].join(";");

  const label = document.createElement("span");
  label.id = "mlab-label";
  label.style.cssText = "opacity:0.75;font-weight:500;";
  label.textContent = "marketing-lab • 0 selected";

  const btn = document.createElement("button");
  btn.id = "mlab-send";
  btn.textContent = "Send to Lab";
  btn.style.cssText = [
    "background:#fff", "color:#18181b", "border:0",
    "padding:8px 14px", "border-radius:9px", "cursor:pointer",
    "font:inherit", "transition:opacity .1s,background .1s",
  ].join(";");
  btn.disabled = true;
  btn.style.opacity = "0.5";

  bar.append(label, btn);

  function refreshBar() {
    const n = SELECTED.size;
    label.textContent = `marketing-lab • ${n} selected`;
    btn.disabled = n === 0;
    btn.style.opacity = n === 0 ? "0.5" : "1";
  }

  btn.addEventListener("click", async () => {
    if (SELECTED.size === 0) return;
    const urls = [...SELECTED];
    btn.disabled = true;
    btn.textContent = "Sending…";
    label.textContent = `marketing-lab • sending ${urls.length}…`;
    try {
      if (typeof window.sendToLab !== "function") {
        throw new Error("sendToLab bridge missing — was this opened via /api/launch?");
      }
      const res = await window.sendToLab(urls);
      const okCount = (res && res.results || []).filter((r) => r.status === "ok").length;
      btn.textContent = `Sent (${okCount}/${urls.length})`;
      bar.style.background = "#16a34a";
      // clear selection + checkbox visuals
      for (const url of urls) {
        SELECTED.delete(url);
        const tiles = TILES_BY_URL.get(url);
        if (tiles) for (const t of tiles) renderCheck(t, false);
      }
      setTimeout(() => {
        btn.textContent = "Send to Lab";
        bar.style.background = "#18181b";
        refreshBar();
      }, 2000);
    } catch (e) {
      console.error("[mlab] send failed", e);
      btn.textContent = "Failed";
      bar.style.background = "#b91c1c";
      setTimeout(() => {
        btn.textContent = "Send to Lab";
        bar.style.background = "#18181b";
        refreshBar();
      }, 2200);
    }
  });

  function mountBar() {
    if (document.body) document.body.appendChild(bar);
    else setTimeout(mountBar, 80);
  }
  mountBar();

  /* ---------- per-tile checkbox ---------- */

  const CHECK_BASE = [
    "position:absolute", "top:8px", "left:8px", "z-index:50",
    "width:30px", "height:30px", "border-radius:8px",
    "display:flex", "align-items:center", "justify-content:center",
    "font:700 18px/1 system-ui,sans-serif",
    "cursor:pointer",
    "border:2px solid rgba(255,255,255,0.85)",
    "transition:transform .08s,background .08s",
    "pointer-events:auto",
  ].join(";");

  function renderCheck(el, checked) {
    if (checked) {
      el.style.cssText =
        CHECK_BASE +
        ";background:#22c55e;color:#fff;border-color:#22c55e;transform:scale(1.05)";
      el.textContent = "✓";
    } else {
      el.style.cssText =
        CHECK_BASE +
        ";background:rgba(0,0,0,0.55);color:#fff";
      el.textContent = "";
    }
  }

  function tagAnchor(anchor) {
    if (anchor.dataset.mlabTagged) return;
    if (!VIDEO_HREF_RE.test(anchor.href)) return;
    anchor.dataset.mlabTagged = "1";

    if (getComputedStyle(anchor).position === "static") {
      anchor.style.position = "relative";
    }

    const url = anchor.href;
    const cb = document.createElement("div");
    renderCheck(cb, SELECTED.has(url));

    cb.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const checked = !SELECTED.has(url);
      if (checked) SELECTED.add(url);
      else SELECTED.delete(url);
      const tiles = TILES_BY_URL.get(url);
      if (tiles) for (const t of tiles) renderCheck(t, checked);
      refreshBar();
    }, true);

    anchor.appendChild(cb);
    let set = TILES_BY_URL.get(url);
    if (!set) { set = new Set(); TILES_BY_URL.set(url, set); }
    set.add(cb);
  }

  function scan() {
    const anchors = document.querySelectorAll("a[href*='/video/']");
    for (const a of anchors) tagAnchor(a);
  }

  scan();
  const obs = new MutationObserver(() => scan());
  obs.observe(document.documentElement, { childList: true, subtree: true });

  console.log("[mlab] overlay armed on", location.href);
})();
