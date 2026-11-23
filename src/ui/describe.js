// 엔진 이벤트 → 사람이 읽는 로그 문장
import { ITEMS } from '../core/items.js';
import { CHARMS } from '../core/charms.js';
import { CHIPS } from '../core/chips.js';
import { AUGMENTS } from '../core/augments.js';
import { TICKET_GOODS } from '../core/tickets.js';

const chip = (t) => `${CHIPS[t].icon} ${CHIPS[t].name}`;

const who = (x) => (x === 'player' ? '당신' : '딜러');
const trig = (t = []) => (t.length ? ` [${t.map((x) => `${x.icon}${x.label}`).join(', ')}]` : '');

export function describe(e) {
  switch (e.type) {
    case 'stageStart': return `── 스테이지 ${e.stage} · 할당량 ${e.quota} · 딜러 체력 ${e.dealerHp}${e.healed ? ` · 체력 +${e.healed}` : ''} ──`;
    case 'reload': return `약실 ${e.chamberNo}/${e.limit} 장전: 실탄 ${e.live} · 공포탄 ${e.blank}`;
    case 'itemGained': return `보급: ${ITEMS[e.id].icon} ${ITEMS[e.id].name}`;
    case 'shot': {
      const tgt = e.shooter === e.target ? '자신' : who(e.target);
      return `${who(e.shooter)} → ${tgt}: ${e.live ? '💥 실탄!' : '…찰칵 (공포탄)'}`;
    }
    case 'damage': return `${who(e.who)} 체력 -${e.amount} (남은 ${e.hp})${trig(e.triggers)}`;
    case 'dodge': return `피해를 피했다!${trig(e.triggers)}`;
    case 'heat': return `열기 +${e.gain} → ${e.heat}${trig(e.triggers)}`;
    case 'score': return `득점 ${e.stake} × ${e.mult} = ${e.points}${trig(e.triggers)}`;
    case 'itemUsed': return `${ITEMS[e.id].icon} ${ITEMS[e.id].name} 사용`;
    case 'peek': return `현재 탄은… ${e.live ? '실탄' : '공포탄'}`;
    case 'eject': return `배출된 탄: ${e.live ? '실탄' : '공포탄'}`;
    case 'empower': return '강화탄 장전 완료';
    case 'heal': return `체력 +${e.amount}`;
    case 'stageClear': return `★ 스테이지 클리어! ${e.score}/${e.quota} · 코인 +${e.coins}${e.bonus ? ` (초과 보너스 ${e.bonus})` : ''} · 티켓 +${e.tickets} · ⚪화이트 칩 +${e.giftChips}${e.slotUp ? ` · 🫴 베팅 칸 +1 (이제 ${e.betSlots}개)` : ''}${trig(e.triggers)}`;
    case 'phoneRing': return '📞 따르릉… 전화가 온다';
    case 'augment': return `증강: ${AUGMENTS[e.id].icon} ${AUGMENTS[e.id].name}`;
    case 'boughtBooth': return `티켓 교환: ${(e.kind === 'charm' ? CHARMS : TICKET_GOODS)[e.id].name} (-${e.price}🎟️)`;
    case 'dealerEndures': return '딜러가 피를 흘리며 버틴다… (할당량을 채워야 쓰러진다)';
    case 'dealerPeek': return '👁 딜러가 약실을 들여다본다…';
    case 'dealerSaw': return '🩸 딜러가 강화탄을 밀어 넣는다 (피해 2)';
    case 'dealerFolds': return '약실이 바닥났다. 딜러가 판을 접는다.';
    case 'stipend': return `수당 +${e.coins} 코인`;
    case 'gameOver': return e.reason === 'dead' ? '☠ 사망' : `☠ 할당량 미달 (${e.score}/${e.quota})`;
    case 'victory': return '🏆 모든 스테이지 돌파!';
    case 'bought': return `구매: ${({ charm: CHARMS, item: ITEMS, chip: CHIPS })[e.kind][e.id].name} (-${e.price})`;
    case 'bet': return `베팅: ${e.chips.map(chip).join(' → ')}`;
    case 'draw': return `칩 뽑기: ${e.chips.map((t) => CHIPS[t].icon).join(' ')}`;
    case 'pouchShuffle': return `버린 칩 ${e.count}개를 주머니에 다시 섞음`;
    case 'chipEffect': return `${chip(e.chip)}${trig(e.triggers)}`;
    case 'chipReturned': return `${chip(e.chip)} 손패로 복귀${trig(e.triggers)}`;
    case 'chipBroken': return `${chip(e.chip)} 산산조각!`;
    case 'chipRemoved': return `${chip(e.chip)} 주머니에서 제거 (-${e.cost})`;
    case 'sold': return `판매: ${CHARMS[e.id].name} (+${e.price})`;
    case 'reroll': return `상품 새로고침 (-${e.cost})`;
    case 'spin': return `슬롯: ${e.label}${trig(e.triggers)}`;
    default: return null;
  }
}
