// 딜러 AI: 남은 탄의 실탄 비율만 안다(순서는 모름).
// 확실할 때(실탄 75% 이상 / 25% 이하)는 정석대로 쏘고, 애매하면 실탄 확률만큼의 확률로 플레이어를 쏜다.
// → 완벽하지 않아서 "이번엔 날 쏠까?" 하는 긴장이 생긴다.
export function dealerDecide(duel, rng) {
  const total = duel.shells.length;
  const live = duel.shells.filter(Boolean).length;
  const p = live / total;
  if (p >= 0.75) return 'player';
  if (p <= 0.25) return 'dealer';
  return rng.chance(p) ? 'player' : 'dealer';
}
