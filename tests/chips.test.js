import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, newRun } from '../src/core/engine.js';
import { allChips } from '../src/core/chips.js';
import { CONFIG } from '../src/core/config.js';
import { rigged, lastOf, clearStage } from './helpers.js';

const shoot = (s, target, chip) => act(s, { type: 'shoot', target, chip });

test('시작 시 손패 3장, 주머니 총 6개', () => {
  const { state } = newRun(5);
  assert.equal(state.player.pouch.hand.length, CONFIG.handSize);
  assert.equal(allChips(state.player.pouch).length, 6);
});

test('칩 없이 쏘면 기존과 똑같다', () => {
  const s = rigged([true, false, false], { hand: ['red'] });
  shoot(s, 'dealer');
  assert.equal(s.duel.score, 10);
  assert.equal(s.player.pouch.hand.length, 1);
});

test('레드 칩: 딜러 적중 시 판돈 +20 (칩이 부적보다 먼저 발동)', () => {
  const s = rigged([true, false, false], { hand: ['red'], heat: 2, charms: ['glassCannon'] });
  const ev = shoot(s, 'dealer', 0);
  const sc = lastOf(ev, 'score');
  assert.equal(sc.stake, 30);
  assert.equal(sc.mult, 4);
  assert.equal(s.duel.score, 120);
  assert.deepEqual(sc.triggers.map((t) => t.source), ['chip', 'charm']);
});

test('걸린 칩은 사격 후 버린 더미로 간다', () => {
  const s = rigged([true, false, false], { hand: ['red'] });
  const before = s.player.pouch.discard.length;
  shoot(s, 'dealer', 0);
  assert.equal(s.player.pouch.discard.length, before + 1);
  assert.equal(s.duel.bet, null);
});

test('블루 칩: 공포탄이면 열기 +2', () => {
  const s = rigged([false, true, true], { hand: ['blue'] });
  shoot(s, 'self', 0);
  assert.equal(s.duel.heat, 3);
});

test('강철 칩: 자신에게 실탄을 막는다', () => {
  const s = rigged([true, true, false], { hand: ['steel'] });
  const hp = s.player.hp;
  const ev = shoot(s, 'self', 0);
  assert.equal(s.player.hp, hp);
  assert.ok(ev.some((e) => e.type === 'dodge'));
});

test('블랙 칩: 득점 ×2, 자신에게 실탄이면 피해 2', () => {
  const a = rigged([true, false, false], { hand: ['black'] });
  shoot(a, 'dealer', 0);
  assert.equal(a.duel.score, 20);
  const b = rigged([true, false, false], { hand: ['black'] });
  const hp = b.player.hp;
  shoot(b, 'self', 0);
  assert.equal(b.player.hp, hp - 2);
});

test('골드 칩: 적중 시 코인 +2, 빗나가면 없음', () => {
  const a = rigged([true, false, false], { hand: ['gold'] });
  const c = a.player.coins;
  shoot(a, 'dealer', 0);
  assert.equal(a.player.coins, c + 2);
  const b = rigged([false, true, true], { hand: ['gold'] });
  shoot(b, 'dealer', 0);
  assert.equal(b.player.coins, c);
});

test('메아리 칩: 공포탄이면 손패로 돌아온다', () => {
  const s = rigged([false, true, true], { hand: ['echo'] });
  const ev = shoot(s, 'self', 0);
  assert.ok(ev.some((e) => e.type === 'chipReturned'));
  assert.ok(s.player.pouch.hand.some((c) => c.type === 'echo'));
});

test('유리 칩: ×3, 여러 번 쓰면 결국 깨져서 주머니에서 사라진다', () => {
  let broke = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = rigged([true, false, false], { hand: ['glass'], seed });
    const total = allChips(s.player.pouch).length;
    const ev = shoot(s, 'dealer', 0);
    assert.equal(s.duel.score, 30);
    if (ev.some((e) => e.type === 'chipBroken')) {
      broke++;
      assert.equal(allChips(s.player.pouch).length, total - 1);
    }
  }
  assert.ok(broke > 5 && broke < 40, `깨진 횟수 ${broke}`);
});

test('손패가 비면 주머니에서 다시 채우고, 주머니가 비면 버린 더미를 섞는다', () => {
  const { state: s } = newRun(3);
  s.duel.shells = Array(12).fill(false);
  let shuffled = false;
  for (let i = 0; i < 8; i++) {
    const ev = shoot(s, 'self', 0);
    if (ev.some((e) => e.type === 'pouchShuffle')) shuffled = true;
    assert.equal(s.player.pouch.hand.length, CONFIG.handSize);
  }
  assert.ok(shuffled);
  assert.equal(allChips(s.player.pouch).length, 6);
});

test('잘못된 칩 인덱스는 거부', () => {
  const s = rigged([true, false], { hand: ['red'] });
  const ev = shoot(s, 'dealer', 5);
  assert.equal(ev[0].type, 'invalid');
  assert.equal(s.duel.shells.length, 2);
});

test('상점: 칩 구매/제거', () => {
  const s = rigged([true, true]);
  clearStage(s);
  assert.equal(s.phase, 'shop');
  s.player.coins = 30;
  const before = allChips(s.player.pouch).length;
  const type = s.shop.chips[0];
  act(s, { type: 'buyChip', index: 0 });
  assert.ok(allChips(s.player.pouch).some((c) => c.type === type));
  assert.equal(allChips(s.player.pouch).length, before + 1);
  for (let i = 0; i < 20; i++) act(s, { type: 'removeChip', chipType: 'white' });
  const whites = allChips(s.player.pouch).filter((c) => c.type === 'white').length;
  assert.ok(whites === 0 || allChips(s.player.pouch).length === CONFIG.minPouch);
  assert.ok(allChips(s.player.pouch).length >= CONFIG.minPouch);
});
