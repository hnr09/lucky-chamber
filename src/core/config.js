// 밸런스 수치는 전부 여기에 모은다. 튜닝할 때 이 파일만 보면 된다.
export const CONFIG = {
  finalStage: 8,
  startHp: 4,
  startCoins: 4,
  maxItems: 4,
  maxCharms: 5,
  handSize: 5,          // 베팅 칩 손패 크기
  betSlots: 3,          // 한 번에 걸 수 있는 칩 수 (기본)
  betSlotMilestones: [3, 6], // 이 스테이지를 깨면 베팅 칸 +1
  minPouch: 5,          // 칩 주머니 최소 크기 (제거 서비스 한도)
  baseHitStake: 10,     // 딜러에게 실탄 적중 시 기본 판돈
  selfBlankStake: 5,    // 자신에게 공포탄을 쐈을 때 기본 판돈
  heatPerBlank: 1,      // 자신에게 공포탄 → 열기(배수) 증가량
  healOnStageStart: 1,
  clearGiftChips: 2,    // 스테이지 클리어 시 받는 화이트 칩
  shop: { charmOffers: 3, itemOffers: 2, chipOffers: 3, rerollBase: 2, spinCost: 2, removeChipCost: 1 },
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
