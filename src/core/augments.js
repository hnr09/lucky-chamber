// 증강: 스테이지를 클리어하면 전화가 울리고 3개 중 1개를 고른다. 런이 끝날 때까지 영구 적용.
// 대부분 player.mods 수치를 올리는 방식이라 엔진 곳곳에서 mods만 읽으면 된다.
import { CHIP_IDS, makeChip, allChips } from './chips.js';

export const BASE_MODS = { baseStake: 0, startHeat: 0, handSize: 0, maxHp: 0, discount: 0, reloadCoins: 0, ticketBonus: 0, betSlots: 0, chambers: 0 };

export const AUGMENTS = {
  sharpen:    { name: '날 세우기',   icon: '🗡️', desc: '딜러 적중 기본 판돈 +5', apply: (s) => { s.player.mods.baseStake += 5; } },
  warmup:     { name: '예열',       icon: '♨️', desc: '재장전할 때 열기가 1 더 높게 시작', apply: (s) => { s.player.mods.startHeat += 1; } },
  bigHand:    { name: '넓은 손',     icon: '🖐️', desc: '베팅 칩 손패 +1', max: 2, apply: (s) => { s.player.mods.handSize += 1; } },
  vitality:   { name: '강심장',     icon: '❤️', desc: '최대 체력 +1, 즉시 1 회복', apply: (s) => { s.player.mods.maxHp += 1; s.player.hp += 1; } },
  discount:   { name: '단골 할인',   icon: '🏷️', desc: '상점의 모든 코인 가격 -1 (최소 1)', max: 2, apply: (s) => { s.player.mods.discount += 1; } },
  extraSlot:  { name: '세 번째 손', icon: '🫴', desc: '한 번에 거는 칩 +1개', max: 2, apply: (s) => { s.player.mods.betSlots += 1; } },
  stipend:    { name: '수당',       icon: '💵', desc: '재장전할 때마다 코인 +1', apply: (s) => { s.player.mods.reloadCoins += 1; } },
  ticketLine: { name: '암표상',     icon: '🎟️', desc: '스테이지 클리어 시 티켓 +1', apply: (s) => { s.player.mods.ticketBonus += 1; } },
  mint: {
    name: '조폐국', icon: '🏦', desc: '화이트 칩 최대 2개를 무작위 고급 칩으로 바꾼다',
    apply(s, rng) {
      const premium = CHIP_IDS.filter((id) => id !== 'white');
      let n = 0;
      for (const pile of ['discard', 'draw', 'hand']) {
        const arr = s.player.pouch[pile];
        for (let i = 0; i < arr.length && n < 2; i++) {
          if (arr[i].type === 'white') { arr[i] = makeChip(s, rng.pick(premium)); n++; }
        }
      }
    },
    available: (s) => allChips(s.player.pouch).some((c) => c.type === 'white'),
  },
};
export const AUGMENT_IDS = Object.keys(AUGMENTS);

export function rollCall(state, rng) {
  const owned = state.player.augments;
  const pool = AUGMENT_IDS.filter((id) => {
    const a = AUGMENTS[id];
    if (a.max && owned.filter((x) => x === id).length >= a.max) return false;
    return a.available ? a.available(state) : true;
  });
  return rng.shuffle(pool).slice(0, 3);
}
