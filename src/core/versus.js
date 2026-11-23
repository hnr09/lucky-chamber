// 1:1 결투 모드 (로컬 2인 / 온라인). 로그라이크 엔진과 별개인 순수 로직.
//
// 규칙
// - 3판 2선승. 판마다 두 사람 체력 4로 시작.
// - 약실을 장전하면 실탄/공포탄 개수만 공개. 장전할 때마다 각자 아이템 2개(최대 4개).
// - 차례에 할 수 있는 것: 상대를 쏜다 / 나를 쏜다 / 아이템 사용.
//   - 상대를 쏘면 맞든 안 맞든 차례가 넘어간다.
//   - 나를 쏴서 공포탄이면 배수 +1, 내 차례 유지. 실탄이면 체력 -1, 차례 넘어감.
// - 배수(이 게임의 고유 규칙): 배수 3 이상에서 상대를 실탄으로 맞히면 피해 2. 재장전하면 1로.
// - 아이템: 돋보기(현재 탄 확인, 나만 앎) · 배출 레버(현재 탄 버리고 공개) · 강화탄(다음 실탄 피해 +1) · 붕대(체력 +1)
import { createRng } from './rng.js?v=mwsw8wdn';
import { ITEMS } from './items.js?v=mwsw8wdn';

export const VS = {
  hp: 4,
  roundsToWin: 2,
  itemsPerReload: 2,
  maxItems: 4,
  heatForDouble: 3,
};
const VS_ITEMS = Object.keys(ITEMS); // peek, eject, hollow, bandage

const other = (i) => 1 - i;

export function newVersus(seed = (Math.random() * 2 ** 32) >>> 0) {
  const state = {
    mode: 'versus',
    seed,
    rng: { s: seed >>> 0 },
    round: 0,
    wins: [0, 0],
    hp: [VS.hp, VS.hp],
    turn: 0,
    phase: 'play', // 'play' | 'roundOver' | 'over'
    winner: null,
    shells: [],
    spent: [],
    loaded: { live: 0, blank: 0 },
    chamberNo: 0,
    heat: [1, 1],
    items: [[], []],
    peeked: [null, null], // 각자 돋보기로 본 현재 탄 (본인에게만 보여줌)
    hollow: [false, false],
    seq: 0,
  };
  const events = [];
  startRound(state, events);
  return { state, events };
}

function startRound(state, events) {
  state.round += 1;
  state.hp = [VS.hp, VS.hp];
  state.items = [[], []];
  state.heat = [1, 1];
  state.hollow = [false, false];
  state.chamberNo = 0;
  state.phase = 'play';
  // 판마다 선공을 번갈아
  state.turn = (state.round - 1) % 2;
  events.push({ type: 'roundStart', round: state.round, first: state.turn });
  reload(state, events);
}

function reload(state, events) {
  const rng = createRng(state.rng);
  const total = rng.int(2, 8);
  const live = rng.int(1, total - 1);
  state.shells = rng.shuffle([...Array(live).fill(true), ...Array(total - live).fill(false)]);
  state.spent = [];
  state.loaded = { live, blank: total - live };
  state.chamberNo += 1;
  state.heat = [1, 1];
  state.peeked = [null, null];
  events.push({ type: 'reload', live, blank: total - live, chamberNo: state.chamberNo });
  for (const p of [0, 1]) {
    const got = [];
    for (let k = 0; k < VS.itemsPerReload && state.items[p].length < VS.maxItems; k++) {
      const id = rng.pick(VS_ITEMS);
      state.items[p].push(id);
      got.push(id);
    }
    if (got.length) events.push({ type: 'itemGained', player: p, items: got });
  }
}

const invalid = (events, reason) => { events.push({ type: 'invalid', reason }); return events; };

// player: 행동하는 사람(0/1). 차례가 아니면 거부.
export function actVersus(state, player, action) {
  const events = [];
  if (action?.type === 'nextRound') {
    if (state.phase !== 'roundOver') return invalid(events, '아직 판이 끝나지 않았다');
    startRound(state, events);
    state.seq += 1;
    return events;
  }
  if (state.phase !== 'play') return invalid(events, '게임이 끝났다');
  if (player !== state.turn) return invalid(events, '상대 차례다');
  if (action?.type === 'shoot') shoot(state, player, action.target === 'self' ? player : other(player), events);
  else if (action?.type === 'useItem') useItem(state, player, action.index, events);
  else return invalid(events, '알 수 없는 행동');
  if (!events.some((e) => e.type === 'invalid')) state.seq += 1;
  return events;
}

function shoot(state, shooter, target, events) {
  const live = state.shells.shift();
  state.spent.push(live);
  state.peeked = [null, null];
  const hollow = state.hollow[shooter];
  state.hollow[shooter] = false;
  events.push({ type: 'shot', shooter, target, live });

  let keepTurn = false;
  if (live) {
    let dmg = 1;
    if (target !== shooter && state.heat[shooter] >= VS.heatForDouble) dmg += 1;
    if (hollow) dmg += 1;
    state.hp[target] = Math.max(0, state.hp[target] - dmg);
    events.push({ type: 'damage', player: target, amount: dmg, hp: state.hp[target] });
  } else if (target === shooter) {
    state.heat[shooter] += 1;
    events.push({ type: 'heat', player: shooter, heat: state.heat[shooter] });
    keepTurn = true;
  }

  if (state.hp[target] <= 0) return endRound(state, other(target), events);
  if (state.shells.length === 0) reload(state, events);
  if (!keepTurn) state.turn = other(state.turn);
  events.push({ type: 'turn', player: state.turn });
}

function endRound(state, winner, events) {
  state.wins[winner] += 1;
  events.push({ type: 'roundWin', player: winner, wins: [...state.wins] });
  if (state.wins[winner] >= VS.roundsToWin) {
    state.phase = 'over';
    state.winner = winner;
    events.push({ type: 'matchWin', player: winner });
  } else {
    state.phase = 'roundOver';
  }
}

function useItem(state, player, index, events) {
  const id = state.items[player][index];
  if (!id) return invalid(events, '아이템이 없다');
  if (id === 'bandage' && state.hp[player] >= VS.hp) return invalid(events, '체력이 가득 찼다');
  if (id === 'hollow' && state.hollow[player]) return invalid(events, '이미 강화탄을 넣었다');
  state.items[player].splice(index, 1);
  events.push({ type: 'itemUsed', player, id });
  if (id === 'peek') {
    state.peeked[player] = state.shells[0];
    events.push({ type: 'peek', player, live: state.shells[0] });
  } else if (id === 'eject') {
    const live = state.shells.shift();
    state.spent.push(live);
    state.peeked = [null, null];
    events.push({ type: 'eject', player, live });
    if (state.shells.length === 0) reload(state, events);
  } else if (id === 'hollow') {
    state.hollow[player] = true;
    events.push({ type: 'empower', player });
  } else if (id === 'bandage') {
    state.hp[player] += 1;
    events.push({ type: 'heal', player, hp: state.hp[player] });
  }
}

// 온라인용: 특정 플레이어에게 보여줄 상태 (탄 순서는 숨기고, 돋보기 결과는 본인 것만)
export function viewFor(state, player) {
  const { shells, rng, peeked, ...rest } = state;
  const liveLeft = shells.filter(Boolean).length;
  return {
    ...rest,
    left: { live: liveLeft, blank: shells.length - liveLeft },
    myPeek: peeked[player],
  };
}

// 이벤트도 상대에게 보낼 때는 돋보기 결과를 가린다
export function eventsFor(events, player) {
  return events.map((e) => (e.type === 'peek' && e.player !== player ? { type: 'peek', player: e.player, hidden: true } : e));
}
