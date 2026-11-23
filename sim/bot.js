// 밸런스 측정용 전략 봇. 사람이 볼 수 있는 정보만 쓴다:
// 장전 시 공개된 실탄/공포탄 수 - 이미 나온 탄 = 남은 실탄/공포탄 수, 돋보기로 본 현재 탄.
import { CONFIG } from '../src/core/config.js';
import { CHIPS, previewBets, allChips } from '../src/core/chips.js';
import { CHARMS } from '../src/core/charms.js';
import { maxHp } from '../src/core/charms.js';
import { betSlots, chamberLimit } from '../src/core/engine.js';
import { priceOf } from '../src/core/shop.js';
import { boothPrice } from '../src/core/tickets.js';

const CHARM_PRIORITY = ['glassCannon', 'hotStreak', 'lastRites', 'coldHands', 'leadTooth', 'steadyNerve', 'rabbitFoot', 'piggyBank', 'luckyCoin'];
const CHIP_PRIORITY = ['black', 'glass', 'red', 'blue', 'lucky', 'gold', 'steel', 'echo'];
const AUG_PRIORITY = ['extraSlot', 'warmup', 'sharpen', 'mint', 'bigHand', 'vitality', 'discount', 'stipend', 'ticketLine'];

export function remaining(duel) {
  const spentLive = duel.spent.filter(Boolean).length;
  const live = duel.loaded.live - spentLive;
  const blank = duel.loaded.blank - (duel.spent.length - spentLive);
  return { live, blank, total: live + blank };
}

// 손패에서 딜러 적중 시 점수가 가장 큰 조합(순서 포함)을 고른다
function bestCombo(hand, slots, base, filter = () => true) {
  const idx = hand.map((c, i) => i).filter((i) => filter(hand[i].type));
  let best = { picks: [], points: base.stake * base.mult };
  const order = (picks) => [...picks].sort((a, b) => rank(hand[a].type) - rank(hand[b].type));
  const rank = (t) => { const b = CHIPS[t].bet; return b.xmult ? 2 : b.mult ? 1 : 0; };
  const n = idx.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const picks = idx.filter((_, k) => mask & (1 << k));
    if (picks.length > slots) continue;
    const ordered = order(picks);
    const pv = previewBets(ordered.map((i) => hand[i].type), base);
    if (pv.points > best.points) best = { picks: ordered, points: pv.points };
  }
  return best;
}

export function decide(state, opts = {}) {
  const selfThreshold = opts.selfThreshold ?? 0.45;
  const p = state.player;
  const d = state.duel;

  if (state.phase === 'dealer') return { type: 'dealerTurn' };

  if (state.phase === 'call') {
    const offers = state.call.offers;
    const i = offers.map((id) => AUG_PRIORITY.indexOf(id)).reduce((bi, r, k, arr) => (r < arr[bi] ? k : bi), 0);
    return { type: 'answerCall', index: i };
  }

  if (state.phase === 'shop') {
    const s = state.shop;
    for (const id of CHARM_PRIORITY) {
      const i = s.charms.indexOf(id);
      if (i >= 0 && p.charms.length < CONFIG.maxCharms && p.coins >= priceOf(state, CHARMS[id].price)) return { type: 'buyCharm', index: i };
    }
    for (let i = 0; i < s.booth.length; i++) {
      const o = s.booth[i];
      if (o && p.tickets >= boothPrice(o) && (o.kind !== 'charm' || p.charms.length < CONFIG.maxCharms)) return { type: 'buyBooth', index: i };
    }
    for (const id of CHIP_PRIORITY) {
      const i = s.chips.indexOf(id);
      if (i >= 0 && p.coins >= priceOf(state, CHIPS[id].price) + 1) return { type: 'buyChip', index: i };
    }
    if (p.hp < maxHp(state) - 1) {
      const i = s.items.indexOf('bandage');
      if (i >= 0 && p.coins >= priceOf(state, 3) && p.items.length < CONFIG.maxItems) return { type: 'buyItem', index: i };
    }
    const whites = allChips(p.pouch).filter((c) => c.type === 'white').length;
    if (whites > 2 && allChips(p.pouch).length > 8 && p.coins >= 1) return { type: 'removeChip', chipType: 'white' };
    return { type: 'leaveShop' };
  }

  // ── 결투: 플레이어 차례 ──
  // 할당량을 채우면 욕심내지 않고 바로 정산 (greedy 옵션이면 배수 2배까지 버틴다)
  if (d.score >= d.quota * (opts.greedy ? 2 : 1)) return { type: 'cashOut' };
  const { live, total } = remaining(d);
  const known = d.knownCurrent;
  const pLive = known === null ? live / total : known ? 1 : 0;

  // 아이템
  const itemIdx = (id) => p.items.indexOf(id);
  if (itemIdx('bandage') >= 0 && p.hp < maxHp(state)) return { type: 'useItem', index: itemIdx('bandage') };
  if (known === null && pLive > 0 && pLive < 1 && itemIdx('peek') >= 0) return { type: 'useItem', index: itemIdx('peek') };
  if (known === true && itemIdx('hollow') >= 0 && !d.empowered && state.dealer.hp > 1) return { type: 'useItem', index: itemIdx('hollow') };

  const slots = betSlots(state);
  const hand = p.pouch.hand;
  const hitBase = { stake: (CONFIG.baseHitStake + p.mods.baseStake) * (d.empowered ? 2 : 1), mult: d.heat };
  const dmg = d.empowered ? 2 : 1;
  const needed = d.quota - d.score;
  const hit = bestCombo(hand, slots, hitBase);

  const threshold = p.hp <= 1 ? selfThreshold * 0.6 : p.hp === 2 ? selfThreshold * 0.85 : selfThreshold;
  const met = needed <= 0;
  const lastChamber = d.chamberNo >= chamberLimit(state);
  let target;
  if (pLive === 0) target = 'self';
  else if (pLive === 1) target = 'dealer';
  else if (met) target = pLive >= 0.4 ? 'dealer' : 'self';                    // 할당량 달성: 빨리 끝낸다
  else if (lastChamber && hit.points < needed && pLive < 0.5) target = 'self'; // 마지막 약실: 열기를 더 쌓는다
  else target = pLive < threshold ? 'self' : 'dealer';

  if (target === 'dealer') {
    // 실탄 확률이 낮으면 칩을 아낀다
    return { type: 'shoot', target, chips: pLive >= 0.5 ? hit.picks : [] };
  }
  // 자신 사격: 점수는 없으니 능력 칩만 건다 (실탄 위험 → 강철, 배수를 더 올리는 블루)
  const picks = [];
  const add = (t) => { const i = hand.findIndex((c, k) => c.type === t && !picks.includes(k)); if (i >= 0 && picks.length < slots) picks.push(i); };
  if (pLive > 0.2) add('steel');
  add('blue');
  return { type: 'shoot', target, chips: picks };
}
