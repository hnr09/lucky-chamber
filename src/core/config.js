// 밸런스 수치는 전부 여기에 모은다. 튜닝할 때 이 파일만 보면 된다.
export const CONFIG = {
  finalStage: 8,
  startHp: 5,
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
  healOnStageStart: 'full', // 스테이지마다 체력 전부 회복 (긴장감은 결투 안에서)
  chambersPerStage: 3,  // 스테이지당 약실 수 = 할당량 마감 기한
  clearGiftChips: 2,    // 스테이지 클리어 시 받는 화이트 칩
  shop: { charmOffers: 3, itemOffers: 2, chipOffers: 3, rerollBase: 2, spinCost: 2, removeChipCost: 1 },
};

// 시뮬레이터(npm run balance)로 맞춘 곡선: 초반은 여유, 후반은 조합이 있어야 넘는다
const QUOTAS = [40, 130, 380, 800, 1400, 2500, 4200, 7000];

export function stageSpec(stage) {
  return {
    dealerHp: 2 + Math.floor((stage + 1) / 3),
    quota: QUOTAS[stage - 1] ?? Math.round(8000 * 1.6 ** (stage - 8)),
    reward: 3 + stage,
    maxShells: Math.min(8, 4 + stage),
    // ── 딜러 난이도 (스테이지가 오를수록 총싸움이 험해진다) ──
    liveFrac: stage <= 3 ? 0.5 : stage <= 6 ? 0.55 : 0.6,          // 약실 속 실탄 최대 비율
    dealerPeek: [0, 0, 0.1, 0.15, 0.2, 0.28, 0.35, 0.42][stage - 1] ?? 0.5, // 딜러가 탄을 확인할 확률
    dealerSaw: stage >= 6 ? 0.25 + (stage - 6) * 0.05 : 0,           // 실탄을 알 때 2배 피해탄을 쓸 확률
  };
}
