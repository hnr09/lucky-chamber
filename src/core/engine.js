// 게임 엔진: DOM을 모르는 순수 로직.
// UI는 act(state, action)만 호출하고, 반환된 이벤트 배열로 연출/로그를 만든다.
//
// phase: 'player' | 'dealer' | 'call'(전화: 증강 선택) | 'shop' | 'gameOver' | 'victory'
import { CONFIG, stageSpec } from './config.js';
import { createRng } from './rng.js';
import { loadChamber } from './chamber.js';
import { maxHp } from './charms.js';
import { runHook } from './hooks.js';
import { CHIPS, STARTING_POUCH, makeChip, allChips } from './chips.js';
import { ITEM_IDS } from './items.js';
import { AUGMENTS, BASE_MODS, rollCall } from './augments.js';
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
    player: {
      hp: CONFIG.startHp, baseMaxHp: CONFIG.startHp, coins: CONFIG.startCoins,
      items: [], charms: [],
      pouch: { draw: [], hand: [], discard: [] }, nextUid: 0,
      tickets: 0, augments: [], mods: { ...BASE_MODS },
    },
    dealer: { hp: 0, maxHp: 0 },
    duel: null,
    shop: null,
    call: null,
    result: null,
  };
  state.player.pouch.draw = STARTING_POUCH.map((type) => makeChip(state, type));
  const events = [];
  startStage(state, events);
  return { state, events };
}

const HANDLERS = {
  shoot: {
    phases: ['player'],
    // chips: 손패 인덱스 배열(선택, 고른 순서 = 발동 순서). chip: 한 개짜리 단축형.
    run(state, { target, chip, chips }, events) {
      if (target !== 'dealer' && target !== 'self') return invalid(events, '대상이 잘못됨');
      const hand = state.player.pouch.hand;
      const picks = chips ?? (chip !== undefined && chip !== null ? [chip] : []);
      if (new Set(picks).size !== picks.length) return invalid(events, '같은 칩을 두 번 걸 수 없다');
      if (picks.length > betSlots(state)) return invalid(events, `한 번에 최대 ${betSlots(state)}개까지 걸 수 있다`);
      if (picks.some((i) => !hand[i])) return invalid(events, '손패에 없는 칩');
      const bets = picks.map((i) => hand[i]);
      state.player.pouch.hand = hand.filter((_, i) => !picks.includes(i));
      state.duel.bets = bets;
      if (bets.length) events.push({ type: 'bet', chips: bets.map((c) => c.type) });
      fire(state, 'player', target === 'self' ? 'player' : 'dealer', events);
    },
  },
  useItem: { phases: ['player'], run: useItem },
  // 할당량을 채웠으면 언제든 정산하고 일어설 수 있다 (더 버티면 초과 보너스, 대신 총 맞을 위험)
  cashOut: {
    phases: ['player'],
    run(state, _a, events) {
      if (state.duel.score < state.duel.quota) return invalid(events, '할당량을 채워야 일어설 수 있다');
      events.push({ type: 'cashOut' });
      clearStage(state, events);
    },
  },
  dealerTurn: {
    phases: ['dealer'],
    run(state, _a, events) {
      const d = state.duel;
      const spec = stageSpec(state.stage);
      const rng = rngOf(state);
      // 후반 딜러는 약실을 들여다보고, 실탄이면 2배 피해탄까지 쓴다
      let target;
      if (rng.chance(spec.dealerPeek)) {
        const live = d.shells[0];
        events.push({ type: 'dealerPeek' });
        target = live ? 'player' : 'dealer';
        if (live && rng.chance(spec.dealerSaw)) {
          d.dealerSaw = true;
          events.push({ type: 'dealerSaw' });
        }
      } else {
        target = dealerDecide(d, rng);
      }
      fire(state, 'dealer', target, events);
    },
  },
  buyCharm: { phases: ['shop'], run: shop.buyCharm },
  buyItem: { phases: ['shop'], run: shop.buyItem },
  sellCharm: { phases: ['shop'], run: shop.sellCharm },
  moveCharm: { phases: ['shop'], run: shop.moveCharm },
  answerCall: { phases: ['call'], run: answerCall },
  buyBooth: { phases: ['shop'], run: shop.buyBooth },
  buyChip: { phases: ['shop'], run: shop.buyChip },
  removeChip: { phases: ['shop'], run: shop.removeChip },
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
    knownCurrent: null, empowered: false, chamberNo: 0, bets: [],
  };
  state.shop = null;
  // 스테이지마다 칩 주머니를 전부 모아서 다시 섞는다
  const pouch = state.player.pouch;
  pouch.draw = rngOf(state).shuffle(allChips(pouch));
  pouch.hand = [];
  pouch.discard = [];
  const before = state.player.hp;
  state.player.hp = CONFIG.healOnStageStart === 'full' ? maxHp(state) : Math.min(maxHp(state), state.player.hp + CONFIG.healOnStageStart);
  events.push({ type: 'stageStart', stage: state.stage, quota: spec.quota, dealerHp: spec.dealerHp, healed: state.player.hp - before });
  reload(state, events);
}

export function chamberLimit(state) {
  return CONFIG.chambersPerStage + state.player.mods.chambers;
}

// 약실이 비었을 때: 남은 약실이 있으면 재장전, 없으면 정산 (할당량 달성 → 클리어 / 미달 → 실패)
function nextChamber(state, events) {
  const d = state.duel;
  if (d.chamberNo < chamberLimit(state)) return reload(state, events);
  if (d.score >= d.quota) {
    events.push({ type: 'dealerFolds' });
    return clearStage(state, events);
  }
  state.phase = 'gameOver';
  state.result = { victory: false, reason: 'quota', stage: state.stage };
  events.push({ type: 'gameOver', reason: 'quota', score: d.score, quota: d.quota });
}

function reload(state, events) {
  const d = state.duel;
  const rng = rngOf(state);
  const spec = stageSpec(state.stage);
  const { shells, live, blank } = loadChamber(rng, spec.maxShells, spec.liveFrac);
  Object.assign(d, { shells, spent: [], loaded: { live, blank }, heat: 1 + state.player.mods.startHeat, knownCurrent: null });
  d.chamberNo += 1;
  events.push({ type: 'reload', live, blank, chamberNo: d.chamberNo, limit: chamberLimit(state) });
  if (state.player.mods.reloadCoins) {
    state.player.coins += state.player.mods.reloadCoins;
    events.push({ type: 'stipend', coins: state.player.mods.reloadCoins });
  }
  if (state.player.items.length < CONFIG.maxItems) {
    const id = rng.pick(ITEM_IDS);
    state.player.items.push(id);
    events.push({ type: 'itemGained', id });
  }
  enterPlayerPhase(state, events);
}

// 플레이어 차례가 될 때마다 손패를 handSize까지 채운다. 뽑을 칩이 없으면 버린 더미를 섞는다.
function enterPlayerPhase(state, events) {
  state.phase = 'player';
  const pouch = state.player.pouch;
  const drawn = [];
  const handSize = CONFIG.handSize + state.player.mods.handSize;
  while (pouch.hand.length < handSize) {
    if (pouch.draw.length === 0) {
      if (pouch.discard.length === 0) break;
      pouch.draw = rngOf(state).shuffle(pouch.discard);
      pouch.discard = [];
      events.push({ type: 'pouchShuffle', count: pouch.draw.length });
    }
    const chip = pouch.draw.shift();
    pouch.hand.push(chip);
    drawn.push(chip.type);
  }
  if (drawn.length) events.push({ type: 'draw', chips: drawn });
}

// 한 번에 걸 수 있는 칩 수: 기본 + 스테이지 마일스톤/증강 보너스
export function betSlots(state) {
  return CONFIG.betSlots + state.player.mods.betSlots;
}

// 건 칩들의 사격 후 효과 처리 + 칩 이동(버린 더미 / 손패 복귀 / 파괴). 칩마다 따로 판정한다.
function settleBet(state, { live, target, hit }, events) {
  const d = state.duel;
  const bets = d.bets;
  d.bets = [];
  const pouch = state.player.pouch;
  for (const chip of bets) {
    const def = CHIPS[chip.type];
    const ctx = { live, target, hit, coins: 0, destroy: false, returnToHand: false, state, rng: rngOf(state) };
    const label = def.onShotEnd?.(ctx);
    const triggers = label ? [{ id: chip.type, source: 'chip', name: def.name, icon: def.icon, label }] : [];
    if (ctx.coins) state.player.coins += ctx.coins;
    if (ctx.destroy) {
      events.push({ type: 'chipBroken', chip: chip.type, triggers });
    } else if (ctx.returnToHand) {
      pouch.hand.push(chip);
      events.push({ type: 'chipReturned', chip: chip.type, triggers });
    } else {
      pouch.discard.push(chip);
      if (triggers.length) events.push({ type: 'chipEffect', chip: chip.type, coins: ctx.coins, triggers });
    }
  }
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
        const stake = (CONFIG.baseHitStake + state.player.mods.baseStake) * (empowered ? 2 : 1);
        score(state, { kind: 'hit', stake, mult: d.heat, lastShell, killShot: state.dealer.hp - dmg <= 0 }, events);
        hurtDealer(state, dmg, events);
      }
    } else if (live) {
      damagePlayer(state, 1, events, true);
    } else {
      gainHeat(state, events);
      keepTurn = true;
    }
    settleBet(state, { live, target, hit: live && target === 'dealer' }, events);
  } else if (target === 'player') {
    const dmg = d.dealerSaw ? 2 : 1;
    d.dealerSaw = false;
    if (live) damagePlayer(state, dmg, events);
  } else if (live) {
    hurtDealer(state, 1, events);
  } else {
    keepTurn = true;
  }

  if (checkEnd(state, events)) return;
  if (d.shells.length === 0) return nextChamber(state, events);
  const next = keepTurn ? shooter : (shooter === 'player' ? 'dealer' : 'player');
  events.push({ type: 'turn', phase: next });
  if (next === 'player') enterPlayerPhase(state, events);
  else state.phase = next;
}

// 할당량을 채우기 전에는 딜러가 죽지 않고 1에서 버틴다 (누가 쐈든)
function hurtDealer(state, amount, events) {
  const d = state.duel;
  if (d.score < d.quota && state.dealer.hp - amount <= 0) {
    const took = state.dealer.hp - 1;
    if (took > 0) damageDealer(state, took, events);
    events.push({ type: 'dealerEndures' });
    return;
  }
  damageDealer(state, amount, events);
}

function damageDealer(state, amount, events) {
  state.dealer.hp = Math.max(0, state.dealer.hp - amount);
  events.push({ type: 'damage', who: 'dealer', amount, hp: state.dealer.hp });
}

function damagePlayer(state, amount, events, selfShot = false) {
  const ctx = { amount, cancelled: false, selfShot, state, rng: rngOf(state) };
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
  const points = Math.max(0, Math.round(ctx.stake * ctx.mult));
  state.duel.score += points;
  events.push({ type: 'score', kind: ctx.kind, stake: ctx.stake, mult: ctx.mult, points, total: state.duel.score, triggers });
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
  clearStage(state, events, { kill: true });
  return true;
}

function clearStage(state, events, { kill = false } = {}) {
  const d = state.duel;
  const spec = stageSpec(state.stage);
  // 초과 달성 보너스: 할당량의 2배마다 +3 코인 (로그 스케일, 최대 12). 큰 한 방이 돈이 된다.
  const bonus = Math.min(12, Math.floor(Math.log2(d.score / d.quota) * 3));
  const killBonus = kill ? CONFIG.killBonus : 0;
  const ctx = { coins: spec.reward + bonus + killBonus, state, rng: rngOf(state) };
  const triggers = runHook(state, 'onStageEnd', ctx);
  state.player.coins += ctx.coins;
  // 티켓: 클리어 1장 + 할당량 2배 이상이면 1장 + 증강 보너스
  const tickets = 1 + (d.score >= d.quota * 2 ? 1 : 0) + state.player.mods.ticketBonus;
  state.player.tickets += tickets;
  // 클리어 보상: 기본 칩(화이트) 지급
  for (let i = 0; i < CONFIG.clearGiftChips; i++) state.player.pouch.discard.push(makeChip(state, 'white'));
  // 마일스톤 스테이지를 깨면 베팅 칸 +1
  const slotUp = CONFIG.betSlotMilestones.includes(state.stage);
  if (slotUp) state.player.mods.betSlots += 1;
  events.push({ type: 'stageClear', killBonus, tickets, giftChips: CONFIG.clearGiftChips, slotUp, betSlots: betSlots(state), stage: state.stage, score: d.score, quota: d.quota, base: spec.reward, bonus, coins: ctx.coins, triggers });

  if (state.stage >= CONFIG.finalStage) {
    state.phase = 'victory';
    state.result = { victory: true, stage: state.stage };
    events.push({ type: 'victory' });
  } else {
    ringPhone(state, events);
  }
}

// ── 전화 (증강) ────────────────────────────────────────────

function ringPhone(state, events) {
  const offers = rollCall(state, rngOf(state));
  if (offers.length === 0) {
    shop.openShop(state);
    state.phase = 'shop';
    return;
  }
  state.call = { offers };
  state.phase = 'call';
  events.push({ type: 'phoneRing', offers });
}

function answerCall(state, { index }, events) {
  const id = state.call.offers[index];
  if (!id) return invalid(events, '없는 선택지');
  AUGMENTS[id].apply(state, rngOf(state));
  state.player.augments.push(id);
  state.player.hp = Math.min(state.player.hp, maxHp(state));
  state.call = null;
  events.push({ type: 'augment', id });
  shop.openShop(state);
  state.phase = 'shop';
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
      if (d.shells.length === 0) nextChamber(state, events);
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
