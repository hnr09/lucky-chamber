// 효과 발동 순서: 이번 사격에 건 칩 → 부적(슬롯 순서)
import { CHARMS } from './charms.js';
import { CHIPS } from './chips.js';

export function runHook(state, hook, ctx) {
  const sources = [];
  const bet = state.duel?.bet;
  if (bet) sources.push({ id: bet.type, def: CHIPS[bet.type], source: 'chip' });
  for (const id of state.player.charms) sources.push({ id, def: CHARMS[id], source: 'charm' });

  const triggers = [];
  for (const { id, def, source } of sources) {
    const fn = def?.[hook];
    if (!fn) continue;
    const label = fn(ctx);
    if (label) triggers.push({ id, source, name: def.name, icon: def.icon, label });
  }
  return triggers;
}
