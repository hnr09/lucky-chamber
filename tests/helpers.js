import { newRun } from '../src/core/engine.js';

// 약실 내용을 원하는 대로 고정한 상태를 만든다.
export function rigged(shells, { seed = 1, charms = [], heat = 1, items = [] } = {}) {
  const { state } = newRun(seed);
  state.duel.shells = [...shells];
  state.duel.heat = heat;
  state.player.charms = [...charms];
  state.player.items = [...items];
  return state;
}
