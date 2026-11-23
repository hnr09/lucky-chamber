// 밸런스 수치는 전부 여기에 모은다. 튜닝할 때 이 파일만 보면 된다.
export const CONFIG = {
  finalStage: 8,
  startHp: 4,
  startCoins: 4,
  maxItems: 4,
  maxCharms: 5,
  baseHitChips: 10,     // 딜러에게 실탄 적중 시 기본 칩
  selfBlankChips: 5,    // 자신에게 공포탄을 쐈을 때 기본 칩
  heatPerBlank: 1,      // 자신에게 공포탄 → 열기(배수) 증가량
  healOnStageStart: 1,
  shop: { charmOffers: 3, itemOffers: 2, rerollBase: 2, spinCost: 2 },
};

const QUOTAS = [30, 60, 100, 160, 250, 380, 560, 800];

export function stageSpec(stage) {
  return {
    dealerHp: 3 + Math.floor((stage - 1) / 2),
    quota: QUOTAS[stage - 1] ?? Math.round(800 * 1.5 ** (stage - 8)),
    reward: 3 + stage,
    maxShells: Math.min(8, 4 + stage),
  };
}
