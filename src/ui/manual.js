// 게임 설명서: 첫 실행 때 자동으로 열리고, 하단 '📖 설명서' 버튼으로 언제든 다시 본다.
import { CONFIG, stageSpec } from '../core/config.js?v=mwsx9ehs';

const PAGES = [
  {
    title: '목표',
    body: () => `
      <p class="lead">딜러와 산탄총으로 목숨을 건 내기를 한다.<br><b>${CONFIG.finalStage}개 스테이지</b>를 모두 넘기면 승리.</p>
      <ul>
        <li>스테이지마다 <b>할당량(목표 점수)</b>이 있다. 1스테이지 <b>${stageSpec(1).quota}</b>점에서 시작해 마지막엔 <b>${stageSpec(CONFIG.finalStage).quota.toLocaleString()}</b>점.</li>
        <li>할당량은 <b>약실 ${CONFIG.chambersPerStage}개</b>를 다 쓰기 전에 채워야 한다. 화면 위 <code>약실 1/3</code>.</li>
        <li>지는 방법은 두 가지: <b>체력이 0</b>이 되거나, <b>약실이 다 떨어졌는데 할당량 미달</b>.</li>
      </ul>`,
  },
  {
    title: '한 차례에 할 일',
    body: () => `
      <p>약실을 장전하면 <b>실탄과 공포탄 개수</b>만 알려준다. 순서는 모른다.</p>
      <div class="two">
        <div class="box red"><b>딜러를 쏜다</b><br>실탄 → 딜러 체력 -1, <b>점수 획득</b><br>공포탄 → 아무 일 없음<br><small>어느 쪽이든 차례가 딜러에게 넘어간다</small></div>
        <div class="box dark"><b>나를 쏜다</b><br>공포탄 → <b>배수 +1</b>, <b>내 차례 유지</b> (점수는 없음)<br>실탄 → 내 체력 -1, 차례 넘어감</div>
      </div>
      <p class="tip">💡 화면 아래에 <b>남은 탄과 실탄 확률</b>이 나온다.<br>공포탄이 많이 남았으면 나를 쏴서 배수를 쌓고, 실탄이 많으면 딜러를 쏴라.</p>`,
  },
  {
    title: '점수 계산',
    body: () => `
      <p class="formula-big"><span class="stake">판돈</span> × <span class="mult">배수</span> = 점수</p>
      <ul>
        <li><b>점수는 딜러를 실탄으로 맞혔을 때만</b> 들어온다.</li>
        <li><b>판돈</b>: 기본 ${CONFIG.baseHitStake}. 건 칩과 부적으로 늘어난다.</li>
        <li><b>배수</b>: 처음엔 ×1. <b>나를 쏴서 공포탄이 나올 때마다 +1</b>씩 쌓인다 (×2, ×3, ×4…). <b>재장전하면 ×1로 돌아간다.</b></li>
        <li>예) 공포탄으로 배수를 ×5까지 쌓고 딜러를 맞히면 판돈 10 × 5 = <b>50점</b>.</li>
        <li>그래서 핵심은 <b>겁 없이 나를 쏴서 배수를 쌓은 다음, 좋은 칩을 걸고 딜러를 맞히는 것</b>. 물론 나를 쏘다 실탄이면 체력이 깎인다.</li>
        <li>한 방이 할당량의 절반을 넘으면 <b>BIG WIN</b>, 넘으면 <b>JACKPOT</b>!</li>
      </ul>`,
  },
  {
    title: '베팅 칩',
    body: () => `
      <ul>
        <li>테이블 앞에 칩 <b>${CONFIG.handSize}개</b>(손패)가 놓인다. 매 차례 주머니에서 다시 채워진다.</li>
        <li>쏘기 전에 칩을 눌러 <b>한 번에 최대 ${CONFIG.betSlots}개</b>까지 건다. 건 칩은 그 사격에만 효과가 있다.</li>
        <li>칩마다 <b>배당</b>(판돈 +, 배수 +, 배수 ×)과 <b>고유 능력</b>이 있다. 왼쪽 <b>📋 배당표</b>에서 확인.</li>
        <li><b>고른 순서대로 발동</b>한다. 배수 +를 먼저, 배수 ×를 나중에 걸어야 점수가 크다.</li>
        <li>칩을 고르면 위쪽에 <b>예상 점수</b>가 바로 나온다. 칩을 안 걸고 쏴도 된다.</li>
        <li>거는 칸은 <b>3·6스테이지 클리어</b>와 증강으로 늘어난다.</li>
      </ul>`,
  },
  {
    title: '딜러와 클리어',
    body: () => `
      <ul>
        <li>할당량을 채우기 전에는 <b>딜러가 죽지 않는다</b>. 체력 1로 버틴다.</li>
        <li>할당량을 채우면 <b>💰 정산하고 일어서기</b> 버튼이 생긴다. 누르면 바로 클리어.</li>
        <li>딜러를 쓰러뜨려도 클리어 (처치 보너스 +${CONFIG.killBonus}코인).</li>
        <li>더 버티며 점수를 올리면 <b>초과 보너스 코인</b>(할당량 2배마다 +3). 대신 오래 있을수록 총 맞을 위험이 커진다.</li>
        <li>약실이 다 떨어졌을 때 할당량을 채웠으면 딜러가 판을 접고 클리어.</li>
        <li>체력은 <b>${CONFIG.startHp}</b>, 스테이지마다 전부 회복된다.</li>
        <li>딜러는 공격적이고, <b>스테이지가 오를수록</b> 실탄을 더 넣고, 약실을 몰래 들여다보고(👁), 2배 피해탄(🩸)까지 쓴다.</li>
      </ul>`,
  },
  {
    title: '아이템 · 상점 · 전화',
    body: () => `
      <ul>
        <li><b>아이템</b>(재장전마다 1개 보급): 🔍 돋보기 현재 탄 확인 · ⏏️ 배출 레버 현재 탄 버리기 · 💥 강화탄 다음 실탄 피해·판돈 2배 · 🩹 붕대 체력 +1</li>
        <li><b>클리어하면</b> 코인, 🎟️ 티켓, 화이트 칩 2개를 받는다.</li>
        <li><b>📞 전화</b>: 클리어 후 전화가 울린다. 증강 3개 중 1개를 고르면 이번 판 내내 유지.</li>
        <li><b>상점</b>: 부적(패시브, 테이블 위 <b>왼쪽부터 발동</b>), 아이템, 베팅 칩, 칩 제거, 🎟️ 티켓 부스(희귀 부적·영구 강화), 슬롯머신.</li>
      </ul>
      <p class="tip">⌨️ 단축키: 칩 선택 <b>1~9</b> · 딜러 쏘기 <b>D</b> · 나 쏘기 <b>S</b></p>`,
  },
];

PAGES.push({
  title: '결투 (2~4명)',
  body: () => `
    <p>홈에서 <b>같이 하기</b>(한 기기에서 2~4명이 번갈아) 또는 <b>온라인 대전</b>(방 코드로 최대 4명)을 고른다.</p>
    <ul>
      <li>판마다 모두 체력 4. <b>마지막까지 살아남은 사람</b>이 그 판을 이기고, <b>2판 먼저 이기면 승리</b>.</li>
      <li>쏘기는 두 단계: <b>대상 버튼으로 조준</b> → <b>🔫 발사</b>. 같은 대상을 한 번 더 눌러도 발사.</li>
      <li><b>조준하면 모두에게 보인다</b>: 총구와 붉은 시선이 그 사람을 향하고, 위에 "P2 → P4 노리는 중"이 뜬다. 발사 전엔 마음을 바꿀 수 있다.</li>
      <li>나를 쏴서 공포탄이면 <b>배수 +1</b>, 내 차례 유지. <b>배수 3 이상</b>에서 맞히면 <b>피해 2</b> (강화탄 +1).</li>
      <li>다른 사람을 쏘면 차례는 살아 있는 다음 사람에게 넘어간다.</li>
      <li>온라인: <b>방 만들기</b> → 코드나 초대 링크를 친구들에게 → 모두 들어오면 방장이 <b>시작</b>. 게임 중 나간 사람은 탈락 처리.</li>
    </ul>`,
});

export const MANUAL_PAGES = PAGES.length;

export function renderManual(page, { firstTime }) {
  const p = PAGES[page];
  const last = page === PAGES.length - 1;
  return `<div class="overlay manual-wrap"><div class="panel manual">
    <div class="manual-head">
      <h2>📖 설명서 <small>${page + 1} / ${PAGES.length}</small></h2>
      <button class="x" data-act="manualClose" title="닫기">✕</button>
    </div>
    <div class="dots">${PAGES.map((_, i) => `<button class="dot ${i === page ? 'on' : ''}" data-act="manualGo" data-index="${i}">${PAGES[i].title}</button>`).join('')}</div>
    <h3>${p.title}</h3>
    <div class="manual-body">${p.body()}</div>
    <div class="row">
      ${page > 0 ? '<button data-act="manualPrev">← 이전</button>' : ''}
      ${last
        ? `<button class="primary" data-act="manualClose">${firstTime ? '게임 시작' : '닫기'}</button>`
        : '<button class="primary" data-act="manualNext">다음 →</button>'}
    </div>
  </div></div>`;
}
