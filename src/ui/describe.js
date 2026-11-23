// 엔진 이벤트 → 사람이 읽는 로그 문장
import { ITEMS } from '../core/items.js';
import { CHARMS } from '../core/charms.js';

const who = (x) => (x === 'player' ? '당신' : '딜러');
const trig = (t = []) => (t.length ? ` [${t.map((x) => `${x.icon}${x.label}`).join(', ')}]` : '');

export function describe(e) {
  switch (e.type) {
    case 'stageStart': return `── 스테이지 ${e.stage} · 할당량 ${e.quota} · 딜러 체력 ${e.dealerHp}${e.healed ? ` · 체력 +${e.healed}` : ''} ──`;
    case 'reload': return `약실 장전: 실탄 ${e.live} · 공포탄 ${e.blank}`;
    case 'itemGained': return `보급: ${ITEMS[e.id].icon} ${ITEMS[e.id].name}`;
    case 'shot': {
      const tgt = e.shooter === e.target ? '자신' : who(e.target);
      return `${who(e.shooter)} → ${tgt}: ${e.live ? '💥 실탄!' : '…찰칵 (공포탄)'}`;
    }
    case 'damage': return `${who(e.who)} 체력 -${e.amount} (남은 ${e.hp})${trig(e.triggers)}`;
    case 'dodge': return `피해를 피했다!${trig(e.triggers)}`;
    case 'heat': return `열기 +${e.gain} → ${e.heat}${trig(e.triggers)}`;
    case 'score': return `득점 ${e.chips} × ${e.mult} = ${e.points}${trig(e.triggers)}`;
    case 'itemUsed': return `${ITEMS[e.id].icon} ${ITEMS[e.id].name} 사용`;
    case 'peek': return `현재 탄은… ${e.live ? '실탄' : '공포탄'}`;
    case 'eject': return `배출된 탄: ${e.live ? '실탄' : '공포탄'}`;
    case 'empower': return '강화탄 장전 완료';
    case 'heal': return `체력 +${e.amount}`;
    case 'stageClear': return `★ 스테이지 클리어! ${e.score}/${e.quota} · 코인 +${e.coins}${e.bonus ? ` (초과 보너스 ${e.bonus})` : ''}${trig(e.triggers)}`;
    case 'gameOver': return e.reason === 'dead' ? '☠ 사망' : `☠ 할당량 미달 (${e.score}/${e.quota})`;
    case 'victory': return '🏆 모든 스테이지 돌파!';
    case 'bought': return `구매: ${(e.kind === 'charm' ? CHARMS : ITEMS)[e.id].name} (-${e.price})`;
    case 'sold': return `판매: ${CHARMS[e.id].name} (+${e.price})`;
    case 'reroll': return `상품 새로고침 (-${e.cost})`;
    case 'spin': return `슬롯: ${e.label}${trig(e.triggers)}`;
    default: return null;
  }
}
