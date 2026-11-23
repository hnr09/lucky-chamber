// 티켓 부스: 코인과 별개인 두 번째 화폐 '티켓'으로 사는 특별 상품.
// 희귀 부적(일반 상점에는 안 나옴)과 영구 강화가 있다.
import { CHARMS, CHARM_IDS } from './charms.js?v=mwswysnb';
import { CHIP_IDS, makeChip } from './chips.js?v=mwswysnb';
import { CONFIG } from './config.js?v=mwswysnb';

export const TICKET_GOODS = {
  heart:    { name: '예비 심장', icon: '🫀', price: 2, desc: '최대 체력 +1, 즉시 1 회복', apply: (s) => { s.player.mods.maxHp += 1; s.player.hp += 1; } },
  pocket:   { name: '안주머니',  icon: '👝', price: 3, desc: '베팅 칩 손패 +1', available: (s) => s.player.mods.handSize < 2, apply: (s) => { s.player.mods.handSize += 1; } },
  magazine: { name: '여분 탄창', icon: '🧰', price: 3, desc: '스테이지마다 약실 +1 (할당량 기한 연장)', available: (s) => s.player.mods.chambers < 2, apply: (s) => { s.player.mods.chambers += 1; } },
  chipPack: {
    name: '칩 꾸러미', icon: '🎁', price: 1, desc: '무작위 고급 칩 2개를 주머니에 추가',
    apply(s, rng) {
      const premium = CHIP_IDS.filter((id) => id !== 'white');
      for (let i = 0; i < 2; i++) s.player.pouch.discard.push(makeChip(s, rng.pick(premium)));
    },
  },
};

export function rollBooth(state, rng) {
  const rares = CHARM_IDS.filter((id) => CHARMS[id].rare && !state.player.charms.includes(id))
    .map((id) => ({ kind: 'charm', id }));
  const goods = Object.keys(TICKET_GOODS)
    .filter((id) => TICKET_GOODS[id].available?.(state) ?? true)
    .map((id) => ({ kind: 'good', id }));
  return [...rng.shuffle(rares).slice(0, 2), ...rng.shuffle(goods).slice(0, 1)];
}

export function boothPrice(offer) {
  return offer.kind === 'charm' ? CHARMS[offer.id].ticketPrice : TICKET_GOODS[offer.id].price;
}

export function canAddCharm(state) {
  return state.player.charms.length < CONFIG.maxCharms;
}
