// 게임 엔진: DOM을 모르는 순수 로직.
// UI는 act(state, action)만 호출하고, 반환된 이벤트 배열로 연출/로그를 만든다.
//
// phase: 'player' | 'dealer' | 'shop' | 'gameOver' | 'victory'
import { CONFIG, stageSpec } from './config.js';
import { createRng } from './rng.js';
import { loadChamber } from './chamber.js';
import { runHook, maxHp } from './charms.js';
import { ITEM_IDS } from './items.js';
import { dealerDecide } from './dealer.js';
import * as shop from './shop.js';

export const rngOf = (state) => createRng(state.rng);

export function newRun(seed = (Math.random() * 2 ** 32) >>> 0) {
  const state = {
    version: 1,
    seed,
    rng: { s: seed >>> 0 },
    stage: 1,
    phase: 'player',
    player: { hp: CONFIG.startHp, baseMaxHp: CONFIG.startHp, coins: CONFIG.startCoins, items: [], charms: [] },
    dealer: { hp: 0, maxHp: 0 },
    duel: null,
    shop: null,
    result: null,
  };
  const events = [];
  startStage(state, events);
  return { state, events };
}

const HANDLERS = {
  shoot: {
    phases: ['player'],
    run(state, { target }, events) {
      if (target !== 'dealer' && target !== 'self') return invalid(events, '대상이 잘못됨');
      fire(state, 'player', target === 'self' ? 'player' : 'dealer', events);
    },
  },
  useItem: { phases: ['player'], run: useItem },
  dealerTurn: {
    phases: ['dealer'],
    run(state, _a, events) {
      fire(state, 'dealer', dealerDecide(state.duel, rngOf(state)), events);
    },
  },
  buyCharm: { phases: ['shop'], run: shop.buyCharm },
  buyItem: { phases: ['shop'], run: shop.buyItem },
  sellCharm: { phases: ['shop'], run: shop.sellCharm },
  moveCharm: { phases: ['shop'], run: shop.moveCharm },
  reroll: { phases: ['shop'], run: shop.reroll },
  spin: { phases: ['shop'], run: shop.spin },
  leaveShop: {
    phases: ['shop'],
    run(state, _a, events) {
      state.stage += 1;
      startStage(state, events);
    },
  },
};

export function act(state, action) {
  const events = [];
  const h = HANDLERS[action?.type];
  if (!h) return invalid(events, `알 수 없는 행동: ${action?.type}`);
  if (!h.phases.includes(state.phase)) return invalid(events, '지금은 할 수 없는 행동');
  h.run(state, action, events);
  return events;
}

export function invalid(events, reason) {
  events.push({ type: 'invalid', reason });
  return events;
}

// ── 스테이지 / 약실 ──────────────────────────────────────────

function startStage(state, events) {
  const spec = stageSpec(state.stage);
  state.dealer = { hp: spec.dealerHp, maxHp: spec.dealerHp };
  state.duel = {
    quota: spec.quota, score: 0, heat: 1,
    shells: [], spent: [], loaded: { live: 0, blank: 0 },
    knownCurrent: null, empowered: false, chamberNo: 0,
  };
  state.shop = null;
  const before = state.player.hp;
  state.player.hp = Math.min(maxHp(state), state.player.hp + CONFIG.healOnStageStart);
  events.push({ type: 'stageStart', stage: state.stage, quota: spec.quota, dealerHp: spec.dealerHp, healed: state.player.hp - before });
  reload(state, events);
}

function reload(state, events) {
  const d = state.duel;
  const rng = rngOf(state);
  const { shells, live, blank } = loadChamber(rng, stageSpec(state.stage).maxShells);
  Object.assign(d, { shells, spent: [], loaded: { live, blank }, heat: 1, knownCurrent: null });
  d.chamberNo += 1;
  events.push({ type: 'reload', live, blank, chamberNo: d.chamberNo });
  if (state.player.items.length < CONFIG.maxItems) {
    const id = rng.pick(ITEM_IDS);
    state.player.items.push(id);
    events.push({ type: 'itemGained', id });
  }
  state.phase = 'player';
}

// ── 사격 ───────────────────────────────────────────────────

function fire(state, shooter, target, events) {
  const d = state.duel;
  const live = d.shells.shift();
  d.spent.push(live);
  d.knownCurrent = null;
  const lastShell = d.shells.length === 0;
  events.push({ type: 'shot', shooter, target, live });

  let keepTurn = false;
  if (shooter === 'player') {
    const empowered = d.empowered;
    d.empowered = false;
    if (target === 'dealer') {
      if (live) {
        const dmg = empowered ? 2 : 1;
        damageDealer(state, dmg, events);
        score(state, { kind: 'hit', chips: CONFIG.baseHitChips * (empowered ? 2 : 1), mult: d.heat, lastShell }, events);
      }
    } else if (live) {
      damagePlayer(state, 1, events);
    } else {
      gainHeat(state, events);
      score(state, { kind: 'selfBlank', chips: CONFIG.selfBlankChips, mult: d.heat, lastShell }, events);
      keepTurn = true;
    }
  } else if (target === 'player') {
    if (live) damagePlayer(state, 1, events);
  } else if (live) {
    damageDealer(state, 1, events);
  } else {
    keepTurn = true;
  }

  if (checkEnd(state, events)) return;
  if (d.shells.length === 0) return reload(state, events);
  state.phase = keepTurn ? shooter : (shooter === 'player' ? 'dealer' : 'player');
  events.push({ type: 'turn', phase: state.phase });
}

function damageDealer(state, amount, events) {
  state.dealer.hp = Math.max(0, state.dealer.hp - amount);
  events.push({ type: 'damage', who: 'dealer', amount, hp: state.dealer.hp });
}

function damagePlayer(state, amount, events) {
  const ctx = { amount, cancelled: false, state, rng: rngOf(state) };
  const triggers = runHook(state, 'onIncomingDamage', ctx);
  if (ctx.cancelled) return events.push({ type: 'dodge', triggers });
  state.player.hp = Math.max(0, state.player.hp - ctx.amount);
  events.push({ type: 'damage', who: 'player', amount: ctx.amount, hp: state.player.hp, triggers });
}

function gainHeat(state, events) {
  const ctx = { gain: CONFIG.heatPerBlank, state, rng: rngOf(state) };
  const triggers = runHook(state, 'onHeatGain', ctx);
  state.duel.heat += ctx.gain;
  events.push({ type: 'heat', gain: ctx.gain, heat: state.duel.heat, triggers });
}

export function score(state, base, events) {
  const ctx = { ...base, state, rng: rngOf(state) };
  const triggers = runHook(state, 'onScore', ctx);
  const points = Math.max(0, Math.round(ctx.chips * ctx.mult));
  state.duel.score += points;
  events.push({ type: 'score', kind: ctx.kind, chips: ctx.chips, mult: ctx.mult, points, total: state.duel.score, triggers });
  return points;
}

function checkEnd(state, events) {
  const d = state.duel;
  if (state.player.hp <= 0) {
    state.phase = 'gameOver';
    state.result = { victory: false, reason: 'dead', stage: state.stage };
    events.push({ type: 'gameOver', reason: 'dead' });
    return true;
  }
  if (state.dealer.hp > 0) return false;

  if (d.score < d.quota) {
    state.phase = 'gameOver';
    state.result = { victory: false, reason: 'quota', stage: state.stage };
    events.push({ type: 'gameOver', reason: 'quota', score: d.score, quota: d.quota });
    return true;
  }
  const spec = stageSpec(state.stage);
  const bonus = Math.min(5, Math.floor((d.score - d.quota) / Math.max(1, d.quota / 4)));
  const ctx = { coins: spec.reward + bonus, state, rng: rngOf(state) };
  const triggers = runHook(state, 'onStageEnd', ctx);
  state.player.coins += ctx.coins;
  events.push({ type: 'stageClear', stage: state.stage, score: d.score, quota: d.quota, base: spec.reward, bonus, coins: ctx.coins, triggers });

  if (state.stage >= CONFIG.finalStage) {
    state.phase = 'victory';
    state.result = { victory: true, stage: state.stage };
    events.push({ type: 'victory' });
  } else {
    shop.openShop(state);
    state.phase = 'shop';
  }
  return true;
}

// ── 아이템 ─────────────────────────────────────────────────

function useItem(state, { index }, events) {
  const p = state.player;
  const d = state.duel;
  const id = p.items[index];
  if (id === undefined) return invalid(events, '아이템이 없다');

  if (id === 'hollow' && d.empowered) return invalid(events, '이미 강화탄이 장전됨');
  if (id === 'bandage' && p.hp >= maxHp(state)) return invalid(events, '체력이 가득 찼다');

  p.items.splice(index, 1);
  events.push({ type: 'itemUsed', id });

  switch (id) {
    case 'peek':
      d.knownCurrent = d.shells[0];
      events.push({ type: 'peek', live: d.shells[0] });
      break;
    case 'eject': {
      const live = d.shells.shift();
      d.spent.push(live);
      d.knownCurrent = null;
      events.push({ type: 'eject', live });
      if (d.shells.length === 0) reload(state, events);
      break;
    }
    case 'hollow':
      d.empowered = true;
      events.push({ type: 'empower' });
      break;
    case 'bandage':
      p.hp += 1;
      events.push({ type: 'heal', amount: 1, hp: p.hp });
      break;
  }
}
