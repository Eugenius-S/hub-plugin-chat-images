// Chat images: the agent's images go straight into the feed; one small image is shown as is, a big one or many are
// shown as small previews. Click on an image opens the hub lightbox (dimming, paging through the message's images, Esc, swipe).
// The plugin only decides the size: which images are in a message and how to show them; the lightbox is the hub's own.

// Interface strings: English by default, Russian when the hub language is Russian; any other language falls back to
// English. The language is read at the moment of use (hub.lang), not at module load.
const STR = {
  en: { open: "Open full size" },
  ru: { open: "Открыть крупно" },
};
let hub = null;
const t = (k, v) => (((STR[hub?.lang] ?? STR.en)[k] ?? STR.en[k]) || k).replace(/\{(\w+)\}/g, (m, n) => v?.[n] ?? m);
const PICK = ".feed .thumbs img, .feed .attach-list img";
const BIG = { w: 1000, h: 750 };   // bigger in either dimension means "big": shown as a preview in the feed
const MANY = 3;                    // this many images in a message or more: all of them are previews
const known = new Map();           // address -> { w, h }: redrawing the feed does not flicker, the size is already known

const sizeOf = (img) => known.get(img.src) || (img.complete && img.naturalWidth
  ? known.set(img.src, { w: img.naturalWidth, h: img.naturalHeight }).get(img.src) : null);
const failed = (img) => img.classList.contains("broken") || (img.complete && !img.naturalWidth && !!img.src);
const waiting = new WeakSet();   // images already waiting for load/error: do not subscribe a second time

// the whole message: all its images and their sizes; if some have not loaded, wait (while waiting the image is hidden,
// so there is no jump). Wait for each one once: subscribing again on every error doubled the handlers, and a chat with
// dozens of broken images (deleted MJ grids) hung the page
function lay(row) {
  const imgs = [...row.querySelectorAll(PICK.replaceAll(".feed ", ""))].filter((i) => !failed(i));
  if (!imgs.length) return;
  const sizes = imgs.map(sizeOf);
  if (sizes.some((s) => !s)) {
    for (const [i, img] of imgs.entries()) if (!sizes[i] && !waiting.has(img)) {
      waiting.add(img);
      img.classList.add("ci-wait");
      const done = () => { waiting.delete(img); img.classList.remove("ci-wait"); lay(row); };
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });   // a broken one is filtered out in lay (failed), nothing more to wait for
    }
    return;
  }
  const small = imgs.length < MANY && sizes.every((s) => s.w <= BIG.w && s.h <= BIG.h);
  for (const [i, img] of imgs.entries()) {
    img.classList.remove("ci-wait");
    img.classList.toggle("ci-full", small);
    img.classList.toggle("ci-thumb", !small);
    img.style.setProperty("--ci-w", `${sizes[i].w}px`);
    img.title ||= t("open");
  }
  for (const box of row.querySelectorAll(".thumbs, .attach-list")) box.classList.toggle("ci-grid", !small);
}

function scan(root) {
  const rows = new Set();
  for (const img of root.querySelectorAll ? root.querySelectorAll(PICK) : []) rows.add(img.closest(".row") || img.parentElement);
  if (root.matches?.(PICK)) rows.add(root.closest(".row") || root.parentElement);
  for (const r of rows) lay(r);
}

// Lightbox motion.
// The lightbox is the hub's own; the plugin only animates it: opening grows out of the preview, closing goes back into
// it, click-zoom flows into and magnifies the spot that was clicked, and the zoomed image can be dragged with the mouse.
// Curves are core tokens (tokens.css), durations follow the Icons8 motion rules: window 300 ms, closing and
// dimming 200, zoom 300 ms ease-in-out.
// Also the images in question options (the "choice-images" plugin: zoom must work on them)
const OPEN = ".feed .thumbs img, .feed .attach-list img, .feed .tool-img, .ask-card .chi-pics img";
const token = (name, or) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || or;
let EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)", EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;   // no motion: opacity only
let from = null;   // the preview it was opened from: { row }
let zoomAt = null; // click on the image in the window: { rect, x, y } before the core toggled the zoom
let dragged = false;
const wired = new WeakSet();

const center = (r) => [r.left + r.width / 2, r.top + r.height / 2];
function fly(img, a, b, duration, easing, fade) {   // the image flies from rectangle a to its place b: transform only
  const [ax, ay] = center(a), [bx, by] = center(b), k = Math.max(a.width / b.width, a.height / b.height);
  const start = { transform: `translate(${ax - bx}px, ${ay - by}px) scale(${k})` }, end = { transform: "none" };
  if (fade) { start.opacity = 0; end.opacity = 1; }
  return img.animate([start, end], { duration, easing });
}

function thumbOf(src) {
  const row = from?.row;
  if (!row?.isConnected) return null;
  const t = [...row.querySelectorAll(OPEN.replaceAll(".feed ", "").replace(".ask-card ", ""))].find((i) => (i.currentSrc || i.src) === src);
  const r = t?.getBoundingClientRect();
  return r && r.width && r.bottom > 0 && r.top < innerHeight ? r : null;
}

function opened(box) {
  const img = box.querySelector(".lb-img"), thumb = from?.rect;
  box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
  const go = () => {
    const r = img.getBoundingClientRect();
    if (calm() || !thumb || !r.width) img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
    else fly(img, thumb, r, 300, EASE_OUT, false);
  };
  if (img.complete && img.naturalWidth) go();
  else { img.style.opacity = "0"; img.addEventListener("load", () => { img.style.opacity = ""; go(); }, { once: true }); }
}

function closing(box, img, src) {   // the core has already hidden the window and removed the image: put it back for the duration of the exit
  img.src = src;
  box.classList.add("ci-closing");
  const r = img.getBoundingClientRect(), back = calm() ? null : thumbOf(src);
  const a = box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_OUT });
  if (back) {
    const [ax, ay] = center(r), [bx, by] = center(back), k = Math.max(back.width / r.width, back.height / r.height);
    img.animate([{ transform: "none" }, { transform: `translate(${bx - ax}px, ${by - ay}px) scale(${k})` }],
      { duration: 200, easing: EASE_OUT });
  }
  a.onfinish = a.oncancel = () => {
    box.classList.remove("ci-closing");
    if (box.hidden) img.removeAttribute("src");
  };
}

function zoomed(box, img) {   // the core toggled the zoom (and scrolled to the start): magnify the clicked spot and flow into it
  const z = zoomAt;
  zoomAt = null;
  if (!z) return;
  if (box.classList.contains("zoom")) {
    const r = img.getBoundingClientRect();
    box.scrollLeft += r.left + z.fx * r.width - z.x;
    box.scrollTop += r.top + z.fy * r.height - z.y;
  }
  const r = img.getBoundingClientRect();
  if (!calm() && r.width) fly(img, z.rect, r, 300, EASE_IN_OUT, false);
}

function wire(box) {
  if (wired.has(box)) return;
  wired.add(box);
  const img = box.querySelector(".lb-img");
  img.draggable = false;
  new MutationObserver((list) => {
    let src = null, hid = false, zoom = false;
    for (const m of list) {
      if (m.target === img && m.attributeName === "src" && m.oldValue && !img.hasAttribute("src")) src = m.oldValue;
      if (m.target === box && m.attributeName === "hidden" && box.hidden) hid = true;
      if (m.target === box && m.attributeName === "class" && (m.oldValue || "").includes("zoom") !== box.classList.contains("zoom")) zoom = true;
    }
    if (hid && src) closing(box, img, src);
    else if (zoom) zoomed(box, img);
  }).observe(box, { attributes: true, attributeFilter: ["hidden", "class", "src"], attributeOldValue: true, subtree: true });

  // pan: press and drag in the zoomed image; release without moving is an ordinary click (the core returns the image to the window)
  let pan = null;
  img.addEventListener("pointerdown", (e) => {
    if (!box.classList.contains("zoom") || e.pointerType !== "mouse" || e.button !== 0) return;
    pan = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop };
    dragged = false;
    img.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  img.addEventListener("pointermove", (e) => {
    if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!dragged && Math.hypot(dx, dy) < 4) return;
    dragged = true;
    box.classList.add("ci-panning");
    box.scrollLeft = pan.l - dx;
    box.scrollTop = pan.t - dy;
  });
  const end = () => { pan = null; box.classList.remove("ci-panning"); };
  img.addEventListener("pointerup", end);
  img.addEventListener("pointercancel", end);
}

function motion() {
  EASE_OUT = token("--ease-out", EASE_OUT);
  EASE_IN_OUT = token("--ease-in-out", EASE_IN_OUT);
  // before the core (it listens on document): remember where it was opened from and where the click landed
  window.addEventListener("click", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const lb = e.target.closest?.(".lightbox .lb-img");
    if (lb) {
      if (dragged) { dragged = false; e.stopImmediatePropagation(); e.preventDefault(); return; }   // it was a drag, not a click
      const r = lb.getBoundingClientRect();
      zoomAt = { rect: r, x: e.clientX, y: e.clientY, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
      return;
    }
    const t = e.target.closest?.(OPEN);
    if (!t) return;
    from = { row: t.closest(".row") || t.closest("fieldset") || t.closest(".feed"), rect: t.getBoundingClientRect() };
    requestAnimationFrame(() => {   // the core has already opened the window, the frame is not painted yet
      const box = document.querySelector(".lightbox");
      if (!box || box.hidden) return;
      wire(box);
      opened(box);
    });
  }, true);
}

export default function register(h) {
  hub = h;
  motion();
  hub.addStyle("style.css");
  // the feed is rebuilt from core snapshots: catch new images right away (before the frame is painted, no flicker)
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
  }).observe(document.body, { childList: true, subtree: true });
  scan(document);
}
