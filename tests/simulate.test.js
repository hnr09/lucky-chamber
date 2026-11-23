// 무작위 플레이어로 수천 판을 돌려서 엔진이 깨지지 않는지(불변식) 확인한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, act } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';
import { maxHp } from '../src/core/charms.js';

function randomPlayer(state, rng) {
  if (state.phase === 'dealer') return { type: 'dealerTurn' };
  if (state.phase === 'shop') {
    const r = rng.next();
    if (r < 0.3) return { type: 'buyCharm', index: rng.int(0, 2) };
    if (r < 0.45) return { type: 'buyItem', index: rng.int(0, 1) };
    if (r < 0.55) return { type: 'spin' };
    return { type: 'leaveShop' };
  }
  if (state.player.items.length && rng.chance(0.2)) return { type: 'useItem', index: rng.int(0, state.player.items.length - 1) };
  return { type: 'shoot', target: rng.chance(0.5) ? 'dealer' : 'self' };
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
      if (state.phase === 'player' || state.phase === 'dealer') assert.ok(state.duel.shells.length > 0, '빈 약실로 턴 진행');
      assert.ok(++steps < 5000, '무한 루프');
    }
    outcomes[state.result.victory ? 'victory' : state.result.reason]++;
  }
  console.log('  outcomes:', outcomes);
});
