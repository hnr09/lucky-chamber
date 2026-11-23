import { CONFIG } from './config.js?v=mwsx9ehs';
import { CHARMS, CHARM_IDS, maxHp } from './charms.js?v=mwsx9ehs';
import { runHook } from './hooks.js?v=mwsx9ehs';
import { CHIPS, CHIP_IDS, makeChip, allChips } from './chips.js?v=mwsx9ehs';
import { ITEMS, ITEM_IDS } from './items.js?v=mwsx9ehs';
import { createRng } from './rng.js?v=mwsx9ehs';
import { spinReels } from './reels.js?v=mwsx9ehs';
import { rollBooth, boothPrice, TICKET_GOODS } from './tickets.js?v=mwsx9ehs';

// 증강 '단골 할인' 적용 가격
export const priceOf = (state, base) => Math.max(1, base - (state.player.mods?.discount ?? 0));

const invalid = (events, reason) => events.push({ type: 'invalid', reason });

function rollCharms(state, rng) {
  const pool = CHARM_IDS.filter((id) => !CHARMS[id].rare && !state.player.charms.includes(id));
  return rng.shuffle(pool).slice(0, CONFIG.shop.charmOffers);
}

// 화이트 칩은 시작 칩이라 상점에는 잘 안 나온다
function rollChips(rng) {
  const pool = CHIP_IDS.filter((id) => id !== 'white');
  return Array.from({ length: CONFIG.shop.chipOffers }, () => rng.pick(pool));
}

function rollItems(rng) {
  return Array.from({ length: CONFIG.shop.itemOffers }, () => rng.pick(ITEM_IDS));
}

export function openShop(state) {
  const rng = createRng(state.rng);
  state.shop = {
    charms: rollCharms(state, rng),
    items: rollItems(rng),
    chips: rollChips(rng),
    booth: rollBooth(state, rng),
    rerollCost: CONFIG.shop.rerollBase,
    spinCost: CONFIG.shop.spinCost,
    lastSpin: null,
  };
}

export function sellPrice(id) {
  return Math.max(1, Math.floor(CHARMS[id].price / 2));
}

export function buyCharm(state, { index }, events) {
  const p = state.player;
  const id = state.shop.charms[index];
  if (!id) return invalid(events, '없는 상품');
  const price = priceOf(state, CHARMS[id].price);
  if (p.charms.length >= CONFIG.maxCharms) return invalid(events, '부적 슬롯이 가득 찼다');
  if (p.coins < price) return invalid(events, '코인이 부족하다');
  p.coins -= price;
  p.charms.push(id);
  state.shop.charms[index] = null;
  p.hp = Math.max(1, Math.min(p.hp, maxHp(state)));
  events.push({ type: 'bought', kind: 'charm', id, price });
}

export function buyItem(state, { index }, events) {
  const p = state.player;
  const id = state.shop.items[index];
  if (!id) return invalid(events, '없는 상품');
  const price = priceOf(state, ITEMS[id].price);
  if (p.items.length >= CONFIG.maxItems) return invalid(events, '아이템 칸이 가득 찼다');
  if (p.coins < price) return invalid(events, '코인이 부족하다');
  p.coins -= price;
  p.items.push(id);
  state.shop.items[index] = null;
  events.push({ type: 'bought', kind: 'item', id, price });
}

export function buyBooth(state, { index }, events) {
  const p = state.player;
  const offer = state.shop.booth[index];
  if (!offer) return invalid(events, '없는 상품');
  const price = boothPrice(offer);
  if (p.tickets < price) return invalid(events, '티켓이 부족하다');
  if (offer.kind === 'charm') {
    if (p.charms.length >= CONFIG.maxCharms) return invalid(events, '부적 슬롯이 가득 찼다');
    p.charms.push(offer.id);
  } else {
    TICKET_GOODS[offer.id].apply(state, createRng(state.rng));
  }
  p.tickets -= price;
  p.hp = Math.max(1, Math.min(p.hp, maxHp(state)));
  state.shop.booth[index] = null;
  events.push({ type: 'boughtBooth', kind: offer.kind, id: offer.id, price });
}

export function buyChip(state, { index }, events) {
  const p = state.player;
  const type = state.shop.chips[index];
  if (!type) return invalid(events, '없는 상품');
  const price = priceOf(state, CHIPS[type].price);
  if (p.coins < price) return invalid(events, '코인이 부족하다');
  p.coins -= price;
  p.pouch.discard.push(makeChip(state, type));
  state.shop.chips[index] = null;
  events.push({ type: 'bought', kind: 'chip', id: type, price });
}

// 칩 주머니에서 해당 종류 칩 1개를 영구 제거 (덱 압축)
export function removeChip(state, { chipType }, events) {
  const p = state.player;
  const cost = CONFIG.shop.removeChipCost;
  if (allChips(p.pouch).length <= CONFIG.minPouch) return invalid(events, `칩 주머니는 최소 ${CONFIG.minPouch}개`);
  if (p.coins < cost) return invalid(events, '코인이 부족하다');
  for (const pile of ['discard', 'draw', 'hand']) {
    const i = p.pouch[pile].findIndex((c) => c.type === chipType);
    if (i >= 0) {
      p.pouch[pile].splice(i, 1);
      p.coins -= cost;
      return events.push({ type: 'chipRemoved', chip: chipType, cost });
    }
  }
  invalid(events, '그 칩이 없다');
}

export function sellCharm(state, { index }, events) {
  const p = state.player;
  const id = p.charms[index];
  if (!id) return invalid(events, '없는 부적');
  const price = sellPrice(id);
  p.charms.splice(index, 1);
  p.coins += price;
  p.hp = Math.min(p.hp, maxHp(state));
  events.push({ type: 'sold', id, price });
}

// 부적 순서 변경 (발동 순서가 점수에 영향)
export function moveCharm(state, { index, dir }, events) {
  const c = state.player.charms;
  const j = index + dir;
  if (!c[index] || j < 0 || j >= c.length) return invalid(events, '옮길 수 없다');
  [c[index], c[j]] = [c[j], c[index]];
  events.push({ type: 'moved', id: c[j], to: j });
}

export function reroll(state, _a, events) {
  const p = state.player;
  const s = state.shop;
  if (p.coins < s.rerollCost) return invalid(events, '코인이 부족하다');
  p.coins -= s.rerollCost;
  const rng = createRng(state.rng);
  s.charms = rollCharms(state, rng);
  s.chips = rollChips(rng);
  events.push({ type: 'reroll', cost: s.rerollCost });
  s.rerollCost += 1;
}

export function spin(state, _a, events) {
  const p = state.player;
  const s = state.shop;
  if (p.coins < s.spinCost) return invalid(events, '코인이 부족하다');
  p.coins -= s.spinCost;
  const rng = createRng(state.rng);
  const result = spinReels(rng);
  const ctx = { result, payout: { ...result.payout }, state, rng };
  const triggers = runHook(state, 'onSpin', ctx);
  const { coins, item, hp } = ctx.payout;
  p.coins += coins;
  let gainedItem = null;
  if (item && p.items.length < CONFIG.maxItems) {
    gainedItem = rng.pick(ITEM_IDS);
    p.items.push(gainedItem);
  }
  if (hp) p.hp = Math.max(1, Math.min(maxHp(state), p.hp + hp));
  const tickets = ctx.payout.tickets ?? 0;
  p.tickets += tickets;
  s.lastSpin = { reels: result.reels, label: result.label, coins, gainedItem, hp, tickets };
  events.push({ type: 'spin', ...s.lastSpin, triggers });
}
