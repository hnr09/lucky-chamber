// 무작위 플레이어로 수천 판을 돌려서 엔진이 깨지지 않는지(불변식) 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, act } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';
import { maxHp } from '../src/core/charms.js';
import { CONFIG } from '../src/core/config.js';
import { allChips } from '../src/core/chips.js';

function randomPlayer(state, rng) {
  if (state.phase === 'dealer') return { type: 'dealerTurn' };
  if (state.phase === 'call') return { type: 'answerCall', index: rng.int(0, state.call.offers.length - 1) };
  if (state.phase === 'shop') {
    const r = rng.next();
    if (r < 0.3) return { type: 'buyCharm', index: rng.int(0, 2) };
    if (r < 0.45) return { type: 'buyItem', index: rng.int(0, 1) };
    if (r < 0.55) return { type: 'spin' };
    if (r < 0.65) return { type: 'buyChip', index: rng.int(0, 2) };
    if (r < 0.7) return { type: 'removeChip', chipType: 'white' };
    if (r < 0.78) return { type: 'buyBooth', index: rng.int(0, 2) };
    return { type: 'leaveShop' };
  }
  if (state.player.items.length && rng.chance(0.2)) return { type: 'useItem', index: rng.int(0, state.player.items.length - 1) };
  const hand = state.player.pouch.hand.length;
  const n = hand ? rng.int(0, Math.min(hand, 3)) : 0;
  const chips = rng.shuffle([...Array(hand).keys()]).slice(0, n);
  return { type: 'shoot', target: rng.chance(0.5) ? 'dealer' : 'self', chips };
}

test('무작위 3000판: 불변식 유지, 모두 종료됨', () => {
  const rng = createRng({ s: 99 });
  const outcomes = { dead: 0, quota: 0, victory: 0 };
  for (let run = 0; run < 3000; run++) {
    const { state } = newRun(run + 1);
    let steps = 0;
    while (state.phase !== 'gameOver' && state.phase !== 'victory') {
      act(state, randomPlayer(state, rng));
      const p = state.player;
      assert.ok(p.hp >= 0 && p.hp <= maxHp(state), `hp 범위 ${p.hp}`);
      assert.ok(p.coins >= 0, '코인 음수');
      assert.ok(p.items.length <= 4 && p.charms.length <= 5);
      assert.ok(p.pouch.hand.length <= CONFIG.handSize + p.mods.handSize, '손패 초과');
      assert.ok(p.tickets >= 0, '티켓 음수');
      assert.ok(allChips(p.pouch).length >= 1, '칩 없음');
      assert.equal(new Set(allChips(p.pouch).map((c) => c.uid)).size, allChips(p.pouch).length, '칩 중복');
      if (state.phase === 'player' || state.phase === 'dealer') assert.ok(state.duel.shells.length > 0, '빈 약실로 턴 진행');
      assert.ok(++steps < 5000, '무한 루프');
    }
    outcomes[state.result.victory ? 'victory' : state.result.reason]++;
  }
  console.log('  outcomes:', outcomes);
});
