// Картинки в чате (владелец 12.10): картинки агента — прямо в ленте; одна небольшая — как есть, большая или много —
// небольшими превью. Клик по картинке — лайтбокс хаба (затемнение, листалка по картинкам сообщения, Esc, свайп).
// Плагин только решает размер: какие картинки в сообщении и как их показать; лайтбокс — штатный.
const PICK = ".feed .thumbs img, .feed .attach-list img";
const BIG = { w: 1000, h: 750 };   // больше в любую сторону — «большая»: в ленте превью
const MANY = 3;                    // столько картинок в сообщении и больше — превью у всех
const known = new Map();           // адрес → { w, h }: перерисовка ленты не мигает, размер уже знаем

const sizeOf = (img) => known.get(img.src) || (img.complete && img.naturalWidth
  ? known.set(img.src, { w: img.naturalWidth, h: img.naturalHeight }).get(img.src) : null);

// сообщение целиком: все его картинки и их размеры; не догрузились — ждём (пока ждём, картинка не видна — без прыжка)
function lay(row) {
  const imgs = [...row.querySelectorAll(PICK.replaceAll(".feed ", ""))].filter((i) => !i.classList.contains("broken"));
  if (!imgs.length) return;
  const sizes = imgs.map(sizeOf);
  if (sizes.some((s) => !s)) {
    for (const [i, img] of imgs.entries()) if (!sizes[i]) {
      img.classList.add("ci-wait");
      img.addEventListener("load", () => lay(row), { once: true });
      img.addEventListener("error", () => { img.classList.remove("ci-wait"); lay(row); }, { once: true });
    }
    return;
  }
  const small = imgs.length < MANY && sizes.every((s) => s.w <= BIG.w && s.h <= BIG.h);
  for (const [i, img] of imgs.entries()) {
    img.classList.remove("ci-wait");
    img.classList.toggle("ci-full", small);
    img.classList.toggle("ci-thumb", !small);
    img.style.setProperty("--ci-w", `${sizes[i].w}px`);
    img.title ||= "Открыть крупно";
  }
  for (const box of row.querySelectorAll(".thumbs, .attach-list")) box.classList.toggle("ci-grid", !small);
}

function scan(root) {
  const rows = new Set();
  for (const img of root.querySelectorAll ? root.querySelectorAll(PICK) : []) rows.add(img.closest(".row") || img.parentElement);
  if (root.matches?.(PICK)) rows.add(root.closest(".row") || root.parentElement);
  for (const r of rows) lay(r);
}

// Движение лайтбокса (владелец 12.10: «плавное открытие, ховеры и зум», «когда позумил — пусть включается pan»).
// Лайтбокс — штатный хаба; плагин только оживляет его: открытие вырастает из превью, закрытие уходит в него же,
// клик-зум перетекает и приближает то место, куда кликнули, увеличенную картинку можно таскать мышью.
// Кривые — токены ядра (tokens.css), длительности — по правилам движения Icons8: окно — 300 мс, закрытие и
// затемнение — 200, зум — 300 мс ease-in-out.
// и картинки в вариантах вопроса (плагин «Картинки в вариантах», владелец 14.10: «на них должен работать зум»)
const OPEN = ".feed .thumbs img, .feed .attach-list img, .feed .tool-img, .ask-card .chi-pics img";
const token = (name, or) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || or;
let EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)", EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;   // без движения — только прозрачность
let from = null;   // превью, из которого открыли: { row }
let zoomAt = null; // клик по картинке в окне: { rect, x, y } до того, как ядро переключило зум
let dragged = false;
const wired = new WeakSet();

const center = (r) => [r.left + r.width / 2, r.top + r.height / 2];
function fly(img, a, b, duration, easing, fade) {   // картинка из прямоугольника a в своё место b — только transform
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

function closing(box, img, src) {   // ядро уже спрятало окно и сняло картинку — вернуть на время ухода
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

function zoomed(box, img) {   // ядро переключило зум (и прокрутило в начало) — приблизить место клика и перетечь
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

  // pan: в увеличенной картинке зажал и тащишь; отпустил без сдвига — обычный клик (ядро вернёт картинку в окно)
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
  // раньше ядра (оно слушает document): запомнить, откуда открыли и куда кликнули
  window.addEventListener("click", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const lb = e.target.closest?.(".lightbox .lb-img");
    if (lb) {
      if (dragged) { dragged = false; e.stopImmediatePropagation(); e.preventDefault(); return; }   // тащили — не клик
      const r = lb.getBoundingClientRect();
      zoomAt = { rect: r, x: e.clientX, y: e.clientY, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
      return;
    }
    const t = e.target.closest?.(OPEN);
    if (!t) return;
    from = { row: t.closest(".row") || t.closest("fieldset") || t.closest(".feed"), rect: t.getBoundingClientRect() };
    requestAnimationFrame(() => {   // ядро уже открыло окно, кадр ещё не нарисован
      const box = document.querySelector(".lightbox");
      if (!box || box.hidden) return;
      wire(box);
      opened(box);
    });
  }, true);
}

export default function register(hub) {
  motion();
  hub.addStyle("style.css");
  // лента пересобирается снимками ядра — новые картинки ловим сразу (до отрисовки кадра: без мигания)
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
  }).observe(document.body, { childList: true, subtree: true });
  scan(document);
}
