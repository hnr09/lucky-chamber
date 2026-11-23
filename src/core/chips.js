// 베팅 칩: 칩 주머니(덱)에서 손패로 뽑고, 사격할 때 1개를 걸면 그 사격에만 능력이 적용된다.
// 걸린 칩은 부적보다 먼저 발동한다 (칩 → 부적 순서).
//
// 훅은 부적과 같다(onScore, onHeatGain, onIncomingDamage) + 칩 전용:
//   onShotEnd(ctx)  ctx: { live, target, hit, coins, destroy, returnToHand, state, rng }
//     hit          = 플레이어가 딜러를 실탄으로 맞혔는가
//     destroy      = true면 칩이 주머니에서 영구 제거
//     returnToHand = true면 버린 더미 대신 손패로 돌아옴
export const CHIPS = {
  white: {
    name: '화이트 칩', icon: '⚪', color: '#e8e2d0', price: 1, desc: '득점 시 판돈 +5',
    onScore(ctx) { ctx.stake += 5; return '+5 판돈'; },
  },
  red: {
    name: '레드 칩', icon: '🔴', color: '#d9443a', price: 3, desc: '딜러 적중 시 판돈 +20',
    onScore(ctx) { if (ctx.kind === 'hit') { ctx.stake += 20; return '+20 판돈'; } },
  },
  blue: {
    name: '블루 칩', icon: '🔵', color: '#3f7fd9', price: 3, desc: '자신에게 공포탄이면 열기 +1 추가',
    onHeatGain(ctx) { ctx.gain += 1; return '열기 +1'; },
  },
  gold: {
    name: '골드 칩', icon: '🟡', color: '#f2c14e', price: 4, desc: '딜러 적중 시 코인 +2',
    onShotEnd(ctx) { if (ctx.hit) { ctx.coins += 2; return '+2 코인'; } },
  },
  black: {
    name: '블랙 칩', icon: '⚫', color: '#1c1c1c', price: 4, desc: '득점 배수 ×2. 대신 자신에게 실탄이면 피해 +1',
    onScore(ctx) { ctx.mult *= 2; return '×2 배수'; },
    onIncomingDamage(ctx) { if (ctx.selfShot) { ctx.amount += 1; return '피해 +1'; } },
  },
  glass: {
    name: '유리 칩', icon: '💠', color: '#9fe3f0', price: 5, desc: '득점 배수 ×3. 사용 후 1/3 확률로 깨진다',
    onScore(ctx) { ctx.mult *= 3; return '×3 배수'; },
    onShotEnd(ctx) { if (ctx.rng.chance(1 / 3)) { ctx.destroy = true; return '깨짐!'; } },
  },
  steel: {
    name: '강철 칩', icon: '🔩', color: '#8a9aa6', price: 3, desc: '이 사격으로 받는 피해를 막는다',
    onIncomingDamage(ctx) { ctx.cancelled = true; return '피해 막음'; },
  },
  lucky: {
    name: '럭키 칩', icon: '🎲', color: '#4fbf72', price: 4, desc: '득점 시 1/4 확률로 배수 +4. 사격 후 1/5 확률로 코인 +3',
    onScore(ctx) { if (ctx.rng.chance(0.25)) { ctx.mult += 4; return '+4 배수'; } },
    onShotEnd(ctx) { if (ctx.rng.chance(0.2)) { ctx.coins += 3; return '+3 코인'; } },
  },
  echo: {
    name: '메아리 칩', icon: '🔁', color: '#b48cf2', price: 3, desc: '공포탄이면 손패로 돌아온다',
    onShotEnd(ctx) { if (!ctx.live) { ctx.returnToHand = true; return '손패로 복귀'; } },
  },
};
export const CHIP_IDS = Object.keys(CHIPS);
export const STARTING_POUCH = ['white', 'white', 'white', 'white', 'red', 'blue'];

export function makeChip(state, type) {
  state.player.nextUid = (state.player.nextUid ?? 0) + 1;
  return { uid: state.player.nextUid, type };
}

export function allChips(pouch) {
  return [...pouch.draw, ...pouch.hand, ...pouch.discard];
}
