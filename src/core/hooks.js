// 효과 발동 순서: 이번 사격에 건 칩들(고른 순서) → 부적(슬롯 순서)
import { CHARMS } from './charms.js?v=mwsw8wdn';
import { CHIPS } from './chips.js?v=mwsw8wdn';

export function runHook(state, hook, ctx) {
  const sources = [];
  for (const chip of state.duel?.bets ?? []) sources.push({ id: chip.type, def: CHIPS[chip.type], source: 'chip' });
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
