// 딜러 AI: 남은 탄의 실탄 비율만 안다(순서는 모름). 공격적인 성격이다.
// 실탄 확률 50% 이상이면 무조건 플레이어를 쏘고, 낮아도 꽤 자주 플레이어를 노린다.
// (예: 실탄 20% → 약 45% 확률로 플레이어를 쏜다) → 언제 날 쏠지 몰라 긴장된다.
export function dealerDecide(duel, rng) {
  const total = duel.shells.length;
  const live = duel.shells.filter(Boolean).length;
  const p = live / total;
  if (p === 0) return 'dealer';
  if (p >= 0.5) return 'player';
  const aggression = Math.min(0.9, 0.15 + p * 1.5);
  return rng.chance(aggression) ? 'player' : 'dealer';
}
