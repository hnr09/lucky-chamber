import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, act } from '../src/core/engine.js';
import { rigged } from './helpers.js';

test('자신에게 공포탄: 열기 +1, 득점, 턴 유지', () => {
  const s = rigged([false, true, true]);
  const ev = act(s, { type: 'shoot', target: 'self' });
  assert.equal(s.duel.heat, 2);
  assert.equal(s.duel.score, 5 * 2);
  assert.equal(s.phase, 'player');
  assert.ok(ev.some((e) => e.type === 'score' && e.points === 10));
});

test('딜러 적중: 칩 × 열기, 턴 넘어감', () => {
  const s = rigged([true, false, true], { heat: 3 });
  act(s, { type: 'shoot', target: 'dealer' });
  assert.equal(s.duel.score, 30);
  assert.equal(s.dealer.hp, s.dealer.maxHp - 1);
  assert.equal(s.phase, 'dealer');
});

test('자신에게 실탄: 체력 -1, 턴 넘어감', () => {
  const s = rigged([true, false, true]);
  const hp = s.player.hp;
  act(s, { type: 'shoot', target: 'self' });
  assert.equal(s.player.hp, hp - 1);
  assert.equal(s.phase, 'dealer');
});

test('딜러 차례에는 플레이어가 쏠 수 없다', () => {
  const s = rigged([false, true, true]);
  act(s, { type: 'shoot', target: 'dealer' });
  const ev = act(s, { type: 'shoot', target: 'dealer' });
  assert.equal(ev[0].type, 'invalid');
});

test('약실이 비면 재장전되고 열기가 초기화된다', () => {
  const s = rigged([false], { heat: 1 });
  const ev = act(s, { type: 'shoot', target: 'self' });
  assert.ok(ev.some((e) => e.type === 'reload'));
  assert.equal(s.duel.heat, 1);
  assert.equal(s.phase, 'player');
});

test('딜러 처치 + 할당량 미달 → 게임 오버', () => {
  const s = rigged([true, true]);
  s.dealer.hp = 1;
  act(s, { type: 'shoot', target: 'dealer' });
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.result.reason, 'quota');
});

test('딜러 처치 + 할당량 달성 → 상점, 코인 지급', () => {
  const s = rigged([true, true], { heat: 5 });
  s.dealer.hp = 1;
  const coins = s.player.coins;
  act(s, { type: 'shoot', target: 'dealer' });
  assert.equal(s.phase, 'shop');
  assert.ok(s.player.coins > coins);
  assert.equal(s.shop.charms.length, 3);
});

test('부적은 슬롯 순서대로 발동한다 (+배수 → ×배수 ≠ ×배수 → +배수)', () => {
  const a = rigged([true, true], { heat: 4, charms: ['hotStreak', 'glassCannon'] });
  act(a, { type: 'shoot', target: 'dealer' });
  const b = rigged([true, true], { heat: 4, charms: ['glassCannon', 'hotStreak'] });
  act(b, { type: 'shoot', target: 'dealer' });
  assert.equal(a.duel.score, 10 * (4 + 2) * 2); // 120
  assert.equal(b.duel.score, 10 * (4 * 2 + 2)); // 100
});

test('마지막 의식: 마지막 탄 적중 시 ×3', () => {
  const s = rigged([true], { charms: ['lastRites'] });
  act(s, { type: 'shoot', target: 'dealer' });
  assert.equal(s.duel.score, 30);
});

test('강화탄: 피해 2, 칩 ×2', () => {
  const s = rigged([true, false, false], { items: ['hollow'] });
  act(s, { type: 'useItem', index: 0 });
  act(s, { type: 'shoot', target: 'dealer' });
  assert.equal(s.dealer.hp, s.dealer.maxHp - 2);
  assert.equal(s.duel.score, 20);
});

test('돋보기는 현재 탄을 알려준다', () => {
  const s = rigged([true, false], { items: ['peek'] });
  const ev = act(s, { type: 'useItem', index: 0 });
  assert.equal(s.duel.knownCurrent, true);
  assert.ok(ev.some((e) => e.type === 'peek' && e.live === true));
  assert.equal(s.player.items.length, 0);
});

test('상점: 구매, 판매, 슬롯머신, 다음 스테이지', () => {
  const s = rigged([true, true], { heat: 5 });
  s.dealer.hp = 1;
  act(s, { type: 'shoot', target: 'dealer' });
  s.player.coins = 50;
  const id = s.shop.charms[0];
  act(s, { type: 'buyCharm', index: 0 });
  assert.deepEqual(s.player.charms, [id]);
  act(s, { type: 'sellCharm', index: 0 });
  assert.deepEqual(s.player.charms, []);
  const ev = act(s, { type: 'spin' });
  assert.equal(ev[0].type, 'spin');
  act(s, { type: 'leaveShop' });
  assert.equal(s.stage, 2);
  assert.equal(s.phase, 'player');
});

test('같은 시드 + 같은 행동 = 같은 결과 (리플레이 가능)', () => {
  const play = () => {
    const { state } = newRun(1234);
    for (let i = 0; i < 40 && state.phase !== 'gameOver'; i++) {
      if (state.phase === 'player') act(state, { type: 'shoot', target: i % 3 ? 'dealer' : 'self' });
      else if (state.phase === 'dealer') act(state, { type: 'dealerTurn' });
      else if (state.phase === 'shop') act(state, { type: 'leaveShop' });
    }
    return JSON.stringify(state);
  };
  assert.equal(play(), play());
});
