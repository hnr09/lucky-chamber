import { newRun, act } from '../src/core/engine.js';
import { makeChip } from '../src/core/chips.js';

// 약실 내용과 손패를 원하는 대로 고정한 상태를 만든다.
export function rigged(shells, { seed = 1, charms = [], heat = 1, items = [], hand } = {}) {
  const { state } = newRun(seed);
  state.duel.shells = [...shells];
  state.duel.heat = heat;
  state.player.charms = [...charms];
  state.player.items = [...items];
  if (hand) {
    state.player.pouch.hand = hand.map((t) => makeChip(state, t));
  }
  return state;
}

export const lastOf = (events, type) => [...events].reverse().find((e) => e.type === type);

// 딜러 체력 1, 실탄 장전, 열기 높게 → 한 발에 클리어. 전화(증강)는 첫 번째로 받는다.
export function clearStage(s, { answer = true } = {}) {
  s.duel.shells = [true, true];
  s.duel.heat = 50;
  s.dealer.hp = 1;
  const events = act(s, { type: 'shoot', target: 'dealer' });
  if (answer && s.phase === 'call') events.push(...act(s, { type: 'answerCall', index: 0 }));
  return events;
}
