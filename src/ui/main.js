// UI 컨트롤러: 엔진에 행동을 보내고, 3D 씬과 HTML HUD를 갱신한다.
import { newRun, act, betSlots, chamberLimit } from '../core/engine.js';
import { CONFIG } from '../core/config.js';
import { CHARMS, maxHp } from '../core/charms.js';
import { CHIPS, betText, previewBets } from '../core/chips.js';
import { ITEMS } from '../core/items.js';
import { AUGMENTS } from '../core/augments.js';
import { describe } from './describe.js';
import { renderShop, renderCall, renderEnd, renderPaytable } from './panels.js';
import { createScene } from './scene3d.js';

const params = new URLSearchParams(location.search);
const FAST = params.has('fast');
const app = document.getElementById('app');
const hurtEl = document.getElementById('hurt');
const tipEl = document.getElementById('tip');
const fxEl = document.getElementById('fx'); // 연출 전용 레이어: HUD가 다시 그려져도 연출이 반복되지 않는다

let state;
let log = [];
let flash = null;
let toast = '';
let selectedChips = []; // 고른 손패 인덱스 (고른 순서 = 발동 순서)
let showLog = false;
let showPay = window.innerWidth > 1000;
let lockedUntil = 0;   // 연출 중에는 입력을 막는다
let timer = null;

const scene = createScene(document.getElementById('scene'), {
  onChipClick: (i) => selectChip(i),
  onHover: (info, x, y) => showTip(info, x, y),
  onHurt: () => {
    hurtEl.classList.remove('on');
    void hurtEl.offsetWidth;
    hurtEl.classList.add('on');
  },
});

// 테이블 위 칩/부적에 마우스를 올리면 설명 표시
function showTip(info, x, y) {
  if (!info) { tipEl.hidden = true; return; }
  if (info.kind === 'chip') {
    const c = CHIPS[info.id];
    tipEl.innerHTML = `<b style="color:${c.color}">${c.icon} ${c.name}</b><div class="bet">${betText(c.bet)}</div>${c.ability ? `<div>${c.ability}</div>` : ''}<small>클릭해서 베팅</small>`;
  } else {
    const c = CHARMS[info.id];
    tipEl.innerHTML = `<b>${c.icon} ${c.name}</b><div>${c.desc}</div><small>${info.index + 1}번째로 발동</small>`;
  }
  tipEl.style.left = `${Math.min(x + 14, window.innerWidth - 230)}px`;
  tipEl.style.top = `${Math.max(8, y - 70)}px`;
  tipEl.hidden = false;
}

function start(seed) {
  clearTimeout(timer);
  const r = newRun(seed);
  state = r.state;
  log = [];
  flash = null;
  fxEl.innerHTML = '';
  toast = '';
  selectedChips = [];
  lockedUntil = 0;
  record(r.events);
  refresh();
  scene.play(r.events);
}

function locked() {
  return performance.now() < lockedUntil;
}

function selectChip(i) {
  if (state.phase !== 'player' || locked() || !state.player.pouch.hand[i]) return;
  if (selectedChips.includes(i)) selectedChips = selectedChips.filter((x) => x !== i);
  else if (selectedChips.length < betSlots(state)) selectedChips = [...selectedChips, i];
  else { toast = `한 번에 최대 ${betSlots(state)}개까지 걸 수 있다`; return render(); }
  toast = '';
  refresh();
}

function dispatch(action) {
  if (action.type === 'shoot') {
    action.chips = selectedChips;
    selectedChips = [];
  }
  const events = act(state, action);
  const bad = events.find((e) => e.type === 'invalid');
  toast = bad ? bad.reason : '';
  record(events);

  const duration = FAST ? 0 : scene.play(events);
  lockedUntil = performance.now() + duration;
  // 점수 팝업은 총이 발사되는 타이밍에 맞춰 보여준다
  const shot = events.find((e) => e.type === 'shot');
  const sc = [...events].reverse().find((e) => e.type === 'score');
  // 잭팟 레벨: 한 방이 할당량의 50% 이상이면 1, 100% 이상 2, 300% 이상 3
  const quota = state.duel?.quota ?? 1;
  const jackpot = sc ? (sc.points >= quota * 3 ? 3 : sc.points >= quota ? 2 : sc.points >= quota * 0.5 ? 1 : 0) : 0;
  if (jackpot && !FAST) scene.celebrate(jackpot, shot ? 650 : 0);
  const clear = events.find((e) => e.type === 'stageClear');
  const showFlash = () => {
    if (shot || sc || clear) {
      const key = Math.random();
      flash = { shot, score: sc, jackpot, clear, key };
      fxEl.innerHTML = renderFlash();
      setTimeout(() => { if (flash?.key === key) { fxEl.innerHTML = ''; flash = null; } }, 2800);
    }
    refresh();
  };
  refresh();
  if (shot && !FAST) setTimeout(showFlash, 650); else showFlash();

  if (state.phase === 'dealer') {
    timer = setTimeout(() => dispatch({ type: 'dealerTurn' }), duration + (FAST ? 30 : 500));
  } else if (duration) {
    timer = setTimeout(refresh, duration);
  }
}

// ?debug: 콘솔에서 상태와 최근 이벤트를 볼 수 있다
if (params.has('debug')) window.__debug = () => ({ state, log: log.slice(-12).map((l) => l.text) });

function record(events) {
  for (const e of events) {
    const line = describe(e);
    if (line) log.push({ text: line, type: e.type });
  }
  log = log.slice(-80);
}

function refresh() {
  scene.update(state, { selectedChips, betSlots: betSlots(state) });
  render();
}

// ── HUD ────────────────────────────────────────────────

const pips = (n, max, cls) =>
  Array.from({ length: max }, (_, i) => `<i class="${cls} ${i < n ? 'on' : ''}"></i>`).join('');

function render() {
  const { player: p, dealer, duel: d } = state;
  const busy = state.phase !== 'player' || locked();
  const pct = Math.min(100, (d.score / d.quota) * 100);
  const picked = selectedChips.map((i) => p.pouch.hand[i]).filter(Boolean);
  const baseStake = CONFIG.baseHitStake + p.mods.baseStake;
  const pv = previewBets(picked.map((c) => c.type), { stake: baseStake, mult: d.heat });
  const slots = betSlots(state);

  app.innerHTML = `
  <header class="hud-top">
    <div class="plate"><small>STAGE</small><b>${state.stage}<span>/${CONFIG.finalStage}</span></b></div>
    <div class="plate quota">
      <small>점수 / 할당량</small>
      <b><span class="${pct >= 100 ? 'met' : ''}">${d.score}</span><span> / ${d.quota}</span></b>
      <div class="bar"><i style="width:${pct}%" class="${pct >= 100 ? 'met' : ''}"></i></div>
      <div class="dealer-hp"><small>딜러</small>${pips(dealer.hp, dealer.maxHp, 'hp dealer')}</div>
    </div>
  <div class="plate formula ${state.phase === 'call' || state.phase === 'shop' ? 'away' : ''}">
    <span class="stake">${pv.stake}</span><span class="x">×</span><span class="mult">${pv.mult}</span>${picked.length ? `<span class="eq">= ${pv.points}</span>` : ''}
    <small><b class="${d.chamberNo >= chamberLimit(state) ? 'last' : ''}">약실 ${d.chamberNo}/${chamberLimit(state)}</b> · 실탄 ${d.loaded.live} · 공포탄 ${d.loaded.blank} · 남은 ${d.shells.length}${d.empowered ? ' · 💥강화' : ''}</small>
  </div>
    <div class="plate money"><b class="coin">${p.coins}<small>¢</small></b><b class="ticket">${p.tickets}<small>🎟️</small></b></div>
  </header>


  <section class="hud-bottom ${state.phase === 'call' || state.phase === 'shop' ? 'away' : ''}">

    <div class="charm-row">
      ${p.augments.map((id) => `<span class="aug" title="${AUGMENTS[id].name}: ${AUGMENTS[id].desc}">${AUGMENTS[id].icon}</span>`).join('')}
    </div>
    <div class="chip-desc">${picked.length
      ? `<div class="bet-head">베팅 ${picked.length}/${slots} <span class="seq">${picked.map((c) => CHIPS[c.type].icon).join('→')}</span> <small>고른 순서대로 발동 · 딜러 적중 시</small> <b class="pv">${pv.stake} × ${pv.mult} = ${pv.points}</b></div>
         <ol class="bet-list">${picked.map((c) => {
           const def = CHIPS[c.type];
           return `<li><b style="color:${def.color}">${def.icon} ${def.name}</b> <span class="bet">${betText(def.bet)}</span>${def.ability ? ` <small>${def.ability}</small>` : ''}</li>`;
         }).join('')}</ol>`
      : state.phase === 'dealer' ? '<span class="wait">딜러가 총을 집어 든다…</span>'
      : `테이블의 칩을 눌러 최대 <b>${slots}개</b>까지 베팅 · 주머니 ${p.pouch.draw.length} · 버림 ${p.pouch.discard.length}`}</div>
    <div class="controls">
      <div class="me">
        <small>당신</small>
        <div>${pips(p.hp, maxHp(state), 'hp me')}</div>
      </div>
      <div class="items">
        ${Array.from({ length: CONFIG.maxItems }, (_, i) => {
          const id = p.items[i];
          if (!id) return '<button class="item empty" disabled></button>';
          const it = ITEMS[id];
          return `<button class="item" data-act="useItem" data-index="${i}" title="${it.name}: ${it.desc}" ${busy ? 'disabled' : ''}>${it.icon}</button>`;
        }).join('')}
      </div>
    </div>
    <div class="actions">
      <button class="shoot dealer-btn" data-act="shoot" data-target="dealer" ${busy ? 'disabled' : ''}>딜러를 쏜다<small>실탄이면 득점 · 턴 넘김</small></button>
      <button class="shoot self-btn" data-act="shoot" data-target="self" ${busy ? 'disabled' : ''}>나를 쏜다<small>공포탄이면 열기 +1 · 턴 유지</small></button>
    </div>
    ${toast ? `<p class="toast">${toast}</p>` : ''}
    <div class="meta">
      <button class="link" data-act="togglePay">${showPay ? '배당표 닫기' : '📋 배당표'}</button>
      <button class="link" data-act="toggleLog">${showLog ? '기록 닫기' : '기록'}</button>
      <span>시드 ${state.seed}</span>
      <button class="link" data-act="restart">새 게임</button>
    </div>
  </section>

  ${showPay && (state.phase === 'player' || state.phase === 'dealer') ? renderPaytable(state) : ''}
  ${showLog ? `<section class="log">${log.slice().reverse().map((l) => `<div class="l-${l.type}">${l.text}</div>`).join('')}</section>` : ''}

  ${state.phase === 'call' ? renderCall(state) : ''}
  ${state.phase === 'shop' ? renderShop(state, toast) : ''}
  ${state.phase === 'gameOver' || state.phase === 'victory' ? renderEnd(state) : ''}
  `;
}

function renderFlash() {
  if (!flash) return '';
  const { shot, score, jackpot, clear } = flash;
  if (clear) {
    return `<div class="flash clear" data-k="${flash.key}">
      <div class="clear-title">할당량 달성</div>
      <div class="pts">${clear.score.toLocaleString()} / ${clear.quota.toLocaleString()} <b>×${(clear.score / clear.quota).toFixed(1)}</b></div>
      <div class="payout">+${clear.coins}¢${clear.bonus ? ` <small>(초과 보너스 +${clear.bonus})</small>` : ''} · +${clear.tickets}🎟️</div>
    </div>`;
  }
  return `<div class="flash ${jackpot ? `jackpot j${jackpot}` : ''}" data-k="${flash.key}">
    ${jackpot ? `<div class="jp">${['', 'BIG WIN', 'JACKPOT', 'MEGA JACKPOT'][jackpot]}</div>` : ''}
    ${shot ? `<div class="bang ${shot.live ? 'live' : 'blank'}">${shot.live ? 'BANG!' : '...click'}</div>` : ''}
    ${score ? `<div class="pts"><span class="stake">${score.stake}</span> × <span class="mult">${score.mult}</span> = <b>+${score.points.toLocaleString()}</b></div>
      <div class="trig">${score.triggers.map((t) => `<span>${t.icon} ${t.label}</span>`).join('')}</div>` : ''}
  </div>`;
}

// ── 입력 ───────────────────────────────────────────────

app.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const { act: type, target, index, dir, chip } = btn.dataset;
  if (type === 'restart') return start();
  if (type === 'retry') return start(state.seed);
  if (type === 'toggleLog') { showLog = !showLog; return render(); }
  if (type === 'togglePay') { showPay = !showPay; return render(); }
  if (type === 'removeChip') return dispatch({ type, chipType: chip });
  if ((type === 'shoot' || type === 'useItem') && locked()) return;
  dispatch({ type, target, index: index !== undefined ? Number(index) : undefined, dir: dir !== undefined ? Number(dir) : undefined });
});

// 키보드: 1~9 칩 선택(다시 누르면 취소), D 딜러, S 자신
window.addEventListener('keydown', (ev) => {
  if (state.phase !== 'player' || locked()) return;
  const n = Number(ev.key);
  if (n >= 1 && n <= 9) selectChip(n - 1);
  else if (ev.key === 'd' || ev.key === 'D') dispatch({ type: 'shoot', target: 'dealer' });
  else if (ev.key === 's' || ev.key === 'S') dispatch({ type: 'shoot', target: 'self' });
});

const urlSeed = Number(params.get('seed'));
start(Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : undefined);
