// 게임 설명서: 첫 실행 때 자동으로 열리고, 하단 '📖 설명서' 버튼으로 언제든 다시 본다.
import { CONFIG, stageSpec } from '../core/config.js';

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
        <div class="box dark"><b>나를 쏜다</b><br>공포탄 → <b>열기 +1</b>, 약간의 점수, <b>내 차례 유지</b><br>실탄 → 내 체력 -1, 차례 넘어감</div>
      </div>
      <p class="tip">💡 이미 나온 탄을 세면 다음 탄이 실탄일 확률을 알 수 있다.<br>공포탄이 많이 남았으면 나를 쏴서 열기를 쌓고, 실탄이 많으면 딜러를 쏴라.</p>`,
  },
  {
    title: '점수 계산',
    body: () => `
      <p class="formula-big"><span class="stake">판돈</span> × <span class="mult">배수</span> = 점수</p>
      <ul>
        <li><b>판돈</b>: 딜러 적중 ${CONFIG.baseHitStake}, 나에게 쏜 공포탄 ${CONFIG.selfBlankStake}. 칩과 부적으로 늘어난다.</li>
        <li><b>배수 = 열기</b>: 나를 쏴서 공포탄이 나올 때마다 +1. <b>재장전하면 1로 돌아간다.</b></li>
        <li>그래서 핵심은 <b>열기를 높게 쌓은 다음, 좋은 칩을 걸고 딜러를 맞히는 것</b>.</li>
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
        <li>할당량을 채운 뒤 딜러를 쓰러뜨리면 <b>즉시 클리어</b>.</li>
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
