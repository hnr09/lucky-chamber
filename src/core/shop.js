import { CONFIG } from './config.js';
import { CHARMS, CHARM_IDS, runHook, maxHp } from './charms.js';
import { ITEMS, ITEM_IDS } from './items.js';
import { createRng } from './rng.js';
import { spinReels } from './reels.js';

const invalid = (events, reason) => events.push({ type: 'invalid', reason });

function rollCharms(state, rng) {
  const pool = CHARM_IDS.filter((id) => !state.player.charms.includes(id));
  return rng.shuffle(pool).slice(0, CONFIG.shop.charmOffers);
}

function rollItems(rng) {
  return Array.from({ length: CONFIG.shop.itemOffers }, () => rng.pick(ITEM_IDS));
}

export function openShop(state) {
  const rng = createRng(state.rng);
  state.shop = {
    charms: rollCharms(state, rng),
    items: rollItems(rng),
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
  const { price } = CHARMS[id];
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
  const { price } = ITEMS[id];
  if (p.items.length >= CONFIG.maxItems) return invalid(events, '아이템 칸이 가득 찼다');
  if (p.coins < price) return invalid(events, '코인이 부족하다');
  p.coins -= price;
  p.items.push(id);
  state.shop.items[index] = null;
  events.push({ type: 'bought', kind: 'item', id, price });
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
  s.charms = rollCharms(state, createRng(state.rng));
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
  s.lastSpin = { reels: result.reels, label: result.label, coins, gainedItem, hp };
  events.push({ type: 'spin', ...s.lastSpin, triggers });
}
