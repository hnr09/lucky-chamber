import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act } from '../src/core/engine.js';
import { allChips } from '../src/core/chips.js';
import { AUGMENTS } from '../src/core/augments.js';
import { CHARMS } from '../src/core/charms.js';
import { maxHp } from '../src/core/charms.js';
import { rigged, clearStage } from './helpers.js';

test('클리어 보상: 화이트 칩 2개 + 티켓', () => {
  const s = rigged([true]);
  const chips = allChips(s.player.pouch).length;
  const ev = clearStage(s, { answer: false });
  const clear = ev.find((e) => e.type === 'stageClear');
  assert.equal(allChips(s.player.pouch).length, chips + 2);
  assert.equal(clear.tickets, 2); // 기본 1 + 할당량 2배 이상 1
  assert.equal(s.player.tickets, 2);
});

test('전화: 증강 3개 중 하나 선택 → 영구 적용 → 상점', () => {
  const s = rigged([true]);
  clearStage(s, { answer: false });
  assert.equal(s.phase, 'call');
  assert.equal(s.call.offers.length, 3);
  assert.equal(new Set(s.call.offers).size, 3);
  const id = s.call.offers[1];
  act(s, { type: 'answerCall', index: 1 });
  assert.deepEqual(s.player.augments, [id]);
  assert.equal(s.phase, 'shop');
});

test('상점에서는 전화를 받을 수 없다', () => {
  const s = rigged([true]);
  clearStage(s);
  assert.equal(act(s, { type: 'answerCall', index: 0 })[0].type, 'invalid');
});

test('증강 효과: 날 세우기 / 예열 / 넓은 손 / 강심장 / 수당', () => {
  const s = rigged([true, true]);
  for (const id of ['sharpen', 'warmup', 'bigHand', 'vitality', 'stipend']) AUGMENTS[id].apply(s, { pick: (a) => a[0] });
  assert.equal(maxHp(s), 6); // 기본 5 + 강심장 1
  s.duel.shells = [true, false, false];
  s.duel.heat = 1;
  act(s, { type: 'shoot', target: 'dealer' });
  assert.equal(s.duel.score, 15); // (10+5) × 1
  // 재장전 시 열기 2, 코인 +1, 손패 6
  s.phase = 'player';
  s.duel.shells = [false];
  const coins = s.player.coins;
  act(s, { type: 'shoot', target: 'self' });
  assert.equal(s.duel.heat, 2);
  assert.equal(s.player.coins, coins + 1);
  assert.equal(s.player.pouch.hand.length, 6);
});

test('조폐국: 화이트 칩이 고급 칩으로 바뀐다', () => {
  const s = rigged([true]);
  const whites = () => allChips(s.player.pouch).filter((c) => c.type === 'white').length;
  const before = whites();
  AUGMENTS.mint.apply(s, { pick: () => 'gold' });
  assert.equal(whites(), before - 2);
});

test('티켓 부스: 희귀 부적은 티켓으로만, 일반 상점에는 안 나온다', () => {
  const s = rigged([true]);
  clearStage(s);
  for (const id of s.shop.charms.filter(Boolean)) assert.ok(!CHARMS[id].rare);
  assert.equal(s.shop.booth.length, 3);
  s.player.tickets = 0;
  assert.equal(act(s, { type: 'buyBooth', index: 0 })[0].type, 'invalid');
  s.player.tickets = 10;
  const offer = s.shop.booth[0];
  act(s, { type: 'buyBooth', index: 0 });
  if (offer.kind === 'charm') assert.ok(s.player.charms.includes(offer.id));
  assert.ok(s.player.tickets < 10);
  assert.equal(s.shop.booth[0], null);
});

test('처형인: 마무리 사격 ×4', () => {
  const s = rigged([true, true], { charms: ['executioner'] });
  s.dealer.hp = 1;
  const ev = act(s, { type: 'shoot', target: 'dealer' });
  assert.equal(ev.find((e) => e.type === 'score').points, 40);
});

test('단골 할인: 상점 가격 -1', () => {
  const s = rigged([true]);
  clearStage(s);
  s.player.mods.discount = 1;
  s.player.coins = 100;
  const id = s.shop.charms[0];
  act(s, { type: 'buyCharm', index: 0 });
  assert.equal(s.player.coins, 100 - (CHARMS[id].price - 1));
});

test('베팅 칸: 기본 3, 3스테이지 클리어 시 +1, 증강으로 +1', async () => {
  const { betSlots } = await import('../src/core/engine.js');
  const s = rigged([true]);
  assert.equal(betSlots(s), 3);
  s.stage = 3;
  const ev = clearStage(s, { answer: false });
  assert.ok(ev.find((e) => e.type === 'stageClear').slotUp);
  assert.equal(betSlots(s), 4);
  AUGMENTS.extraSlot.apply(s);
  assert.equal(betSlots(s), 5);
});
