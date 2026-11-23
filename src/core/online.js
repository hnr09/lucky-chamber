// 온라인 결투 동기화 (2~4명). 연결 방식과 무관한 순수 로직.
// - 방장(host, 자리 0)이 게임을 진행한다. 참가자는 들어온 순서대로 자리 1, 2, 3.
// - 방장은 참가자마다 그 사람에게 보여줄 화면(viewFor: 탄 순서 없음, 자기 돋보기 결과만)을 따로 보낸다.
// - 참가자는 자기 행동만 보낸다. 판정은 항상 방장.
// - 조준(누구를 노리는지)은 게임 상태가 아닌 '시선' 정보: 차례인 사람이 보내면 방장이 모두에게 전달한다.
//
// hub(방장 쪽 연결): onJoin(fn(id)), onLeave(fn(id)), onMessage(fn(id, msg)), send(id, msg)
// link(참가자 쪽 연결): onMessage(fn(msg)), send(msg)
import { newVersus, actVersus, viewFor, eventsFor, forfeit, VS } from './versus.js?v=mwsx9ehs';

export function createOnlineHost({ hub, seed, onLobby, onUpdate, onGaze }) {
  const seats = ['host'];       // seats[i] = 연결 id (0은 방장)
  let state = null;
  let view = null;

  const lobbyInfo = () => ({ players: seats.length, max: VS.maxPlayers, started: !!state });
  const sendLobby = () => {
    seats.forEach((id, i) => { if (i > 0) hub.send(id, { t: 'lobby', ...lobbyInfo(), me: i }); });
    onLobby?.({ ...lobbyInfo(), me: 0 });
  };
  const broadcast = (events) => {
    // 쏘거나 차례가 바뀌면 시선 초기화
    if (gaze && events.some((e) => e.type === 'shot' || e.type === 'turn' || e.type === 'roundStart' || e.type === 'eliminated')) { gaze = null; sendGaze(); }
    seats.forEach((id, i) => {
      if (i > 0 && id) hub.send(id, { t: 'state', me: i, view: viewFor(state, i), events: eventsFor(events, i) });
    });
    view = viewFor(state, 0);
    onUpdate?.(view, eventsFor(events, 0));
  };

  hub.onJoin((id) => {
    if (state || seats.length >= VS.maxPlayers) { hub.send(id, { t: 'full', reason: state ? '이미 시작한 방이다' : '방이 가득 찼다' }); return; }
    seats.push(id);
    sendLobby();
  });
  hub.onLeave((id) => {
    const i = seats.indexOf(id);
    if (i <= 0) return;
    if (!state) { seats.splice(i, 1); sendLobby(); return; }
    seats[i] = null; // 게임 중이면 자리는 남기고 탈락 처리
    const events = forfeit(state, i);
    broadcast(events);
  });
  // 시선: 차례인 사람의 조준만 받아서 모두에게 알린다
  let gaze = null;
  const sendGaze = () => {
    seats.forEach((id, i) => { if (i > 0 && id) hub.send(id, { t: 'gaze', gaze }); });
    onGaze?.(gaze);
  };
  const setGaze = (seat, target) => {
    if (!state || state.phase !== 'play' || state.turn !== seat) return;
    const valid = target === null || (Number.isInteger(target) && target >= 0 && target < state.players && state.hp[target] > 0);
    if (!valid) return;
    gaze = target === null ? null : { from: seat, to: target };
    sendGaze();
  };
  hub.onMessage((id, msg) => {
    const i = seats.indexOf(id);
    if (i > 0 && msg?.t === 'gaze') { setGaze(i, msg.target ?? null); return; }
    if (i <= 0 || !state || msg?.t !== 'act') return;
    const events = actVersus(state, i, msg.action);
    if (events.some((e) => e.type === 'invalid')) { hub.send(id, { t: 'state', me: i, view: viewFor(state, i), events }); return; }
    broadcast(events);
  });

  sendLobby();
  return {
    me: 0,
    get view() { return view; },
    get players() { return seats.length; },
    get started() { return !!state; },
    start() {
      if (state || seats.length < VS.minPlayers) return false;
      const r = newVersus(seed, seats.length);
      state = r.state;
      broadcast(r.events);
      return true;
    },
    aim(target) { setGaze(0, target); },
    act(action) {
      if (!state) return [{ type: 'invalid', reason: '아직 시작하지 않았다' }];
      const events = actVersus(state, 0, action);
      if (events.some((e) => e.type === 'invalid')) return events;
      broadcast(events);
      return events;
    },
  };
}

export function createOnlineGuest({ link, onLobby, onUpdate, onRefused, onGaze }) {
  let view = null;
  let me = null;
  let pending = false;
  link.onMessage((msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'lobby') { me = msg.me; onLobby?.(msg); }
    else if (msg.t === 'full') onRefused?.(msg.reason || '들어갈 수 없는 방이다');
    else if (msg.t === 'gaze') onGaze?.(msg.gaze && Number.isInteger(msg.gaze.from) && Number.isInteger(msg.gaze.to) ? msg.gaze : null);
    else if (msg.t === 'state' && msg.view) {
      me = msg.me;
      view = msg.view;
      pending = false;
      onUpdate?.(view, Array.isArray(msg.events) ? msg.events : []);
    }
  });
  return {
    get me() { return me; },
    get view() { return view; },
    get pending() { return pending; },
    aim(target) {
      if (!view || view.turn !== me) return;
      link.send({ t: 'gaze', target });
    },
    act(action) {
      if (pending) return [{ type: 'invalid', reason: '방장 응답을 기다리는 중' }];
      if (!view) return [{ type: 'invalid', reason: '아직 시작하지 않았다' }];
      if (action.type !== 'nextRound' && view.turn !== me) return [{ type: 'invalid', reason: '내 차례가 아니다' }];
      if (action.type === 'nextRound') return [{ type: 'invalid', reason: '방장이 다음 판을 시작한다' }];
      pending = true;
      link.send({ t: 'act', action });
      return [];
    },
  };
}
