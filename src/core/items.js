// 소모품. 효과 처리는 engine.js의 useItem에 있다.
export const ITEMS = {
  peek:    { name: '돋보기',   icon: '🔍', price: 2, desc: '현재 장전된 탄의 종류를 확인한다' },
  eject:   { name: '배출 레버', icon: '⏏️', price: 2, desc: '현재 탄을 쏘지 않고 빼낸다 (종류 공개)' },
  hollow:  { name: '강화탄',   icon: '💥', price: 3, desc: '다음 사격이 딜러에게 실탄이면 피해 2, 판돈 ×2' },
  bandage: { name: '붕대',     icon: '🩹', price: 3, desc: '체력 1 회복' },
};
export const ITEM_IDS = Object.keys(ITEMS);
