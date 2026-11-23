// 상점의 슬롯머신. 3릴, 가중치 심볼.
export const SYMBOLS = [
  { id: 'cherry', glyph: '🍒', weight: 5 },
  { id: 'bell',   glyph: '🔔', weight: 4 },
  { id: 'clover', glyph: '🍀', weight: 3 },
  { id: 'seven',  glyph: '7️⃣', weight: 2 },
  { id: 'skull',  glyph: '💀', weight: 2 },
];
export const GLYPH = Object.fromEntries(SYMBOLS.map((s) => [s.id, s.glyph]));

const TRIPLE = {
  cherry: { coins: 5,  label: '체리 트리플! +5 코인' },
  bell:   { coins: 8,  label: '벨 트리플! +8 코인' },
  clover: { coins: 2,  item: true, label: '클로버 트리플! +2 코인, 아이템' },
  seven:  { coins: 20, label: '잭팟! +20 코인' },
  skull:  { hp: -1,    label: '해골 트리플… 체력 -1' },
};

export function spinReels(rng) {
  const reels = [0, 1, 2].map(() => rng.weighted(SYMBOLS).id);
  const counts = {};
  for (const id of reels) counts[id] = (counts[id] ?? 0) + 1;
  const [topId, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  const payout = { coins: 0, item: false, hp: 0 };
  let kind = 'none', label = '꽝';
  if (topCount === 3) {
    kind = 'triple';
    const t = TRIPLE[topId];
    Object.assign(payout, { coins: t.coins ?? 0, item: !!t.item, hp: t.hp ?? 0 });
    label = t.label;
  } else if (topCount === 2 && topId !== 'skull') {
    kind = 'pair';
    payout.coins = 2;
    label = '페어 +2 코인';
  }
  return { reels, kind, symbol: topId, payout, label };
}
