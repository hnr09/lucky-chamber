// UI 컨트롤러: 엔진에 행동을 보내고, 3D 씬과 HTML HUD를 갱신한다.
import { newRun, act } from '../core/engine.js';
import { CONFIG } from '../core/config.js';
import { CHARMS, maxHp } from '../core/charms.js';
import { CHIPS } from '../core/chips.js';
import { ITEMS } from '../core/items.js';
import { AUGMENTS } from '../core/augments.js';
import { describe } from './describe.js';
import { renderShop, renderCall, renderEnd } from './panels.js';
import { createScene } from './scene3d.js';

const params = new URLSearchParams(location.search);
const FAST = params.has('fast');
const app = document.getElementById('app');
const hurtEl = document.getElementById('hurt');

let state;
let log = [];
let flash = null;
let toast = '';
let selectedChip = null;
let showLog = false;
let lockedUntil = 0;   // 연출 중에는 입력을 막는다
let timer = null;

const scene = createScene(document.getElementById('scene'), {
  onChipClick: (i) => selectChip(i),
  onHurt: () => {
    hurtEl.classList.remove('on');
    void hurtEl.offsetWidth;
    hurtEl.classList.add('on');
  },
});

function start(seed) {
  clearTimeout(timer);
  const r = newRun(seed);
  state = r.state;
  log = [];
  flash = null;
  toast = '';
  selectedChip = null;
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
  selectedChip = selectedChip === i ? null : i;
  refresh();
}

function dispatch(action) {
  if (action.type === 'shoot') {
    action.chip = selectedChip ?? undefined;
    selectedChip = null;
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
  const showFlash = () => {
    if (shot || sc) flash = { shot, score: sc, key: Math.random() };
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

function record(events) {
  for (const e of events) {
    const line = describe(e);
    if (line) log.push({ text: line, type: e.type });
  }
  log = log.slice(-80);
}

function refresh() {
  scene.update(state, { selectedChip });
  render();
}

// ── HUD ────────────────────────────────────────────────

const pips = (n, max, cls) =>
  Array.from({ length: max }, (_, i) => `<i class="${cls} ${i < n ? 'on' : ''}"></i>`).join('');

function render() {
  const { player: p, dealer, duel: d } = state;
  const busy = state.phase !== 'player' || locked();
  const pct = Math.min(100, (d.score / d.quota) * 100);
  const sel = selectedChip !== null ? p.pouch.hand[selectedChip] : null;

  app.innerHTML = `
  <header class="hud-top">
    <div class="plate"><small>STAGE</small><b>${state.stage}<span>/${CONFIG.finalStage}</span></b></div>
    <div class="plate quota">
      <small>점수 / 할당량</small>
      <b><span class="${pct >= 100 ? 'met' : ''}">${d.score}</span><span> / ${d.quota}</span></b>
      <div class="bar"><i style="width:${pct}%" class="${pct >= 100 ? 'met' : ''}"></i></div>
      <div class="dealer-hp"><small>딜러</small>${pips(dealer.hp, dealer.maxHp, 'hp dealer')}</div>
    </div>
  <div class="plate formula">
    <span class="stake">${CONFIG.baseHitStake + p.mods.baseStake}${sel ? '+' : ''}</span><span class="x">×</span><span class="mult">${d.heat}</span>
    <small>장전 #${d.chamberNo} · 실탄 ${d.loaded.live} · 공포탄 ${d.loaded.blank} · 남은 ${d.shells.length}${d.empowered ? ' · 💥강화' : ''}</small>
  </div>
    <div class="plate money"><b class="coin">${p.coins}<small>¢</small></b><b class="ticket">${p.tickets}<small>🎟️</small></b></div>
  </header>

  ${renderFlash()}

  <section class="hud-bottom">

    <div class="charm-row">
      ${p.charms.map((id) => `<span class="charm" title="${CHARMS[id].name}: ${CHARMS[id].desc}">${CHARMS[id].icon}</span>`).join('')}
      ${p.augments.map((id) => `<span class="aug" title="${AUGMENTS[id].name}: ${AUGMENTS[id].desc}">${AUGMENTS[id].icon}</span>`).join('')}
    </div>
    <p class="chip-desc">${sel
      ? `<b style="color:${CHIPS[sel.type].color}">${CHIPS[sel.type].icon} ${CHIPS[sel.type].name}</b> ${CHIPS[sel.type].desc}`
      : state.phase === 'dealer' ? '<span class="wait">딜러가 총을 집어 든다…</span>'
      : `테이블의 칩을 눌러 베팅 · 주머니 ${p.pouch.draw.length} · 버림 ${p.pouch.discard.length}`}</p>
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
      <button class="shoot dealer-btn" data-act="shoot" data-target="dealer" ${busy ? 'disabled' : ''}>딜러를 쏜다</button>
      <button class="shoot self-btn" data-act="shoot" data-target="self" ${busy ? 'disabled' : ''}>나를 쏜다</button>
    </div>
    ${toast ? `<p class="toast">${toast}</p>` : ''}
    <div class="meta">
      <button class="link" data-act="toggleLog">${showLog ? '기록 닫기' : '기록'}</button>
      <span>시드 ${state.seed}</span>
      <button class="link" data-act="restart">새 게임</button>
    </div>
  </section>

  ${showLog ? `<section class="log">${log.slice().reverse().map((l) => `<div class="l-${l.type}">${l.text}</div>`).join('')}</section>` : ''}

  ${state.phase === 'call' ? renderCall(state) : ''}
  ${state.phase === 'shop' ? renderShop(state, toast) : ''}
  ${state.phase === 'gameOver' || state.phase === 'victory' ? renderEnd(state) : ''}
  `;
}

function renderFlash() {
  if (!flash) return '';
  const { shot, score } = flash;
  return `<div class="flash" data-k="${flash.key}">
    ${shot ? `<div class="bang ${shot.live ? 'live' : 'blank'}">${shot.live ? 'BANG!' : '...click'}</div>` : ''}
    ${score ? `<div class="pts"><span class="stake">${score.stake}</span> × <span class="mult">${score.mult}</span> = <b>+${score.points}</b></div>
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
  if (type === 'removeChip') return dispatch({ type, chipType: chip });
  if ((type === 'shoot' || type === 'useItem') && locked()) return;
  dispatch({ type, target, index: index !== undefined ? Number(index) : undefined, dir: dir !== undefined ? Number(dir) : undefined });
});

// 키보드: 1~5 칩 선택, D 딜러, S 자신
window.addEventListener('keydown', (ev) => {
  if (state.phase !== 'player' || locked()) return;
  const n = Number(ev.key);
  if (n >= 1 && n <= 5) selectChip(n - 1);
  else if (ev.key === 'd' || ev.key === 'D') dispatch({ type: 'shoot', target: 'dealer' });
  else if (ev.key === 's' || ev.key === 'S') dispatch({ type: 'shoot', target: 'self' });
});

const urlSeed = Number(params.get('seed'));
start(Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : undefined);
