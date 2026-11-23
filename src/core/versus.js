// 결투 모드 (2~4명, 로컬 / 온라인). 로그라이크 엔진과 별개인 순수 로직.
//
// 규칙
// - 2판 먼저 이기면 승리. 판마다 모두 체력 4로 시작, 마지막까지 살아남은 사람이 그 판 승자.
// - 약실을 장전하면 실탄/공포탄 개수만 공개. 장전할 때마다 살아 있는 사람은 아이템 2개(최대 4개).
// - 차례에 할 수 있는 것: 누군가를 쏜다 / 나를 쏜다 / 아이템 사용. 차례는 살아 있는 다음 사람에게.
//   - 다른 사람을 쏘면 맞든 안 맞든 차례가 넘어간다.
//   - 나를 쏴서 공포탄이면 배수 +1, 내 차례 유지. 실탄이면 체력 -1, 차례 넘어감.
// - 배수(이 게임의 고유 규칙): 배수 3 이상에서 다른 사람을 실탄으로 맞히면 피해 2. 재장전하면 1로.
// - 아이템: 돋보기(현재 탄 확인, 나만 앎) · 배출 레버(현재 탄 버리고 공개) · 강화탄(다음 실탄 피해 +1) · 붕대(체력 +1)
import { createRng } from './rng.js?v=mwswysnb';
import { ITEMS } from './items.js?v=mwswysnb';

export const VS = {
  hp: 4,
  roundsToWin: 2,
  itemsPerReload: 2,
  maxItems: 4,
  heatForDouble: 3,
  minPlayers: 2,
  maxPlayers: 4,
};
const VS_ITEMS = Object.keys(ITEMS); // peek, eject, hollow, bandage

export function newVersus(seed = (Math.random() * 2 ** 32) >>> 0, players = 2) {
  const n = Math.max(VS.minPlayers, Math.min(VS.maxPlayers, players | 0));
  const fill = (v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));
  const state = {
    mode: 'versus',
    seed,
    rng: { s: seed >>> 0 },
    players: n,
    round: 0,
    wins: fill(0),
    hp: fill(VS.hp),
    turn: 0,
    phase: 'play', // 'play' | 'roundOver' | 'over'
    roundWinner: null,
    winner: null,
    shells: [],
    spent: [],
    loaded: { live: 0, blank: 0 },
    chamberNo: 0,
    heat: fill(1),
    items: fill(() => []),
    peeked: fill(null), // 각자 돋보기로 본 현재 탄 (본인에게만 보여줌)
    hollow: fill(false),
    seq: 0,
  };
  const events = [];
  startRound(state, events);
  return { state, events };
}

const alive = (state) => state.hp.map((h, i) => (h > 0 ? i : -1)).filter((i) => i >= 0);
function nextAlive(state, from) {
  for (let k = 1; k <= state.players; k++) {
    const i = (from + k) % state.players;
    if (state.hp[i] > 0) return i;
  }
  return from;
}

function startRound(state, events) {
  const n = state.players;
  state.round += 1;
  state.hp = Array(n).fill(VS.hp);
  state.items = Array.from({ length: n }, () => []);
  state.heat = Array(n).fill(1);
  state.hollow = Array(n).fill(false);
  state.chamberNo = 0;
  state.phase = 'play';
  state.roundWinner = null;
  // 판마다 선공을 돌아가며
  state.turn = (state.round - 1) % n;
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
  state.heat = state.heat.map(() => 1);
  state.peeked = state.peeked.map(() => null);
  events.push({ type: 'reload', live, blank: total - live, chamberNo: state.chamberNo });
  for (const p of alive(state)) {
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

// player: 행동하는 사람. 차례가 아니면 거부.
// shoot의 target: 'self' | 플레이어 번호 | 'opponent'(다음 사람, 2인용 단축)
export function actVersus(state, player, action) {
  const events = [];
  if (action?.type === 'nextRound') {
    if (state.phase !== 'roundOver') return invalid(events, '아직 판이 끝나지 않았다');
    startRound(state, events);
    state.seq += 1;
    return events;
  }
  if (state.phase !== 'play') return invalid(events, '게임이 끝났다');
  if (player !== state.turn) return invalid(events, '내 차례가 아니다');
  if (action?.type === 'shoot') {
    let target = action.target;
    if (target === 'self') target = player;
    else if (target === 'opponent') target = nextAlive(state, player);
    if (!Number.isInteger(target) || target < 0 || target >= state.players) return invalid(events, '대상이 잘못됨');
    if (state.hp[target] <= 0) return invalid(events, '이미 쓰러진 사람이다');
    shoot(state, player, target, events);
  } else if (action?.type === 'useItem') useItem(state, player, action.index, events);
  else return invalid(events, '알 수 없는 행동');
  if (!events.some((e) => e.type === 'invalid')) state.seq += 1;
  return events;
}

function shoot(state, shooter, target, events) {
  const live = state.shells.shift();
  state.spent.push(live);
  state.peeked = state.peeked.map(() => null);
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
    if (state.hp[target] === 0) events.push({ type: 'eliminated', player: target });
  } else if (target === shooter) {
    state.heat[shooter] += 1;
    events.push({ type: 'heat', player: shooter, heat: state.heat[shooter] });
    keepTurn = true;
  }

  const left = alive(state);
  if (left.length <= 1) return endRound(state, left[0] ?? shooter, events);
  if (state.shells.length === 0) reload(state, events);
  if (!keepTurn || state.hp[state.turn] <= 0) state.turn = nextAlive(state, state.turn);
  events.push({ type: 'turn', player: state.turn });
}

function endRound(state, winner, events) {
  state.wins[winner] += 1;
  state.roundWinner = winner;
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
    state.peeked = state.peeked.map(() => null);
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

// 게임 중 나간 사람: 탈락 처리 (차례였으면 다음 사람에게 넘긴다)
export function forfeit(state, player) {
  const events = [];
  if (state.phase === 'over' || state.hp[player] <= 0) return events;
  state.hp[player] = 0;
  events.push({ type: 'eliminated', player, left: true });
  if (state.phase !== 'play') return events;
  const left = alive(state);
  if (left.length <= 1) { endRound(state, left[0], events); return events; }
  if (state.turn === player) { state.turn = nextAlive(state, player); events.push({ type: 'turn', player: state.turn }); }
  state.seq += 1;
  return events;
}

// 특정 플레이어에게 보여줄 상태 (탄 순서는 숨기고, 돋보기 결과는 본인 것만)
export function viewFor(state, player) {
  const { shells, rng, peeked, ...rest } = state;
  const liveLeft = shells.filter(Boolean).length;
  return {
    ...rest,
    left: { live: liveLeft, blank: shells.length - liveLeft },
    myPeek: peeked[player] ?? null,
  };
}

// 이벤트도 다른 사람에게 보낼 때는 돋보기 결과를 가린다
export function eventsFor(events, player) {
  return events.map((e) => (e.type === 'peek' && e.player !== player ? { type: 'peek', player: e.player, hidden: true } : e));
}
