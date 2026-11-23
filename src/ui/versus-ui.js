// 홈 화면 + 1:1 결투(같은 기기 / 온라인) UI.
// 3D 씬은 로그라이크와 같은 테이블을 쓴다: 나는 앞자리('player'), 상대는 딜러 자리('dealer').
import { newVersus, actVersus, viewFor, VS } from '../core/versus.js?v=mwsw8wdn';
import { createOnlineMatch } from '../core/online.js?v=mwsw8wdn';
import { ITEMS } from '../core/items.js?v=mwsw8wdn';
import { openPeerRoom, randomCode, normalizeCode } from './net-peer.js?v=mwsw8wdn';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createVersusUI({ app, fxEl, scene, playEvents, sfx, isMuted, toggleMute, onSolo }) {
  let screen = 'home';     // 'home' | 'lobby' | 'versus'
  let kind = null;         // 'local' | 'online'
  let local = null;        // 같은 기기: 진짜 상태
  let online = null;       // 온라인: createOnlineMatch 결과
  let room = null;
  let view = null;         // 화면에 그릴 상태 (viewFor 결과)
  let me = 0;              // 내 자리 (온라인 참가자는 1)
  let lockedUntil = 0;
  let toast = '';
  let lobby = { status: 'idle', code: '', error: '', joinCode: '' };
  let opponentLeft = false;
  let fxTimer = null;

  const names = () => (kind === 'online'
    ? [me === 0 ? '나' : '상대', me === 1 ? '나' : '상대']
    : ['P1', 'P2']);
  const locked = () => performance.now() < lockedUntil;

  // 같은 기기에서는 지금 차례인 사람이 '나'처럼 돋보기 결과를 본다
  const currentView = () => (kind === 'local' ? viewFor(local, local.turn) : view);

  // ── 3D 씬/소리용 변환: 나 = player, 상대 = dealer ──
  const seat = (p) => (p === me ? 'player' : 'dealer');
  function sceneState(v) {
    const opp = 1 - me;
    const total = v.left.live + v.left.blank;
    return {
      phase: v.phase === 'play' ? (v.turn === me ? 'player' : 'dealer') : 'player',
      stage: v.round,
      duel: { shells: Array(total).fill(false), spent: v.spent, knownCurrent: v.myPeek ?? null, score: v.wins[me], quota: VS.roundsToWin, heat: v.heat[me], chamberNo: v.chamberNo },
      player: { pouch: { hand: [], draw: [], discard: [] }, charms: [], hp: v.hp[me] },
      dealer: { hp: v.hp[opp], maxHp: VS.hp },
      result: null,
    };
  }
  function mapEvents(events) {
    const out = [];
    for (const e of events) {
      if (e.type === 'shot') out.push({ ...e, shooter: seat(e.shooter), target: seat(e.target) });
      else if (e.type === 'damage') out.push({ type: 'damage', who: seat(e.player), amount: e.amount, hp: e.hp });
      else if (e.type === 'heat') out.push({ type: 'heat', gain: 1, heat: e.heat });
      else if (e.type === 'itemUsed') out.push({ type: 'itemUsed', id: e.id });
      else if (e.type === 'reload' || e.type === 'peek' || e.type === 'eject') out.push(e);
      else if (e.type === 'roundWin') out.push(kind === 'local' || e.player === me ? { type: 'stageClear', bonus: 0 } : { type: 'gameOver', reason: 'dead' });
      else if (e.type === 'matchWin') out.push(kind === 'local' || e.player === me ? { type: 'victory' } : { type: 'gameOver', reason: 'quota' });
    }
    return out;
  }

  function showEvents(events) {
    const mapped = mapEvents(events);
    const duration = scene.play(mapped);
    playEvents(mapped, {});
    lockedUntil = performance.now() + duration;
    const shot = events.find((e) => e.type === 'shot');
    const dmg = events.find((e) => e.type === 'damage');
    const heat = events.find((e) => e.type === 'heat');
    const n = names();
    if (shot) {
      clearTimeout(fxTimer);
      setTimeout(() => {
        fxEl.innerHTML = `<div class="flash">
          <div class="bang ${shot.live ? 'live' : 'blank'}">${shot.live ? 'BANG!' : '...click'}</div>
          ${dmg ? `<div class="pts">${esc(n[dmg.player])} 체력 <b>-${dmg.amount}</b></div>` : ''}
          ${heat ? `<div class="heatup">🔥 배수 UP <b>×${heat.heat}</b><small>배수 ${VS.heatForDouble} 이상에서 맞히면 피해 2</small></div>` : ''}
        </div>`;
        fxTimer = setTimeout(() => { fxEl.innerHTML = ''; }, 2400);
      }, 650);
    }
    if (duration) setTimeout(render, duration + 30);
  }

  function refresh() {
    if (screen === 'versus') {
      const v = currentView();
      if (v) scene.update(sceneState(v), { betSlots: 0 });
    }
    render();
  }

  // ── 같은 기기 2인 ──
  function startLocal() {
    kind = 'local';
    me = 0;
    const r = newVersus();
    local = r.state;
    screen = 'versus';
    opponentLeft = false;
    toast = '';
    refresh();
    showEvents(r.events);
  }

  // ── 온라인 ──
  async function host() {
    kind = 'online';
    me = 0;
    screen = 'lobby';
    lobby = { status: 'connecting', code: randomCode(), error: '', joinCode: '' };
    render();
    try {
      room = await openPeerRoom({ code: lobby.code, host: true });
      lobby.status = 'waiting';
      online = createOnlineMatch({
        room, role: 'host',
        onUpdate: (v, ev) => { view = v; if (screen === 'versus') { refresh(); showEvents(ev); } },
        onStatus: ({ opponentHere }) => onOpponent(opponentHere),
      });
      view = online.view;
      render();
    } catch (e) {
      lobby.status = 'error';
      lobby.error = e.message;
      render();
    }
  }

  async function join(codeText) {
    const code = normalizeCode(codeText);
    if (code.length < 4) { lobby.error = '방 코드를 입력하자'; render(); return; }
    kind = 'online';
    me = 1;
    screen = 'lobby';
    lobby = { status: 'connecting', code, error: '', joinCode: code };
    render();
    try {
      room = await openPeerRoom({ code, host: false });
      lobby.status = 'waiting';
      online = createOnlineMatch({
        room, role: 'guest',
        onUpdate: (v, ev) => {
          view = v;
          if (screen !== 'versus') { screen = 'versus'; opponentLeft = false; }
          refresh();
          showEvents(ev);
        },
        onStatus: ({ opponentHere }) => onOpponent(opponentHere),
      });
      render();
    } catch (e) {
      lobby.status = 'error';
      lobby.error = e.message;
      render();
    }
  }

  function onOpponent(here) {
    if (here && screen === 'lobby' && me === 0) {
      screen = 'versus';
      opponentLeft = false;
      sfx.select(true);
      refresh();
    } else if (!here && screen === 'versus' && kind === 'online') {
      opponentLeft = true;
      render();
    }
  }

  function leave() {
    online?.stop();
    room?.leave();
    online = null;
    room = null;
    local = null;
    view = null;
    screen = 'home';
    kind = null;
    fxEl.innerHTML = '';
    render();
  }

  function doAct(action) {
    if (locked()) return;
    let events;
    if (kind === 'local') {
      events = actVersus(local, local.turn, action);
    } else {
      events = online.act(action);
    }
    const bad = events.find((e) => e.type === 'invalid');
    toast = bad ? bad.reason : '';
    if (bad) sfx.deny();
    if (kind === 'local' && !bad) { refresh(); showEvents(events); } else render();
  }

  // ── 렌더링 ──
  const hearts = (n) => Array.from({ length: VS.hp }, (_, i) => `<i class="hp ${i < n ? 'on' : ''} me"></i>`).join('');
  const winDots = (w) => Array.from({ length: VS.roundsToWin }, (_, i) => `<span class="wd ${i < w ? 'on' : ''}">★</span>`).join('');

  function renderHome() {
    const busy = lobby.status === 'connecting';
    return `<div class="overlay home-wrap"><div class="home">
      <h1 class="logo">LUCKY<br>CHAMBER</h1>
      <p class="tag">실탄인가, 공포탄인가. 판돈을 걸고 방아쇠를 당겨라.</p>
      <div class="modes">
        <button class="mode solo" data-vact="solo"><b>🎲 혼자 하기</b><small>딜러와 8스테이지 로그라이크. 칩과 부적으로 큰 한 방을 노려라.</small></button>
        <button class="mode local" data-vact="local"><b>👥 둘이 하기</b><small>한 기기에서 번갈아 쏘는 1:1 결투. 3판 2선승.</small></button>
        <div class="mode online">
          <b>🌐 온라인 대전</b><small>방을 만들고 코드를 친구에게 보내거나, 받은 코드로 들어간다.</small>
          <div class="online-row">
            <button data-vact="host" ${busy ? 'disabled' : ''}>방 만들기</button>
            <input id="join-code" maxlength="8" placeholder="방 코드" value="${esc(lobby.joinCode)}" autocomplete="off" />
            <button data-vact="join" ${busy ? 'disabled' : ''}>참가</button>
          </div>
          ${lobby.error ? `<p class="err">${esc(lobby.error)}</p>` : ''}
        </div>
      </div>
      <div class="home-meta">
        <button class="link" data-vact="manual">📖 설명서</button>
        <button class="link" data-vact="mute">${isMuted() ? '🔇 소리 켜기' : '🔊 소리'}</button>
      </div>
    </div></div>`;
  }

  function renderLobby() {
    const link = `${location.origin}${location.pathname}?join=${lobby.code}`;
    let body;
    if (lobby.status === 'connecting') body = `<p class="sub">${me === 0 ? '방을 여는 중…' : `방 ${esc(lobby.code)}에 연결하는 중…`}</p>`;
    else if (lobby.status === 'error') body = `<p class="err">${esc(lobby.error)}</p>`;
    else if (me === 0) {
      body = `<p class="sub">친구에게 이 코드를 알려주자. 들어오면 바로 시작한다.</p>
        <div class="code">${esc(lobby.code)}</div>
        <div class="row center"><button data-vact="copy" data-text="${esc(link)}">초대 링크 복사</button></div>
        <p class="wait center">상대를 기다리는 중…</p>`;
    } else body = '<p class="wait center">방장이 게임을 준비하는 중…</p>';
    return `<div class="overlay home-wrap"><div class="panel lobby">
      <h2>🌐 온라인 대전</h2>${body}
      ${toast ? `<p class="toast">${esc(toast)}</p>` : ''}
      <div class="row"><button data-vact="home">← 홈으로</button></div>
    </div></div>`;
  }

  function renderVersus() {
    const v = currentView();
    if (!v) return '';
    const n = names();
    const actor = kind === 'local' ? v.turn : me;
    const myTurn = v.phase === 'play' && v.turn === actor && (kind === 'local' || v.turn === me);
    const pending = kind === 'online' && online?.pending;
    const busy = !myTurn || locked() || pending;
    const total = v.left.live + v.left.blank;
    const pLive = v.myPeek !== null && v.myPeek !== undefined ? (v.myPeek ? 1 : 0) : v.left.live / Math.max(1, total);
    const heat = v.heat[actor];
    const dmg = 1 + (heat >= VS.heatForDouble ? 1 : 0) + (v.hollow[actor] ? 1 : 0);
    const items = v.items[actor];
    const turnText = v.phase !== 'play' ? ''
      : kind === 'local' ? `<b>${n[v.turn]}</b> 차례`
      : v.turn === me ? '<b>내 차례</b>' : '<span class="wait">상대가 고민 중…</span>';

    const player = (p) => `<div class="plate vs-p ${v.phase === 'play' && v.turn === p ? 'on' : ''}">
      <small>${esc(n[p])}${kind === 'online' && p === me ? ' (나)' : ''}</small>
      <div>${hearts(v.hp[p])}</div>
      <small>배수 ×${v.heat[p]}${v.hollow[p] ? ' · 💥' : ''} · ${winDots(v.wins[p])}</small>
    </div>`;

    let overlay = '';
    if (opponentLeft) {
      overlay = `<div class="overlay"><div class="panel end"><h2>상대가 나갔다</h2><div class="row"><button class="primary" data-vact="home">홈으로</button></div></div></div>`;
    } else if (v.phase === 'roundOver') {
      const w = v.hp[0] > 0 ? 0 : 1; // 체력이 남은 쪽이 이번 판 승자
      const canNext = kind === 'local' || me === 0;
      overlay = `<div class="overlay"><div class="panel end">
        <h2>${esc(n[w])} 판 승리</h2>
        <p>${winDots(v.wins[0])} ${esc(n[0])} ${v.wins[0]} : ${v.wins[1]} ${esc(n[1])} ${winDots(v.wins[1])}</p>
        <div class="row">${canNext ? '<button class="primary" data-vact="next">다음 판 →</button>' : '<p class="wait">방장이 다음 판을 시작하길 기다리는 중…</p>'}</div>
      </div></div>`;
    } else if (v.phase === 'over') {
      const iWon = kind === 'local' || v.winner === me;
      overlay = `<div class="overlay"><div class="panel end">
        <h2>${kind === 'local' ? `🏆 ${esc(n[v.winner])} 최종 승리` : iWon ? '🏆 승리' : '☠ 패배'}</h2>
        <p>${esc(n[0])} ${v.wins[0]} : ${v.wins[1]} ${esc(n[1])}</p>
        <div class="row">${kind === 'local' ? '<button data-vact="local">다시 하기</button>' : ''}<button class="primary" data-vact="home">홈으로</button></div>
      </div></div>`;
    }

    return `
    <header class="hud-top vs">
      ${player(0)}
      <div class="plate vs-mid"><b>ROUND ${v.round}</b><small>3판 2선승 · 약실 ${v.chamberNo}</small></div>
      ${player(1)}
    </header>
    <section class="hud-bottom">
      <div class="odds">
        <span class="shells">${'<i class="sh live"></i>'.repeat(v.left.live)}${'<i class="sh blank"></i>'.repeat(v.left.blank)}</span>
        <span class="pct">실탄 <b>${Math.round(pLive * 100)}%</b>${v.myPeek !== null && v.myPeek !== undefined ? `<small>🔍 ${v.myPeek ? '실탄' : '공포탄'}</small>` : ''}</span>
        <span class="hint">${turnText}</span>
      </div>
      <div class="controls">
        <div class="me"><small>${esc(n[actor])} 아이템</small></div>
        <div class="items">${Array.from({ length: VS.maxItems }, (_, i) => {
          const id = items[i];
          if (!id) return '<button class="item empty" disabled></button>';
          const it = ITEMS[id];
          return `<button class="item" data-vact="item" data-index="${i}" title="${esc(it.name)}: ${esc(it.desc)}" ${busy ? 'disabled' : ''}>${it.icon}</button>`;
        }).join('')}</div>
      </div>
      <div class="actions">
        <button class="shoot dealer-btn" data-vact="shoot" data-target="opponent" ${busy ? 'disabled' : ''}>상대를 쏜다<small>실탄이면 <b>피해 ${dmg}</b> · 차례 넘어감</small></button>
        <button class="shoot self-btn" data-vact="shoot" data-target="self" ${busy ? 'disabled' : ''}>나를 쏜다<small>공포탄이면 <b>배수 ×${heat + 1}</b> · 실탄이면 체력 -1</small></button>
      </div>
      ${toast ? `<p class="toast">${esc(toast)}</p>` : ''}
      <div class="meta">
        <button class="link" data-vact="home">← 홈</button>
        <button class="link" data-vact="mute">${isMuted() ? '🔇 소리 켜기' : '🔊 소리'}</button>
        ${kind === 'online' ? `<span>방 ${esc(lobby.code)}</span>` : '<span>같은 기기 2인</span>'}
        <span>배수 ${VS.heatForDouble} 이상에서 맞히면 피해 2</span>
      </div>
    </section>
    ${overlay}`;
  }

  function render() {
    if (screen === 'home') app.innerHTML = renderHome();
    else if (screen === 'lobby') app.innerHTML = renderLobby();
    else app.innerHTML = renderVersus();
  }

  function handleClick(btn) {
    const { vact, target, index, text } = btn.dataset;
    if (vact === 'solo') return onSolo();
    if (vact === 'local') { sfx.click(); return startLocal(); }
    if (vact === 'host') { sfx.click(); return host(); }
    if (vact === 'join') { sfx.click(); return join(document.getElementById('join-code')?.value); }
    if (vact === 'home') { sfx.click(); return leave(); }
    if (vact === 'mute') { toggleMute(); return render(); }
    if (vact === 'manual') return onSolo({ manual: true });
    if (vact === 'copy') {
      navigator.clipboard?.writeText(text).then(() => { toast = '초대 링크를 복사했다'; render(); }, () => { toast = text; render(); });
      return;
    }
    if (vact === 'shoot') return doAct({ type: 'shoot', target });
    if (vact === 'item') return doAct({ type: 'useItem', index: Number(index) });
    if (vact === 'next') return doAct({ type: 'nextRound' });
  }

  function handleKey(ev) {
    if (screen === 'home' && ev.key === 'Enter' && document.activeElement?.id === 'join-code') {
      join(document.activeElement.value);
      return;
    }
    if (screen !== 'versus') return;
    if (ev.key === 'd' || ev.key === 'D') doAct({ type: 'shoot', target: 'opponent' });
    else if (ev.key === 's' || ev.key === 'S') doAct({ type: 'shoot', target: 'self' });
  }

  return {
    get active() { return screen !== 'off'; },
    get screen() { return screen; },
    showHome() { screen = 'home'; render(); },
    hide() { screen = 'off'; },
    render,
    handleClick,
    handleKey,
    join,
  };
}
