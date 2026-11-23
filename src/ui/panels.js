// 오버레이 패널: 상점 / 전화 / 게임 종료
import { CONFIG, stageSpec } from '../core/config.js?v=mwsw8wdn';
import { CHARMS } from '../core/charms.js?v=mwsw8wdn';
import { CHIPS, allChips, betText } from '../core/chips.js?v=mwsw8wdn';
import { ITEMS } from '../core/items.js?v=mwsw8wdn';
import { GLYPH } from '../core/reels.js?v=mwsw8wdn';
import { sellPrice, priceOf } from '../core/shop.js?v=mwsw8wdn';
import { AUGMENTS } from '../core/augments.js?v=mwsw8wdn';
import { TICKET_GOODS, boothPrice } from '../core/tickets.js?v=mwsw8wdn';

export function renderShop(state, toast) {
  const { shop: s, player: p } = state;
  const next = stageSpec(state.stage + 1);
  const spin = s.lastSpin;
  return `<div class="overlay stand shop-wrap"><div class="panel shop">
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
        <span class="ic token-lg" style="--c:${c.color}">${c.icon}</span><b>${c.name}</b><small class="bet">${betText(c.bet)}</small>${c.ability ? `<small>${c.ability}</small>` : ''}<em>${price} 코인</em></button>`;
    }).join('')}</div>

    <h3>내 칩 주머니 <small>${allChips(p.pouch).length}개 · 제거 ${CONFIG.shop.removeChipCost} 코인 (최소 ${CONFIG.minPouch}개)</small></h3>
    <div class="pouch">${Object.entries(countChips(p.pouch)).map(([type, n]) => `
      <div class="pouch-row"><span>${CHIPS[type].icon} ${CHIPS[type].name} ×${n} <small class="bet">${betText(CHIPS[type].bet)}</small>${CHIPS[type].ability ? ` <small>${CHIPS[type].ability}</small>` : ''}</span>
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

export function renderCall(state) {
  return `<div class="overlay stand call-wrap"><div class="panel call">
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

export function renderEnd(state) {
  const r = state.result;
  const title = r.victory ? '🏆 승리' : r.reason === 'dead' ? '☠ 사망' : '☠ 할당량 미달';
  return `<div class="overlay"><div class="panel end">
    <h2>${title}</h2>
    <p>스테이지 ${r.stage} 도달 · 시드 ${state.seed}</p>
    <div class="row">
      <button data-act="goHome">🏠 홈으로</button>
      <button data-act="retry">같은 시드로 다시</button>
      <button class="primary" data-act="restart">새 게임</button>
    </div>
  </div></div>`;
}

// 배당표: 내 칩 주머니에 있는 칩 종류별 베팅 배당과 능력
export function renderPaytable(state) {
  const counts = countChips(state.player.pouch);
  const rows = Object.keys(CHIPS).filter((t) => counts[t]).map((t) => {
    const c = CHIPS[t];
    return `<tr><td><span class="dot" style="--c:${c.color}"></span>${c.icon}</td>
      <td><b>${c.name}</b> ×${counts[t]}${c.ability ? `<div class="abil">${c.ability}</div>` : ''}</td>
      <td class="bet">${betText(c.bet).replace(/ · /g, '<br>')}</td></tr>`;
  }).join('');
  return `<aside class="paytable">
    <h4>배당표 <small>건 칩 → 부적 순서로 계산</small></h4>
    <table>${rows}</table>
    <p class="rule">득점 = 판돈 × 배수<br>점수는 딜러 적중 때만 · 기본 판돈 ${CONFIG.baseHitStake + state.player.mods.baseStake}<br>현재 쌓인 배수 ×${state.duel.heat} (나를 쏴서 공포탄 +1, 재장전 시 1)</p>
  </aside>`;
}
