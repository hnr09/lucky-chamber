// 시드 고정 난수(mulberry32). 상태가 { s } 객체 하나라서 세이브/리플레이가 쉽다.
export function nextFloat(holder) {
  holder.s = (holder.s + 0x6d2b79f5) >>> 0;
  let t = holder.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createRng(holder) {
  const next = () => nextFloat(holder);
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(entries) {
      const total = entries.reduce((a, e) => a + e.weight, 0);
      let roll = next() * total;
      for (const e of entries) { roll -= e.weight; if (roll < 0) return e; }
      return entries[entries.length - 1];
    },
    shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}
