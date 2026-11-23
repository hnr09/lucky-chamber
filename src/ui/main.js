import { newRun, act } from '../core/engine.js';
import { CONFIG, stageSpec } from '../core/config.js';
import { CHARMS, maxHp } from '../core/charms.js';
import { CHIPS, allChips } from '../core/chips.js';
import { ITEMS } from '../core/items.js';
import { GLYPH } from '../core/reels.js';
import { sellPrice, priceOf } from '../core/shop.js';
import { AUGMENTS } from '../core/augments.js';
import { TICKET_GOODS, boothPrice } from '../core/tickets.js';
import { describe } from './describe.js';

const app = document.getElementById('app');
const DEALER_DELAY = new URLSearchParams(location.search).has("fast") ? 30 : 850;
let state;
let log = [];
let flash = null; // 마지막 득점/사격 연출
let toast = '';
let dealerTimer = null;
let selectedChip = null; // 손패 인덱스

function start(seed) {
  clearTimeout(dealerTimer);
  selectedChip = null;
  const r = newRun(seed);
  state = r.state;
  log = [];
  flash = null;
  record(r.events);
  render();
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
  const shot = events.find((e) => e.type === 'shot');
  const sc = [...events].reverse().find((e) => e.type === 'score');
  if (shot || sc) flash = { shot, score: sc, key: Math.random() };
  render();
  if (state.phase === 'dealer') {
    dealerTimer = setTimeout(() => dispatch({ type: 'dealerTurn' }), DEALER_DELAY);
  }
}

function record(events) {
  for (const e of events) {
    const line = describe(e);
    if (line) log.push({ text: line, type: e.type });
  }
  log = log.slice(-60);
}

// ── 렌더링 ─────────────────────────────────────────────

const pips = (n, max, cls) =>
  Array.from({ length: max }, (_, i) => `<span class="pip ${cls} ${i < n ? 'on' : ''}"></span>`).join('');

function render() {
  const { player: p, dealer, duel: d } = state;
  const busy = state.phase !== 'player';
  const pct = Math.min(100, (d.score / d.quota) * 100);

  app.innerHTML = `
  <header class="hud">
    <div><small>스테이지</small><b>${state.stage}/${CONFIG.finalStage}</b></div>
    <div class="quota">
      <small>점수 / 할당량</small>
      <b><span class="score">${d.score}</span> / ${d.quota}</b>
      <div class="bar"><i style="width:${pct}%" class="${pct >= 100 ? 'met' : ''}"></i></div>
    </div>
    <div><small>코인 · 티켓</small><b><span class="coin">${p.coins}</span> · <span class="ticket">${p.tickets}🎟️</span></b></div>
  </header>

  <section class="side dealer ${state.phase === 'dealer' ? 'active' : ''}">
    <span class="name">딜러</span>
    <span class="pips">${pips(dealer.hp, dealer.maxHp, 'hp')}</span>
  </section>

  <section class="table">
    <div class="chamber" aria-label="약실">
      ${d.spent.map((s) => `<span class="shell spent ${s ? 'live' : 'blank'}"></span>`).join('')}
      ${d.shells.map((_, i) => `<span class="shell ${i === 0 ? 'current' : ''} ${i === 0 && d.knownCurrent !== null ? (d.knownCurrent ? 'live known' : 'blank known') : ''}"></span>`).join('')}
    </div>
    <div class="loadinfo">장전 #${d.chamberNo} · 실탄 ${d.loaded.live} · 공포탄 ${d.loaded.blank} · 남은 탄 ${d.shells.length}${d.empowered ? ' · <b class="emp">💥강화</b>' : ''}</div>
    <div class="formula">
      <span class="stake">${CONFIG.baseHitStake}${selectedChip !== null ? '+' : ''}</span><span class="x">×</span><span class="mult">${d.heat}</span>
      <small>판돈 × 열기(배수)</small>
    </div>
    ${renderFlash()}
  </section>

  <section class="side player ${state.phase === 'player' ? 'active' : ''}">
    <span class="name">당신</span>
    <span class="pips">${pips(p.hp, maxHp(state), 'hp')}</span>
  </section>

  <section class="charms">
    ${Array.from({ length: CONFIG.maxCharms }, (_, i) => {
      const id = p.charms[i];
      if (!id) return '<div class="charm empty"></div>';
      const c = CHARMS[id];
      return `<div class="charm" title="${c.desc}"><span>${c.icon}</span><small>${c.name}</small></div>`;
    }).join('')}
  </section>

  <section class="items">
    ${Array.from({ length: CONFIG.maxItems }, (_, i) => {
      const id = p.items[i];
      if (!id) return '<button class="item empty" disabled></button>';
      const it = ITEMS[id];
      return `<button class="item" data-act="useItem" data-index="${i}" title="${it.desc}" ${busy ? 'disabled' : ''}><span>${it.icon}</span><small>${it.name}</small></button>`;
    }).join('')}
  </section>

  <section class="hand">
    <div class="hand-head"><b>베팅 칩</b><small>주머니 ${p.pouch.draw.length} · 버림 ${p.pouch.discard.length} · 탭해서 선택 후 사격</small></div>
    <div class="hand-chips">
      ${p.pouch.hand.map((c, i) => {
        const def = CHIPS[c.type];
        return `<button class="chip ${selectedChip === i ? 'selected' : ''}" style="--c:${def.color}" data-act="selectChip" data-index="${i}" ${busy ? 'disabled' : ''} title="${def.desc}">
          <span class="token">${def.icon}</span><small>${def.name}</small></button>`;
      }).join('') || '<small>손패 없음</small>'}
    </div>
    <p class="chip-desc">${selectedChip !== null && p.pouch.hand[selectedChip]
      ? `<b>${CHIPS[p.pouch.hand[selectedChip].type].name}</b> 베팅: ${CHIPS[p.pouch.hand[selectedChip].type].desc}`
      : '칩을 걸지 않고 쏠 수도 있습니다.'}</p>
  </section>

  <section class="actions">
    <button class="shoot dealer-btn" data-act="shoot" data-target="dealer" ${busy ? 'disabled' : ''}>딜러를 쏜다</button>
    <button class="shoot self-btn" data-act="shoot" data-target="self" ${busy ? 'disabled' : ''}>나를 쏜다</button>
  </section>
  <p class="hint">${state.phase === 'dealer' ? '딜러가 고민 중…' : '자신에게 공포탄 → 열기(배수) +1, 턴 유지. 판돈 × 열기 = 득점.'}</p>
  ${toast ? `<p class="toast">${toast}</p>` : ''}

  <section class="log">${log.slice().reverse().map((l) => `<div class="l-${l.type}">${l.text}</div>`).join('')}</section>
  <footer>시드 ${state.seed} · <button class="link" data-act="restart">새 게임</button></footer>

  ${p.augments.length ? `<section class="augs">${p.augments.map((id) => `<span title="${AUGMENTS[id].desc}">${AUGMENTS[id].icon} ${AUGMENTS[id].name}</span>`).join('')}</section>` : ''}
  ${state.phase === 'call' ? renderCall() : ''}
  ${state.phase === 'shop' ? renderShop() : ''}
  ${state.phase === 'gameOver' || state.phase === 'victory' ? renderEnd() : ''}
  `;
}

function renderFlash() {
  if (!flash) return '<div class="flash"></div>';
  const { shot, score } = flash;
  return `<div class="flash show" data-k="${flash.key}">
    ${shot ? `<div class="bang ${shot.live ? 'live' : 'blank'}">${shot.live ? 'BANG!' : 'click'}</div>` : ''}
    ${score ? `<div class="pts"><span class="stake">${score.stake}</span> × <span class="mult">${score.mult}</span> = <b>+${score.points}</b></div>
      <div class="trig">${score.triggers.map((t) => `<span>${t.icon} ${t.label}</span>`).join('')}</div>` : ''}
  </div>`;
}

function renderShop() {
  const { shop: s, player: p } = state;
  const next = stageSpec(state.stage + 1);
  const spin = s.lastSpin;
  return `<div class="overlay"><div class="panel shop">
    <h2>상점 <small>코인 <b class="coin">${p.coins}</b> · 티켓 <b class="ticket">${p.tickets}</b></small></h2>
    <p class="sub">다음: 스테이지 ${state.stage + 1} · 할당량 ${next.quota} · 딜러 체력 ${next.dealerHp}</p>

    <h3>부적 <small>${p.charms.length}/${CONFIG.maxCharms} · 왼쪽부터 발동</small></h3>
    <div class="cards">${s.charms.map((id, i) => {
      if (!id) return '<div class="card sold">판매됨</div>';
      const c = CHARMS[id];
      const price = priceOf(state, c.price);
      return `<button class="card" data-act="buyCharm" data-index="${i}" ${p.coins < price ? 'disabled' : ''}>
        <span class="ic">${c.icon}</span><b>${c.name}</b><small>${c.desc}</small><em>${price} 코인</em></button>`;
    }).join('')}</div>

    <h3>아이템</h3>
    <div class="cards">${s.items.map((id, i) => {
      if (!id) return '<div class="card sold">판매됨</div>';
      const it = ITEMS[id];
      const price = priceOf(state, it.price);
      return `<button class="card small" data-act="buyItem" data-index="${i}" ${p.coins < price ? 'disabled' : ''}>
        <span class="ic">${it.icon}</span><b>${it.name}</b><small>${it.desc}</small><em>${price} 코인</em></button>`;
    }).join('')}</div>

    <h3>베팅 칩 <small>주머니에 추가</small></h3>
    <div class="cards">${s.chips.map((id, i) => {
      if (!id) return '<div class="card sold">판매됨</div>';
      const c = CHIPS[id];
      const price = priceOf(state, c.price);
      return `<button class="card small" data-act="buyChip" data-index="${i}" ${p.coins < price ? 'disabled' : ''}>
        <span class="ic token-lg" style="--c:${c.color}">${c.icon}</span><b>${c.name}</b><small>${c.desc}</small><em>${price} 코인</em></button>`;
    }).join('')}</div>

    <h3>내 칩 주머니 <small>${allChips(p.pouch).length}개 · 제거 ${CONFIG.shop.removeChipCost} 코인 (최소 ${CONFIG.minPouch}개)</small></h3>
    <div class="pouch">${Object.entries(countChips(p.pouch)).map(([type, n]) => `
      <div class="pouch-row" title="${CHIPS[type].desc}"><span>${CHIPS[type].icon} ${CHIPS[type].name} ×${n}</span>
        <button data-act="removeChip" data-chip="${type}">제거</button></div>`).join('')}</div>

    <h3>🎟️ 티켓 부스 <small>희귀 부적 · 영구 강화</small></h3>
    <div class="cards">${s.booth.map((o, i) => {
      if (!o) return '<div class="card sold">교환됨</div>';
      const def = o.kind === 'charm' ? CHARMS[o.id] : TICKET_GOODS[o.id];
      const price = boothPrice(o);
      return `<button class="card small booth" data-act="buyBooth" data-index="${i}" ${p.tickets < price ? 'disabled' : ''}>
        <span class="ic">${def.icon}</span><b>${def.name}</b><small>${def.desc}</small><em class="ticket">${price} 티켓</em></button>`;
    }).join('')}</div>

    <h3>슬롯머신 <small>${s.spinCost} 코인</small></h3>
    <div class="reels">
      <div class="reel-row">${(spin?.reels ?? ['?', '?', '?']).map((r) => `<span>${GLYPH[r] ?? r}</span>`).join('')}</div>
      <button data-act="spin" ${p.coins < s.spinCost ? 'disabled' : ''}>돌리기</button>
      <span class="spin-label">${spin ? spin.label : '페어 2 · 🍒5 · 🔔8 · 🍀아이템 · 7️⃣20 · 💀체력-1'}</span>
    </div>

    <h3>내 부적 <small>순서 변경 / 판매</small></h3>
    <div class="owned">${p.charms.length ? p.charms.map((id, i) => `
      <div class="own"><span>${CHARMS[id].icon} ${CHARMS[id].name}</span>
        <button data-act="moveCharm" data-index="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>◀</button>
        <button data-act="moveCharm" data-index="${i}" data-dir="1" ${i === p.charms.length - 1 ? 'disabled' : ''}>▶</button>
        <button data-act="sellCharm" data-index="${i}">판매 +${sellPrice(id)}</button></div>`).join('') : '<small>없음</small>'}</div>

    ${toast ? `<p class="toast">${toast}</p>` : ''}
    <div class="row">
      <button data-act="reroll" ${p.coins < s.rerollCost ? 'disabled' : ''}>새로고침 (${s.rerollCost})</button>
      <button class="primary" data-act="leaveShop">다음 스테이지 →</button>
    </div>
  </div></div>`;
}

function renderCall() {
  return `<div class="overlay"><div class="panel call">
    <h2>📞 따르릉…</h2>
    <p class="sub">수화기 너머 목소리가 거래를 제안한다. 하나를 고르면 이번 판 내내 유지된다.</p>
    <div class="cards">${state.call.offers.map((id, i) => {
      const a = AUGMENTS[id];
      return `<button class="card" data-act="answerCall" data-index="${i}"><span class="ic">${a.icon}</span><b>${a.name}</b><small>${a.desc}</small></button>`;
    }).join('')}</div>
  </div></div>`;
}

function countChips(pouch) {
  const counts = {};
  for (const c of allChips(pouch)) counts[c.type] = (counts[c.type] ?? 0) + 1;
  return counts;
}

function renderEnd() {
  const r = state.result;
  const title = r.victory ? '🏆 승리' : r.reason === 'dead' ? '☠ 사망' : '☠ 할당량 미달';
  return `<div class="overlay"><div class="panel end">
    <h2>${title}</h2>
    <p>스테이지 ${r.stage} 도달 · 시드 ${state.seed}</p>
    <div class="row">
      <button data-act="retry">같은 시드로 다시</button>
      <button class="primary" data-act="restart">새 게임</button>
    </div>
  </div></div>`;
}

// ── 입력 ───────────────────────────────────────────────

app.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const { act: type, target, index, dir, chip } = btn.dataset;
  if (type === 'selectChip') {
    const i = Number(index);
    selectedChip = selectedChip === i ? null : i;
    return render();
  }
  if (type === 'removeChip') return dispatch({ type, chipType: chip });
  if (type === 'restart') return start();
  if (type === 'retry') return start(state.seed);
  dispatch({ type, target, index: index !== undefined ? Number(index) : undefined, dir: dir !== undefined ? Number(dir) : undefined });
});

const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
start(Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : undefined);
