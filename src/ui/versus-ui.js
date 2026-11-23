// 홈 화면 + 결투(2~4명, 같은 기기 / 온라인) UI.
// 3D 씬은 로그라이크와 같은 테이블: 나는 앞자리(player), 다른 사람들은 차례 순서대로 왼쪽 · 맞은편 · 오른쪽.
// PC는 마우스로 바라보는 사람을 클릭해서 쏘고, 터치 기기는 대상별 버튼으로 쏜다.
import { newVersus, actVersus, viewFor, VS } from '../core/versus.js?v=mwswysnb';
import { createOnlineHost, createOnlineGuest } from '../core/online.js?v=mwswysnb';
import { ITEMS } from '../core/items.js?v=mwswysnb';
import { openPeerHub, openPeerLink, randomCode, normalizeCode } from './net-peer.js?v=mwswysnb';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEAT_ORDER = { 2: ['dealer'], 3: ['left', 'right'], 4: ['left', 'dealer', 'right'] };
const SEAT_LABEL = { player: '앞', dealer: '맞은편', left: '왼쪽', right: '오른쪽' };
const COLORS = ['#ffcf4a', '#7dff6a', '#ff6a5a', '#6ab8ff'];

// PC(정밀한 포인터)는 조준 사격, 터치 기기는 버튼
export const AIM_MODE = () => window.matchMedia?.('(pointer: fine)').matches ?? true;

export function createVersusUI({ app, fxEl, scene, playEvents, sfx, isMuted, toggleMute, onSolo }) {
  let screen = 'home';     // 'home' | 'lobby' | 'versus' | 'off'
  let kind = null;         // 'local' | 'online'
  let local = null;        // 같은 기기: 진짜 상태
  let host = null;         // 온라인 방장
  let guest = null;        // 온라인 참가자
  let net = null;          // hub 또는 link (닫기용)
  let view = null;
  let me = 0;
  let localCount = 2;
  let lockedUntil = 0;
  let toast = '';
  let lobby = { status: 'idle', code: '', error: '', joinCode: '', players: 1 };
  let disconnected = '';
  let aimId = null;
  let fxTimer = null;

  const locked = () => performance.now() < lockedUntil;
  const aiming = () => AIM_MODE();
  const nameOf = (p) => (kind === 'online' && p === me ? '나' : `P${p + 1}`);

  // 같은 기기: 지금 차례인 사람이 카메라 자리(나)
  const currentView = () => (kind === 'local' ? viewFor(local, local.turn) : view);
  const perspective = (v) => (kind === 'local' ? v.turn : me);

  const seatOf = (p, v, who = perspective(v)) => {
    if (p === who) return 'player';
    return SEAT_ORDER[v.players][(p - who + v.players) % v.players - 1];
  };

  function sceneState(v) {
    const who = perspective(v);
    const total = v.left.live + v.left.blank;
    const across = v.players === 3 ? null : v.players === 2 ? (who + 1) % 2 : (who + 2) % 4;
    return {
      phase: 'player',
      stage: v.round,
      duel: { shells: Array(total).fill(false), spent: v.spent, knownCurrent: v.myPeek ?? null, score: v.wins[who], quota: VS.roundsToWin, heat: v.heat[who], chamberNo: v.chamberNo },
      player: { pouch: { hand: [], draw: [], discard: [] }, charms: [], hp: v.hp[who] },
      dealer: { hp: across === null ? 0 : v.hp[across], maxHp: VS.hp },
      result: null,
    };
  }
  function seatsConf(v) {
    const conf = { dealer: { visible: false }, left: { visible: false }, right: { visible: false } };
    for (let p = 0; p < v.players; p++) {
      const s = seatOf(p, v);
      if (s !== 'player') conf[s] = { visible: true, alive: v.hp[p] > 0 };
    }
    return conf;
  }
  const isMyTurn = (v) => {
    const who = perspective(v);
    return v.phase === 'play' && v.turn === who && (kind === 'local' || who === me);
  };
  function aimConf(v) {
    if (!aiming() || !isMyTurn(v) || disconnected) return null;
    const who = perspective(v);
    const targets = [];
    for (let p = 0; p < v.players; p++) if (p !== who && v.hp[p] > 0) targets.push({ seat: seatOf(p, v), id: p });
    return { targets, self: who };
  }

  function mapEvents(events, v, who) {
    const out = [];
    const seat = (p) => seatOf(p, v, who);
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

  // who: 이벤트가 일어날 때의 시점 (같은 기기는 쏜 사람)
  function showEvents(events, v, who) {
    const mapped = mapEvents(events, v, who);
    const duration = scene.play(mapped);
    playEvents(mapped, {});
    lockedUntil = performance.now() + duration;
    if (duration) scene.setAim(null);
    const shot = events.find((e) => e.type === 'shot');
    const dmg = events.find((e) => e.type === 'damage');
    const elim = events.find((e) => e.type === 'eliminated');
    const heat = events.find((e) => e.type === 'heat');
    if (shot) {
      clearTimeout(fxTimer);
      setTimeout(() => {
        fxEl.innerHTML = `<div class="flash">
          <div class="bang ${shot.live ? 'live' : 'blank'}">${shot.live ? 'BANG!' : '...click'}</div>
          ${dmg ? `<div class="pts">${esc(nameOf(dmg.player))} 체력 <b>-${dmg.amount}</b></div>` : ''}
          ${elim ? `<div class="pts">☠ ${esc(nameOf(elim.player))} 탈락</div>` : ''}
          ${heat ? `<div class="heatup">🔥 배수 UP <b>×${heat.heat}</b><small>배수 ${VS.heatForDouble} 이상에서 맞히면 피해 2</small></div>` : ''}
        </div>`;
        fxTimer = setTimeout(() => { fxEl.innerHTML = ''; }, 2400);
      }, 650);
    }
    if (duration) setTimeout(refresh, duration + 30);
  }

  function refresh() {
    if (screen === 'versus') {
      const v = currentView();
      if (v) {
        scene.update(sceneState(v), { betSlots: 0, seats: seatsConf(v) });
        scene.setAim(locked() ? null : aimConf(v));
      }
    } else scene.setAim(null);
    render();
  }

  function onAim(id) { aimId = id; if (screen === 'versus') renderAimHint(); }
  function onFire(id) {
    const v = currentView();
    if (!v || screen !== 'versus') return;
    doAct({ type: 'shoot', target: id === perspective(v) ? 'self' : id });
  }

  // ── 같은 기기 ──
  function startLocal(n = localCount) {
    kind = 'local';
    const r = newVersus(undefined, n);
    local = r.state;
    screen = 'versus';
    disconnected = '';
    toast = '';
    refresh();
    showEvents(r.events, currentView(), local.turn);
  }

  // ── 온라인 ──
  async function openHost() {
    kind = 'online';
    me = 0;
    screen = 'lobby';
    lobby = { status: 'connecting', code: randomCode(), error: '', joinCode: '', players: 1 };
    render();
    try {
      net = await openPeerHub(lobby.code);
      lobby.status = 'waiting';
      host = createOnlineHost({
        hub: net,
        onLobby: (l) => { lobby.players = l.players; if (screen === 'lobby') { sfx.select(true); render(); } },
        onUpdate: (v, ev) => {
          view = v;
          if (screen !== 'versus') { screen = 'versus'; disconnected = ''; }
          refresh();
          showEvents(ev, v, me);
        },
      });
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
    screen = 'lobby';
    lobby = { status: 'connecting', code, error: '', joinCode: code, players: 1 };
    render();
    try {
      net = await openPeerLink(code);
      lobby.status = 'waiting';
      net.onClose(() => { disconnected = '방장과 연결이 끊겼다'; refresh(); });
      guest = createOnlineGuest({
        link: net,
        onLobby: (l) => { me = l.me; lobby.players = l.players; render(); },
        onRefused: (reason) => { lobby.status = 'error'; lobby.error = reason; render(); },
        onUpdate: (v, ev) => {
          me = guest.me;
          view = v;
          if (screen !== 'versus') { screen = 'versus'; disconnected = ''; }
          refresh();
          showEvents(ev, v, me);
        },
      });
      render();
    } catch (e) {
      lobby.status = 'error';
      lobby.error = e.message;
      render();
    }
  }

  function leave() {
    net?.close();
    net = host = guest = local = view = null;
    screen = 'home';
    kind = null;
    disconnected = '';
    fxEl.innerHTML = '';
    scene.setAim(null);
    scene.update(
      { phase: 'player', stage: 1, duel: { shells: [], spent: [], knownCurrent: null, score: 0, quota: 1, heat: 1, chamberNo: 0 }, player: { pouch: { hand: [], draw: [], discard: [] }, charms: [] }, dealer: { hp: 0, maxHp: 1 } },
      { betSlots: 0 },
    );
    render();
  }

  function doAct(action) {
    if (locked()) return;
    const v = currentView();
    const who = v ? perspective(v) : 0;
    let events;
    if (kind === 'local') events = actVersus(local, local.turn, action);
    else if (host) events = host.act(action);
    else events = guest.act(action);
    const bad = events.find((e) => e.type === 'invalid');
    toast = bad ? bad.reason : '';
    if (bad) sfx.deny();
    if (kind === 'local' && !bad) { refresh(); showEvents(events, v, who); } else render();
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
        <div class="mode local">
          <b>👥 같이 하기</b><small>한 기기에서 번갈아 쏘는 결투. 마지막까지 살아남은 사람이 판을 이긴다. 2판 먼저 이기면 승리.</small>
          <div class="online-row">${[2, 3, 4].map((n) => `<button data-vact="local" data-n="${n}">${n}명</button>`).join('')}</div>
        </div>
        <div class="mode online">
          <b>🌐 온라인 대전</b><small>최대 ${VS.maxPlayers}명. 방을 만들고 코드를 친구에게 보내거나, 받은 코드로 들어간다.</small>
          <div class="online-row">
            <button data-vact="host" ${busy ? 'disabled' : ''}>방 만들기</button>
            <input id="join-code" maxlength="8" placeholder="방 코드" value="${esc(lobby.joinCode)}" autocomplete="off" />
            <button data-vact="join" ${busy ? 'disabled' : ''}>참가</button>
          </div>
          ${lobby.error ? `<p class="err">${esc(lobby.error)}</p>` : ''}
        </div>
      </div>
      <p class="tag small">${aiming() ? '🎯 PC: 마우스로 상대를 바라보고 클릭해서 쏜다' : '📱 터치: 버튼으로 대상을 골라 쏜다'}</p>
      <div class="home-meta">
        <button class="link" data-vact="manual">📖 설명서</button>
        <button class="link" data-vact="mute">${isMuted() ? '🔇 소리 켜기' : '🔊 소리'}</button>
      </div>
    </div></div>`;
  }

  function renderLobby() {
    const link = `${location.origin}${location.pathname}?join=${lobby.code}`;
    const slots = Array.from({ length: VS.maxPlayers }, (_, i) => `<span class="slot ${i < lobby.players ? 'on' : ''}" style="--c:${COLORS[i]}">${i < lobby.players ? `P${i + 1}${!host && i === me ? ' (나)' : host && i === 0 ? ' (나)' : ''}` : '빈 자리'}</span>`).join('');
    let body;
    if (lobby.status === 'connecting') body = `<p class="sub">${lobby.joinCode ? `방 ${esc(lobby.code)}에 연결하는 중…` : '방을 여는 중…'}</p>`;
    else if (lobby.status === 'error') body = `<p class="err">${esc(lobby.error)}</p>`;
    else if (host) {
      body = `<p class="sub">친구에게 코드나 초대 링크를 보내자. 2~${VS.maxPlayers}명이 모이면 시작.</p>
        <div class="code">${esc(lobby.code)}</div>
        <div class="slots">${slots}</div>
        <div class="row center">
          <button data-vact="copy" data-text="${esc(link)}">초대 링크 복사</button>
          <button class="primary" data-vact="start" ${lobby.players < 2 ? 'disabled' : ''}>${lobby.players < 2 ? '상대를 기다리는 중…' : `${lobby.players}명으로 시작 →`}</button>
        </div>`;
    } else {
      body = `<div class="code small">${esc(lobby.code)}</div><div class="slots">${slots}</div>
        <p class="wait center">방장이 시작하길 기다리는 중…</p>`;
    }
    return `<div class="overlay home-wrap"><div class="panel lobby">
      <h2>🌐 온라인 대전</h2>${body}
      ${toast ? `<p class="toast">${esc(toast)}</p>` : ''}
      <div class="row"><button data-vact="home">← 홈으로</button></div>
    </div></div>`;
  }

  function aimHintHtml(v) {
    if (!aiming() || !isMyTurn(v)) return '';
    const who = perspective(v);
    if (aimId === null) return '<span class="aimhint">🎯 쏠 사람을 바라보자 · 아래를 내려다보면 나</span>';
    if (aimId === who) return `<span class="aimhint self">🎯 <b>나</b>를 조준 · 클릭하면 쏜다 (공포탄이면 배수 ×${v.heat[who] + 1})</span>`;
    const dmg = 1 + (v.heat[who] >= VS.heatForDouble ? 1 : 0) + (v.hollow[who] ? 1 : 0);
    return `<span class="aimhint on">🎯 <b style="color:${COLORS[aimId]}">P${aimId + 1}</b> 조준 · 클릭하면 쏜다 (실탄이면 피해 ${dmg})</span>`;
  }
  function renderAimHint() {
    const el = document.getElementById('aimhint');
    const v = currentView();
    if (el && v) el.innerHTML = aimHintHtml(v);
    document.body.classList.toggle('aiming', aiming() && screen === 'versus' && aimId !== null);
  }

  function renderVersus() {
    const v = currentView();
    if (!v) return '';
    const who = perspective(v);
    const myTurn = isMyTurn(v);
    const pending = kind === 'online' && guest?.pending;
    const busy = !myTurn || locked() || pending || !!disconnected;
    const total = v.left.live + v.left.blank;
    const pLive = v.myPeek !== null && v.myPeek !== undefined ? (v.myPeek ? 1 : 0) : v.left.live / Math.max(1, total);
    const heat = v.heat[who];
    const dmg = 1 + (heat >= VS.heatForDouble ? 1 : 0) + (v.hollow[who] ? 1 : 0);
    const items = v.items[who];
    const turnText = v.phase !== 'play' ? ''
      : kind === 'local' ? `<b style="color:${COLORS[v.turn]}">P${v.turn + 1}</b> 차례`
      : v.turn === me ? '<b>내 차례</b>' : `<span class="wait">P${v.turn + 1} 고민 중…</span>`;

    const plate = (p) => `<div class="plate vs-p ${v.phase === 'play' && v.turn === p ? 'on' : ''} ${v.hp[p] <= 0 ? 'out' : ''}">
      <small><b style="color:${COLORS[p]}">P${p + 1}</b>${p === who ? (kind === 'online' ? ' (나)' : ' · 지금 차례') : ` · ${SEAT_LABEL[seatOf(p, v)]}`}</small>
      <div>${v.hp[p] > 0 ? hearts(v.hp[p]) : '☠ 탈락'}</div>
      <small>배수 ×${v.heat[p]}${v.hollow[p] ? ' · 💥' : ''} · ${winDots(v.wins[p])}</small>
    </div>`;

    let overlay = '';
    if (disconnected) {
      overlay = `<div class="overlay"><div class="panel end"><h2>${esc(disconnected)}</h2><div class="row"><button class="primary" data-vact="home">홈으로</button></div></div></div>`;
    } else if (v.phase === 'roundOver') {
      const w = v.roundWinner;
      const canNext = kind === 'local' || me === 0;
      overlay = `<div class="overlay"><div class="panel end">
        <h2><span style="color:${COLORS[w]}">${esc(nameOf(w))}</span> 판 승리</h2>
        <p>${v.wins.map((x, p) => `P${p + 1} ${winDots(x)}`).join(' · ')}</p>
        <div class="row">${canNext ? '<button class="primary" data-vact="next">다음 판 →</button>' : '<p class="wait">방장이 다음 판을 시작하길 기다리는 중…</p>'}</div>
      </div></div>`;
    } else if (v.phase === 'over') {
      const iWon = kind === 'local' || v.winner === me;
      overlay = `<div class="overlay"><div class="panel end">
        <h2>${kind === 'local' ? `🏆 <span style="color:${COLORS[v.winner]}">P${v.winner + 1}</span> 최종 승리` : iWon ? '🏆 승리' : `☠ 패배 · P${v.winner + 1} 승리`}</h2>
        <p>${v.wins.map((x, p) => `P${p + 1} ${x}승`).join(' · ')}</p>
        <div class="row">${kind === 'local' ? `<button data-vact="local" data-n="${v.players}">다시 하기</button>` : ''}<button class="primary" data-vact="home">홈으로</button></div>
      </div></div>`;
    }

    // 터치 기기: 대상별 버튼
    const targets = Array.from({ length: v.players }, (_, p) => p).filter((p) => p !== who && v.hp[p] > 0);
    const buttons = aiming() ? '' : `<div class="actions vs-actions">
        ${targets.map((p) => `<button class="shoot dealer-btn" data-vact="shoot" data-target="${p}" ${busy ? 'disabled' : ''}><span style="color:${COLORS[p]}">P${p + 1}</span> 쏘기<small>${SEAT_LABEL[seatOf(p, v)]} · 실탄이면 <b>피해 ${dmg}</b></small></button>`).join('')}
        <button class="shoot self-btn" data-vact="shoot" data-target="self" ${busy ? 'disabled' : ''}>나를 쏜다<small>공포탄이면 <b>배수 ×${heat + 1}</b></small></button>
      </div>`;

    return `
    <header class="hud-top vs n${v.players}">${Array.from({ length: v.players }, (_, p) => plate(p)).join('')}</header>
    <div class="vs-round"><b>ROUND ${v.round}</b> · 2판 먼저 이기면 승리 · 약실 ${v.chamberNo}</div>
    ${aiming() && myTurn && !busy ? '<div class="crosshair"></div>' : ''}
    <section class="hud-bottom">
      <div class="odds">
        <span class="shells">${'<i class="sh live"></i>'.repeat(v.left.live)}${'<i class="sh blank"></i>'.repeat(v.left.blank)}</span>
        <span class="pct">실탄 <b>${Math.round(pLive * 100)}%</b>${v.myPeek !== null && v.myPeek !== undefined ? `<small>🔍 ${v.myPeek ? '실탄' : '공포탄'}</small>` : ''}</span>
        <span class="hint">${turnText}</span>
      </div>
      <p class="hint" id="aimhint">${aimHintHtml(v)}</p>
      <div class="controls">
        <div class="me"><small>P${who + 1} 아이템</small></div>
        <div class="items">${Array.from({ length: VS.maxItems }, (_, i) => {
          const id = items[i];
          if (!id) return '<button class="item empty" disabled></button>';
          const it = ITEMS[id];
          return `<button class="item" data-vact="item" data-index="${i}" title="${esc(it.name)}: ${esc(it.desc)}" ${busy ? 'disabled' : ''}>${it.icon}</button>`;
        }).join('')}</div>
      </div>
      ${buttons}
      ${toast ? `<p class="toast">${esc(toast)}</p>` : ''}
      <div class="meta">
        <button class="link" data-vact="home">← 홈</button>
        <button class="link" data-vact="mute">${isMuted() ? '🔇 소리 켜기' : '🔊 소리'}</button>
        ${kind === 'online' ? `<span>방 ${esc(lobby.code)} · 나는 P${me + 1}</span>` : `<span>같은 기기 ${v.players}명</span>`}
        ${aiming() ? '<span>마우스로 조준 · 클릭 사격 · S 나를 쏜다</span>' : ''}
      </div>
    </section>
    ${overlay}`;
  }

  function render() {
    if (screen === 'off') return;
    if (screen === 'home') app.innerHTML = renderHome();
    else if (screen === 'lobby') app.innerHTML = renderLobby();
    else app.innerHTML = renderVersus();
    document.body.classList.toggle('aiming', aiming() && screen === 'versus' && aimId !== null);
  }

  function handleClick(btn) {
    const { vact, target, index, text, n } = btn.dataset;
    if (vact === 'solo') return onSolo();
    if (vact === 'local') { sfx.click(); localCount = Number(n) || 2; return startLocal(localCount); }
    if (vact === 'host') { sfx.click(); return openHost(); }
    if (vact === 'join') { sfx.click(); return join(document.getElementById('join-code')?.value); }
    if (vact === 'start') { sfx.click(); host?.start(); return; }
    if (vact === 'home') { sfx.click(); return leave(); }
    if (vact === 'mute') { toggleMute(); return render(); }
    if (vact === 'manual') return onSolo({ manual: true });
    if (vact === 'copy') {
      navigator.clipboard?.writeText(text).then(() => { toast = '초대 링크를 복사했다'; render(); }, () => { toast = text; render(); });
      return;
    }
    if (vact === 'shoot') return doAct({ type: 'shoot', target: target === 'self' ? 'self' : Number(target) });
    if (vact === 'item') return doAct({ type: 'useItem', index: Number(index) });
    if (vact === 'next') return doAct({ type: 'nextRound' });
  }

  function handleKey(ev) {
    if (screen === 'home' && ev.key === 'Enter' && document.activeElement?.id === 'join-code') { join(document.activeElement.value); return; }
    if (screen !== 'versus') return;
    if (ev.key === 's' || ev.key === 'S') doAct({ type: 'shoot', target: 'self' });
  }

  return {
    get screen() { return screen; },
    showHome() { screen = 'home'; scene.setAim(null); render(); },
    hide() { screen = 'off'; scene.setAim(null); document.body.classList.remove('aiming'); },
    render,
    handleClick,
    handleKey,
    join,
    onAim,
    onFire,
  };
}
