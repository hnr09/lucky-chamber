// 온라인 결투 동기화: claude.ai 아티팩트의 room(presence)만으로 동작한다. 서버 없음.
// - 방장(host, 플레이어 0)이 게임을 진행하고, 상대에게 보여줄 화면(viewFor)과 이벤트를 presence에 싣는다.
// - 참가자(guest, 플레이어 1)는 자기 행동만 presence에 싣는다 ({n, action}: n이 오르면 새 행동).
// - presence는 '마지막 값'만 전달되므로, 참가자는 방장의 새 화면을 받기 전엔 다음 행동을 보내지 않는다.
// room 인터페이스: presence(patch), onPeers(handler) → unsubscribe, peers()
import { newVersus, actVersus, viewFor, eventsFor } from './versus.js';

export function createOnlineMatch({ room, role, seed, onUpdate, onStatus }) {
  const me = role === 'host' ? 0 : 1;
  let state = null;          // 방장만 진짜 상태를 가진다
  let view = null;           // 내 화면
  let evSeq = 0;             // 방장이 보낸 이벤트 묶음 번호
  let lastEvSeen = 0;        // 참가자가 처리한 이벤트 묶음 번호
  let actN = 0;              // 참가자가 보낸 행동 번호
  let lastActDone = 0;       // 방장이 처리한 참가자 행동 번호
  let opponentHere = false;
  let pending = false;       // 참가자: 행동을 보내고 응답 대기 중

  const publishHost = (events) => {
    evSeq += 1;
    room.presence({
      lc: { role: 'host', ev: evSeq, done: lastActDone, view: viewFor(state, 1), events: eventsFor(events, 1) },
    });
  };

  if (role === 'host') {
    const r = newVersus(seed);
    state = r.state;
    view = viewFor(state, 0);
    publishHost(r.events);
    onUpdate?.(view, r.events);
  } else {
    room.presence({ lc: { role: 'guest', act: null } });
  }

  const unsub = room.onPeers(({ peers }) => {
    const others = peers.filter((p) => !p.isMe && p.presence?.lc);
    const opp = others.find((p) => p.presence.lc.role === (role === 'host' ? 'guest' : 'host'));
    const here = !!opp;
    if (here !== opponentHere) {
      opponentHere = here;
      onStatus?.({ opponentHere: here });
      // 방장은 새로 들어온 상대에게 현재 화면을 다시 보낸다
      if (here && role === 'host') publishHost([]);
    }
    if (!opp) return;
    const lc = opp.presence.lc;

    if (role === 'host') {
      const act = lc.act;
      if (act && typeof act.n === 'number' && act.n > lastActDone) {
        lastActDone = act.n;
        const events = actVersus(state, 1, act.action);
        view = viewFor(state, 0);
        publishHost(events);
        onUpdate?.(view, events);
      }
    } else if (typeof lc.ev === 'number' && lc.ev > lastEvSeen && lc.view) {
      lastEvSeen = lc.ev;
      if (typeof lc.done === 'number' && lc.done >= actN) pending = false;
      view = lc.view;
      onUpdate?.(view, Array.isArray(lc.events) ? lc.events : []);
    }
  });

  return {
    me,
    get view() { return view; },
    get opponentHere() { return opponentHere; },
    get pending() { return pending; },
    act(action) {
      if (role === 'host') {
        const events = actVersus(state, 0, action);
        view = viewFor(state, 0);
        publishHost(events);
        onUpdate?.(view, events);
        return events;
      }
      if (pending) return [{ type: 'invalid', reason: '상대 응답을 기다리는 중' }];
      // 참가자 쪽 간단한 사전 확인 (최종 판정은 방장)
      if (action.type !== 'nextRound' && view && view.turn !== me) return [{ type: 'invalid', reason: '상대 차례다' }];
      actN += 1;
      pending = true;
      room.presence({ lc: { role: 'guest', act: { n: actN, action } } });
      return [];
    },
    stop() { unsub?.(); },
  };
}
