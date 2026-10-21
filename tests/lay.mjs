// lay() on a fake feed: 8 broken images in a message, each gets an error, then a fallback address and another error (as
// the hub feed does). Prints how many times the plugin subscribed to load/error.
import fs from "node:fs";
const src = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
const body = src.slice(src.indexOf("const PICK"), src.indexOf("function scan"));
let subs = 0;
class Img {
  constructor(n) { this.src = `/api/file?path=${n}`; this.complete = false; this.naturalWidth = 0; this.on = []; this.dataset = {};
    const c = new Set(); this.classList = { add: (x) => c.add(x), remove: (x) => c.delete(x), contains: (x) => c.has(x), toggle: () => {} }; }
  addEventListener(type, fn) { subs++; this.on.push([type, fn]); }
  fire(type) { const now = this.on.filter(([t]) => t === type); this.on = this.on.filter(([t]) => t !== type && !(type === "error" && t === "load") && !(type === "load" && t === "error") ? true : false); for (const [, fn] of now) fn(); }
}
const imgs = Array.from({ length: 8 }, (_, i) => new Img(i));
const row = { querySelectorAll: () => imgs };
const make = new Function("t", body + "\nreturn lay;")((k) => k);   // t: the plugin string lookup, stubbed
make(row);
for (let round = 0; round < 2; round++)
  for (const img of imgs) { img.complete = true; img.fire("error"); if (round === 0) { img.complete = false; img.src += "&raw"; } }
console.log(subs);
