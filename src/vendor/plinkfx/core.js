// src/core/synth.ts
var TAU = Math.PI * 2;
var METAL = [1, 1.483, 1.8, 2.546, 2.63, 3.897];
var rng = (seed) => () => {
  seed = seed + 1831565813 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
var blep = (t, dt) => t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0;
var svf = (sr, q, mode) => {
  let s1 = 0, s2 = 0;
  const k = 1 / q;
  return (x, fc) => {
    const g = Math.tan(Math.PI * Math.min(Math.max(fc, 10), sr * 0.45) / sr);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, v3 = x - s2, v1 = a1 * s1 + a2 * v3, v2 = s2 + a2 * s1 + g * a2 * v3;
    s1 = 2 * v1 - s1;
    s2 = 2 * v2 - s2;
    return mode ? mode < 2 ? k * v1 : x - k * v1 - v2 : v2;
  };
};
var layer = (L, out, sr, pitch, stretch, noise, fv = 1, gv = 1) => {
  const wave = L.wave || "sine", f0 = (L.freq || 440) * pitch, a = Math.max(L.a ?? 2e-3, 1e-3), h = L.h || 0, d = (L.d ?? 0.2) * stretch, len = a + h + d, sweep = L.sweep || len, curve = L.curve || 1, shape = L.shape || 2, duty = L.duty || 0.5, arpRate = L.arpRate || 0.06, gain = (L.gain ?? 1) * gv, drive = L.drive || 0, fm = L.fm, start = Math.round((L.at || 0) * sr), n = Math.min(Math.round(len * sr), out.length - start), q = L.q || 0.707, filters = [];
  ["lp", "bp", "hp"].forEach((k, m) => L[k] && filters.push([svf(sr, q, m), L[k] * fv, (L[`${k}To`] || L[k]) * fv]));
  let phase = 0, mod = 0, held = 0, b0 = 0, b1 = 0, b2 = 0, br = 0;
  const ph = [...METAL, 0, 0].map(() => noise()), MR = (L.modes || [1, 2.756, 5.404, 8.933]).slice(0, 8), ks = wave == "pluck" ? new Float32Array(n + 1) : ph, fmt = (L.formant || []).map((F) => [svf(sr, 8, 1), F * fv]);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let f = f0;
    if (L.to) {
      let p2 = Math.min(t / sweep, 1);
      if (curve != 1) p2 = 1 - (1 - p2) ** curve;
      f *= (L.to / (L.freq || 440)) ** p2;
    }
    if (L.arp) {
      const k = Math.floor(t / arpRate);
      f *= 2 ** (L.arp[L.loop ? k % L.arp.length : Math.min(k, L.arp.length - 1)] / 12);
    }
    if (L.vib) f *= 2 ** (L.vib[1] * Math.sin(TAU * L.vib[0] * t) / 12);
    const dt = f / sr;
    let p = phase;
    if (fm) {
      p += fm[1] * Math.exp(-t / (fm[2] || 9)) * Math.sin(TAU * mod) / TAU;
      mod = (mod + dt * fm[0]) % 1;
      p -= Math.floor(p);
    }
    let s;
    const w = noise() * 2 - 1;
    switch (wave) {
      case "triangle":
        s = 1 - 4 * Math.abs((p + 0.25) % 1 - 0.5);
        break;
      case "saw":
        s = 2 * p - 1 - blep(p, dt);
        break;
      case "square":
        s = (p < duty ? 1 : -1) + blep(p, dt) - blep((p + 1 - duty) % 1, dt);
        break;
      case "pluck": {
        const k = i - sr / f, j = k | 0, fr = k - j;
        s = j < 1 ? w : (L.blend ?? 0.5) * ((1 - fr) * (ks[j] + ks[j - 1]) + fr * (ks[j + 1] + ks[j])) * (L.damp ?? 0.998);
        ks[i] = s;
        break;
      }
      case "noise":
        s = w;
        break;
      case "pink":
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        s = (b0 + b1 + b2 + w * 0.1848) * 0.25;
        break;
      case "brown":
        br = (br + 0.02 * w) / 1.02;
        s = br * 3.5;
        break;
      case "crunch":
        if (phase + dt >= 1 || !i) held = w;
        s = held;
        break;
      case "modal":
        s = 0;
        for (let j = 0; j < MR.length; j++) {
          ph[j] = (ph[j] + dt * MR[j]) % 1;
          s += Math.sin(TAU * ph[j]) * Math.exp(-t * MR[j] * 4 / d) / (j + 1);
        }
        break;
      case "metal":
        s = 0;
        for (let j = 0; j < 6; j++) {
          ph[j] = (ph[j] + dt * METAL[j]) % 1;
          s += (ph[j] < 0.5 ? 1 : -1) + blep(ph[j], dt * METAL[j]) - blep((ph[j] + 0.5) % 1, dt * METAL[j]);
        }
        s /= 6;
        break;
      default:
        s = Math.sin(TAU * p);
    }
    phase = (phase + dt) % 1;
    const u = i / n;
    const kt = L.kt ? (f / f0) ** L.kt : 1;
    for (const [fn, from, to] of filters) s = fn(s, from * (to / from) ** u * kt);
    if (fmt.length) {
      let v = 0;
      for (const [fn, F] of fmt) v += fn(s, F * kt);
      s = v;
    }
    const e = t < a ? t / a : t < a + h ? 1 : shape < 0 ? (Math.exp(shape * (t - a - h) / d) - Math.exp(shape)) / (1 - Math.exp(shape)) : (1 - (t - a - h) / d) ** shape;
    s *= e;
    if (drive) s = Math.tanh(s * (1 + drive)) / Math.tanh(1 + drive);
    out[start + i] += s * gain;
  }
};
function render(sound, opts = {}) {
  const sr = opts.sampleRate || 44100, seed = opts.seed || 0, r = rng(seed * 7919 + 17), pitch = seed ? 2 ** ((r() * 2 - 1) * (sound.vary ?? 0.4) / 12) : 1, stretch = (L) => seed && L.d ? 1 + (r() * 2 - 1) * 0.07 : 1, vf = sound.varyF ?? 0;
  const layers = sound.layers.map((L) => [L, stretch(L), seed ? pitch * 2 ** ((r() * 2 - 1) * vf / 12) : 1, seed ? 10 ** ((r() * 2 - 1) * (sound.varyG ?? 0) / 20) : 1]);
  let end = 0;
  for (const [L, s] of layers) end = Math.max(end, (L.at || 0) + Math.max(L.a ?? 2e-3, 1e-3) + (L.h || 0) + (L.d ?? 0.2) * s);
  const echo = sound.echo, verb = sound.verb;
  const tail = (echo ? Math.min(echo[0] * Math.ceil(Math.log(1e-3) / Math.log(echo[1] || 0.01)), 1.5) : 0) + (verb ? 0.2 + verb[0] * 1.8 : 0);
  let x = new Float32Array(Math.ceil((end + tail) * sr) + 1);
  layers.forEach(([L, s, fv, gv], i) => layer(L, x, sr, pitch, s, rng(seed * 1009 + i * 31 + 7), fv, gv));
  if (sound.rate || sound.bits) {
    const hold = sound.rate ? sr / sound.rate : 1, q = sound.bits ? 2 ** (sound.bits - 1) : 0;
    let c = 0, v = 0;
    for (let i = 0; i < x.length; i++) {
      if (++c >= hold || !i) c -= hold > 1 ? hold : c, v = x[i];
      x[i] = q ? Math.round(v * q) / q : v;
    }
  }
  if (echo) {
    const D = Math.round(echo[0] * sr), w = new Float32Array(x.length);
    let lp = 0;
    for (let i = D; i < x.length; i++) {
      lp += 0.5 * (x[i - D] + echo[1] * w[i - D] - lp);
      w[i] = lp;
    }
    for (let i = 0; i < x.length; i++) x[i] += w[i] * echo[2];
  }
  if (verb) {
    const k = sr / 44100, fb = 0.7 + verb[0] * 0.28, wet = new Float32Array(x.length);
    for (const len of [1116, 1188, 1277, 1356]) {
      const L = Math.round(len * k), buf = new Float32Array(L);
      let j = 0, damp = 0;
      for (let i = 0; i < x.length; i++) {
        const y = buf[j];
        damp += 0.6 * (y - damp);
        buf[j] = x[i] + damp * fb;
        wet[i] += y / 4;
        j = (j + 1) % L;
      }
    }
    for (const len of [556, 441]) {
      const L = Math.round(len * k), buf = new Float32Array(L);
      let j = 0;
      for (let i = 0; i < x.length; i++) {
        const y = buf[j], v = wet[i];
        buf[j] = v + y * 0.5;
        wet[i] = y - v;
        j = (j + 1) % L;
      }
    }
    for (let i = 0; i < x.length; i++) x[i] += wet[i] * verb[1];
  }
  const R = 1 - TAU * 20 / sr, g = sound.gain ?? 1;
  let px = 0, py = 0, last = 0;
  for (let i = 0; i < x.length; i++) {
    py = x[i] - px + R * py;
    px = x[i];
    x[i] = py * g;
    if (Math.abs(x[i]) > 3e-4) last = i;
  }
  if (sound.limit) {
    const gl = new Float32Array(x.length), A = sr * 15e-4, Rl = sr * 0.05;
    for (let i = x.length; i--; ) gl[i] = Math.min(0.84 / Math.max(Math.abs(x[i]), 1e-9), 1, i + 1 < x.length ? gl[i + 1] + 1 / A : 1);
    for (let i = 0; i < x.length; i++) x[i] *= gl[i] = Math.min(gl[i], i ? gl[i - 1] + 1 / Rl : 1);
  }
  if (sound.loop) {
    const X = Math.round(sr / 4), L = Math.round(end * sr) - 2 * X;
    for (let i = 0; i < X; i++) x[i] = x[i] * (i / X) ** 0.75 + x[i + L] * (1 - i / X) ** 0.75;
    return x.slice(0, L);
  }
  x = x.slice(0, last + 1);
  const fade = Math.min(Math.round(sr * 5e-3), x.length);
  for (let i = 0; i < fade; i++) x[x.length - 1 - i] *= i / fade;
  return x;
}

// src/core/play.ts
var VARIANTS = 4;
var ctx;
var master;
var level = 1;
var off = false;
var seen = /* @__PURE__ */ new WeakMap();
var state = (s) => seen.get(s) || seen.set(s, { b: [], v: Math.random() * VARIANTS | 0, t: -9, on: [] }).get(s);
var live = /* @__PURE__ */ new Set();
var ok = () => typeof AudioContext != "undefined";
function context() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    volume(level);
    const k = ctx.createDynamicsCompressor();
    k.threshold.value = -3;
    k.knee.value = 3;
    k.ratio.value = 20;
    k.release.value = 0.1;
    master.connect(k).connect(ctx.destination);
  }
  return ctx;
}
function volume(v) {
  level = Math.max(0, Number.isFinite(v) ? v : 1);
  if (master) master.gain.value = off ? 0 : level;
}
function muted(on) {
  if (on != null) off = on, volume(level);
  return off;
}
function unlockAudio() {
  if (!ok() || typeof addEventListener == "undefined") return;
  const go = () => {
    const c = context();
    if (c.state != "running") c.resume();
    const s = navigator.audioSession;
    if (s) s.type = "playback";
    for (const e of EVENTS) removeEventListener(e, go, true);
  };
  for (const e of EVENTS) addEventListener(e, go, true);
}
var EVENTS = ["pointerdown", "keydown", "touchend"];
function buffer(sound, variant = 0) {
  const c = context(), list = state(sound).b;
  if (!list[variant]) {
    const data = render(sound, { sampleRate: c.sampleRate, seed: variant });
    (list[variant] = c.createBuffer(1, data.length, c.sampleRate)).getChannelData(0).set(data);
  }
  return list[variant];
}
function preload(sounds, takes = VARIANTS) {
  if (!ok()) return Promise.resolve();
  const jobs = sounds.flatMap((s) => Array.from({ length: takes }, (_, v) => () => buffer(s, v))), idle = globalThis.requestIdleCallback || ((f) => setTimeout(f, 1));
  return new Promise((done) => {
    const step = () => {
      const t = performance.now();
      while (jobs.length && performance.now() - t < 8) jobs.shift()();
      jobs.length ? idle(step) : done();
    };
    idle(step);
  });
}
function play(sound, o = {}) {
  if (!ok()) return;
  const c = context();
  if (c.state != "running" && (c.resume(), navigator.userActivation?.isActive == false)) return;
  const at = c.currentTime + Math.max(0, o.delay || 0), loop = o.loop ?? !!sound.loop, s = state(sound);
  if (!loop && Math.abs(at - s.t) < (o.cooldown ?? 0.03)) return;
  s.t = at;
  const v = s.v = o.variant ?? (s.v + 1 + (Math.random() * (VARIANTS - 1) | 0)) % VARIANTS;
  while (s.on.length >= (o.voices || 4)) s.on[0].stop();
  const src = c.createBufferSource(), g = c.createGain(), drop = () => (live.delete(h), s.on.splice(s.on.indexOf(h) >>> 0, 1)), h = {
    node: src,
    stop(f = 0.01) {
      const t = c.currentTime;
      g.gain.setTargetAtTime(0, t, f / 5 + 1e-3);
      src.stop(t + f + 0.01);
      drop();
    },
    rate: (r) => src.playbackRate.setTargetAtTime(r, c.currentTime, 0.02)
  };
  let node = src.connect(g);
  src.buffer = buffer(sound, v);
  src.loop = loop;
  src.playbackRate.value = o.rate ?? 1;
  g.gain.value = o.volume ?? 1;
  if (o.pan) {
    const p = c.createStereoPanner();
    p.pan.value = o.pan;
    node = node.connect(p);
  }
  node.connect(master);
  live.add(h);
  s.on.push(h);
  src.onended = drop;
  src.start(at);
  return h;
}
function stopAll() {
  for (const h of live) h.stop(0);
}

// src/core/wav.ts
function wav(samples, sampleRate = 44100) {
  const n = samples.length, b = new ArrayBuffer(44 + n * 2), pcm = new Int16Array(b, 44);
  new Uint32Array(b, 0, 11).set([1179011410, 36 + n * 2, 1163280727, 544501094, 16, 65537, sampleRate, sampleRate * 2, 1048578, 1635017060, n * 2]);
  for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767);
  return new Uint8Array(b);
}
export {
  VARIANTS,
  buffer,
  context,
  muted,
  play,
  preload,
  render,
  rng,
  stopAll,
  unlockAudio,
  volume,
  wav
};
