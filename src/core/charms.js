// 부적 = 패시브 효과. 훅 함수가 ctx를 직접 수정하고, 발동하면 표시용 라벨을 반환한다.
// 부적은 슬롯 순서대로 발동하므로 (+배수 → ×배수) 순서가 점수를 바꾼다.
//
// 훅 목록
//   onScore(ctx)          ctx: { kind: 'hit', stake, mult, lastShell, killShot, state, rng }  (점수는 딜러 적중에서만)
//   onHeatGain(ctx)       ctx: { gain, state, rng }
//   onIncomingDamage(ctx) ctx: { amount, cancelled, state, rng }
//   onStageEnd(ctx)       ctx: { coins, state, rng }
//   onSpin(ctx)           ctx: { result, payout, state, rng }
// 정적 속성: maxHpMod, rare(티켓 부스 전용), ticketPrice
export const CHARMS = {
  leadTooth: {
    name: '납 송곳니', icon: '🦷', price: 4, desc: '딜러 적중 시 판돈 +6',
    onScore(ctx) { if (ctx.kind === 'hit') { ctx.stake += 6; return '+6 판돈'; } },
  },
  steadyNerve: {
    name: '강철 신경', icon: '🫀', price: 4, desc: '쌓인 배수가 3 이상일 때 딜러 적중 판돈 +15',
    onScore(ctx) { if (ctx.state.duel.heat >= 3) { ctx.stake += 15; return '+15 판돈'; } },
  },
  coldHands: {
    name: '차가운 손', icon: '🧤', price: 5, desc: '나를 쏴서 공포탄이면 배수가 1 더 오른다',
    onHeatGain(ctx) { ctx.gain += 1; return '배수 +1'; },
  },
  hotStreak: {
    name: '과열', icon: '🔥', price: 5, desc: '쌓인 배수가 4 이상이면 득점 배수 +2',
    onScore(ctx) { if (ctx.state.duel.heat >= 4) { ctx.mult += 2; return '+2 배수'; } },
  },
  lastRites: {
    name: '마지막 의식', icon: '🕯️', price: 6, desc: '약실의 마지막 탄으로 딜러를 맞히면 배수 ×3',
    onScore(ctx) { if (ctx.kind === 'hit' && ctx.lastShell) { ctx.mult *= 3; return '×3 배수'; } },
  },
  rabbitFoot: {
    name: '토끼 발', icon: '🐇', price: 6, desc: '피해를 받을 때 25% 확률로 무효',
    onIncomingDamage(ctx) { if (ctx.rng.chance(0.25)) { ctx.cancelled = true; return '피해 무효!'; } },
  },
  glassCannon: {
    name: '유리 대포', icon: '🔮', price: 7, desc: '모든 득점 배수 ×2, 최대 체력 -1', maxHpMod: -1,
    onScore(ctx) { ctx.mult *= 2; return '×2 배수'; },
  },
  piggyBank: {
    name: '돼지 저금통', icon: '🐷', price: 5, desc: '스테이지 클리어 시 보유 코인 5개당 +1 (최대 5)',
    onStageEnd(ctx) {
      const b = Math.min(5, Math.floor(ctx.state.player.coins / 5));
      if (b > 0) { ctx.coins += b; return `+${b} 코인`; }
    },
  },
  luckyCoin: {
    name: '행운의 동전', icon: '🪙', price: 4, desc: '슬롯머신 페어 보상 +2 코인',
    onSpin(ctx) { if (ctx.result.kind === 'pair') { ctx.payout.coins += 2; return '+2 코인'; } },
  },

  // ── 희귀 부적: 티켓 부스 전용 (rare: true) ──
  executioner: {
    name: '처형인', icon: '🪓', rare: true, ticketPrice: 3, price: 8, desc: '딜러를 쓰러뜨리는 사격의 배수 ×4',
    onScore(ctx) { if (ctx.kind === 'hit' && ctx.killShot) { ctx.mult *= 4; return '×4 배수'; } },
  },
  highRoller: {
    name: '큰손', icon: '🎩', rare: true, ticketPrice: 2, price: 6, desc: '득점 시 건 칩 1개당 판돈 +8',
    onScore(ctx) { const n = ctx.state.duel.bets.length; if (n) { ctx.stake += 8 * n; return `+${8 * n} 판돈`; } },
  },
  fearless: {
    name: '겁 없는 자', icon: '😈', rare: true, ticketPrice: 3, price: 8, desc: '나를 쏴서 공포탄이면 배수가 2 더 오른다 (+1 대신 +3)',
    onHeatGain(ctx) { ctx.gain += 2; return '배수 +2'; },
  },
};
export const CHARM_IDS = Object.keys(CHARMS);

export function maxHp(state) {
  const mod = state.player.charms.reduce((a, id) => a + (CHARMS[id].maxHpMod ?? 0), 0) + (state.player.mods?.maxHp ?? 0);
  return Math.max(1, state.player.baseMaxHp + mod);
}
