/**
 * jsdom-based test of the click-to-select overlay logic.
 * Verifies: hostname guard, idempotency, checkbox tagging, click toggle,
 * send-to-lab invocation, and post-send reset.
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(path.join(process.cwd(), "scripts", "overlay.client.js"), "utf8");

async function main() {
let pass = 0, fail = 0;
function expect(cond: boolean, label: string) {
  if (cond) { console.log(`  ok  ${label}`); pass++; }
  else      { console.log(`  FAIL ${label}`); fail++; }
}

function makePage(html: string, hostname = "www.tiktok.com") {
  const dom = new JSDOM(html, {
    url: `https://${hostname}/search?q=test`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  return dom;
}

/* ---- 1. hostname guard ---- */
{
  const dom = makePage("<html><body></body></html>", "example.com");
  dom.window.eval(SRC);
  expect(!dom.window.document.getElementById("mlab-bar"), "no bar on non-tiktok host");
}

/* ---- 2. tags anchors and shows bar on tiktok host ---- */
const tiles = `
  <a id="t1" href="https://www.tiktok.com/@a/video/1">x</a>
  <a id="t2" href="https://www.tiktok.com/@b/video/2">y</a>
  <a id="t3" href="https://www.tiktok.com/foo">non-video</a>
  <a id="t4" href="https://www.tiktok.com/@a/video/1">dup</a>
`;
const dom = makePage(`<html><body>${tiles}</body></html>`);
const w = dom.window as unknown as Window & { sendToLab?: (urls: string[]) => Promise<unknown> };
let lastSendUrls: string[] | null = null;
(w as { sendToLab: (urls: string[]) => Promise<unknown> }).sendToLab = async (urls: string[]) => {
  lastSendUrls = urls;
  return { results: urls.map((u) => ({ url: u, status: "ok", videoId: 1 })) };
};
dom.window.eval(SRC);

const doc = dom.window.document;
expect(!!doc.getElementById("mlab-bar"), "bar mounted on tiktok host");
expect(doc.querySelectorAll("[data-mlab-tagged]").length === 3, "tagged 3 video anchors (incl dup), skipped non-video");

/* ---- 3. idempotency: re-eval doesn't double-tag ---- */
dom.window.eval(SRC);
expect(doc.querySelectorAll("[data-mlab-tagged]").length === 3, "re-eval is idempotent");

/* ---- 4. click toggles selection on a tile ---- */
const t1 = doc.getElementById("t1") as HTMLAnchorElement;
const cb1 = t1.querySelector("div") as HTMLDivElement;
const sendBtn = doc.getElementById("mlab-send") as HTMLButtonElement;
const lbl = doc.getElementById("mlab-label") as HTMLSpanElement;

cb1.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
expect(/1 selected/.test(lbl.textContent || ""), "label shows 1 selected after first click");
expect(!sendBtn.disabled, "send button enabled");
expect(cb1.textContent === "✓", "checkbox shows ✓ when selected");

/* ---- 5. duplicate URL syncs across both tiles ---- */
const t4 = doc.getElementById("t4") as HTMLAnchorElement;
const cb4 = t4.querySelector("div") as HTMLDivElement;
expect(cb4.textContent === "✓", "duplicate-url tile syncs to checked state");

/* ---- 6. clicking again unchecks ---- */
cb1.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
expect(/0 selected/.test(lbl.textContent || ""), "label back to 0 after toggle off");
expect(sendBtn.disabled, "send button disabled when 0");
expect(cb4.textContent === "", "synced unchecking on duplicate");

/* ---- 7. send to lab + reset ---- */
const t2 = doc.getElementById("t2") as HTMLAnchorElement;
const cb2 = t2.querySelector("div") as HTMLDivElement;
cb1.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
cb2.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
expect(/2 selected/.test(lbl.textContent || ""), "2 selected before send");

await new Promise<void>((resolve, reject) => {
  // Click triggers an async send; poll for label flip.
  sendBtn.click();
  let tries = 0;
  const tick = () => {
    if (lastSendUrls !== null) return resolve();
    if (++tries > 50) return reject(new Error("sendToLab never called"));
    setTimeout(tick, 20);
  };
  tick();
});
expect(lastSendUrls!.length === 2, "sendToLab called with 2 urls");
expect(
  lastSendUrls!.includes("https://www.tiktok.com/@a/video/1") &&
  lastSendUrls!.includes("https://www.tiktok.com/@b/video/2"),
  "sendToLab received both URLs"
);

// Wait for post-send reset (2s timeout)
await new Promise((r) => setTimeout(r, 2200));
expect(/0 selected/.test(lbl.textContent || ""), "selection cleared after successful send");
expect(cb1.textContent === "" && cb2.textContent === "", "checkboxes cleared after send");

/* ---- 8. mutation observer picks up new tiles ---- */
const newTile = doc.createElement("a");
newTile.href = "https://www.tiktok.com/@new/video/99";
newTile.id = "t-new";
doc.body.appendChild(newTile);
await new Promise((r) => setTimeout(r, 50));
expect(!!doc.querySelector("#t-new[data-mlab-tagged]"), "MutationObserver tagged the new tile");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
