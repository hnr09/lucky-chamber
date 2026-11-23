// 딜러 AI: 남은 탄의 실탄 비율만 안다(순서는 모름).
// 실탄 확률이 높으면 플레이어를, 낮으면 자기 자신을 쏜다.
export function dealerDecide(duel, rng) {
  const total = duel.shells.length;
  const live = duel.shells.filter(Boolean).length;
  const p = live / total;
  if (p > 0.5) return 'player';
  if (p < 0.5) return 'dealer';
  return rng.chance(0.5) ? 'player' : 'dealer';
}
