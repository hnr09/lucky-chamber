// src/index.ts
import * as sounds from "./sounds.js";
import { play as playSound, buffer as bufferOf, render as renderSound, preload as preloadSounds } from "./core.js";
export * from "./sounds.js";
import { context, volume, muted, wav, rng, stopAll, unlockAudio, VARIANTS } from "./core.js";
var library = sounds;
var camel = (n) => n.replace(/-(\w)/g, (_, c) => c.toUpperCase());
var dist = (a, b) => {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] == b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
};
function get(name) {
  const s = library[camel(name)];
  if (!s) {
    const close = names.filter((n) => dist(n, name) <= 2 || n.includes(name)).slice(0, 4);
    throw new Error(`plinkfx: no sound called "${name}"${close.length ? `. Did you mean ${close.join(", ")}?` : ""}`);
  }
  return s;
}
var resolve = (s) => typeof s == "string" ? get(s) : s;
var play = (s, o) => playSound(resolve(s), o);
var render = (s, o) => renderSound(resolve(s), o);
var buffer = (s, variant) => bufferOf(resolve(s), variant);
var preload = (list, takes) => preloadSounds(list.map(resolve), takes);
var names = Object.keys(library).map((k) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()));
export {
  VARIANTS,
  buffer,
  context,
  get,
  muted,
  names,
  play,
  preload,
  render,
  rng,
  stopAll,
  unlockAudio,
  volume,
  wav
};
