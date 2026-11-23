// 사운드: 엔진 이벤트 → 효과음. 3D 연출 타이밍(scene3d.play)과 맞춰 지연을 준다.
// 효과음은 plinkfx(CC0, 코드로 합성)를 쓴다 → src/vendor/plinkfx
import { play, volume, muted, unlockAudio } from '../vendor/plinkfx/index.js';

const FIRE_AT = 0.65;   // 총을 들고 발사하기까지 (scene3d animShot과 같은 값)
const SHOT_LEN = 1.55;  // 사격 연출 전체 길이

let ambient = null;
let ambientTimer = null;
let ringTimer = null;
let heartTimer = null;

const s = (name, opts = {}) => {
  try { return play(name, opts); } catch { return undefined; }
};
const jitter = (base = 1, amt = 0.06) => base * (1 - amt + Math.random() * amt * 2);

export function initAudio() {
  let saved = false;
  try { saved = localStorage.getItem('lc-muted') === '1'; } catch { /* 저장소 없음 */ }
  muted(saved);
  volume(0.85);
  unlockAudio();
  const start = () => {
    startAmbient();
    window.removeEventListener('pointerdown', start);
    window.removeEventListener('keydown', start);
  };
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
}

export function toggleMute() {
  const m = muted(!muted());
  try { localStorage.setItem('lc-muted', m ? '1' : '0'); } catch { /* 저장소 없음 */ }
  if (!m) startAmbient();
  return m;
}
export const isMuted = () => muted();

// 배경: 낮게 깔리는 공포 드론 + 가끔 속삭임/쇠사슬
function startAmbient() {
  if (ambient) return;
  ambient = s('dread-drone', { loop: true, volume: 0.12, rate: 0.7, voices: 1 });
  const next = () => {
    ambientTimer = setTimeout(() => {
      const pick = Math.random();
      if (pick < 0.4) s('whisper', { volume: 0.12, rate: jitter(0.75, 0.1), pan: Math.random() * 1.6 - 0.8 });
      else if (pick < 0.7) s('chains-rattle', { volume: 0.1, rate: 0.8, pan: Math.random() * 1.6 - 0.8 });
      else s('music-box', { volume: 0.07, rate: 0.85 });
      next();
    }, 18000 + Math.random() * 22000);
  };
  if (!ambientTimer) next();
}

export const sfx = {
  click: () => s('click-soft', { volume: 0.35 }),
  select: (on) => s('chip-stack', { volume: on ? 0.6 : 0.35, rate: on ? jitter(1.1) : 0.85 }),
  deny: () => s('deny', { volume: 0.4 }),
};

// 한 번의 행동에서 나온 이벤트들을 순서대로 소리로 바꾼다
export function playEvents(events, { jackpot = 0, state } = {}) {
  let t = 0;
  let fire = 0;
  for (const e of events) {
    switch (e.type) {
      case 'bet':
        e.chips.forEach((_, i) => s('chip-stack', { delay: t + i * 0.07, rate: jitter(1 + i * 0.05), volume: 0.7, cooldown: 0 }));
        break;
      case 'shot':
        fire = t + FIRE_AT;
        s('reload', { delay: t + 0.15, volume: 0.35, rate: 0.9 });          // 총을 집어 들며 철컥
        if (e.live) {
          s('shotgun', { delay: fire, volume: 1, rate: jitter(0.92) });
          s('shell-casing', { delay: fire + 0.45, volume: 0.6 });
        } else {
          s('dry-fire', { delay: fire, volume: 0.9 });
        }
        t += SHOT_LEN;
        break;
      case 'damage':
        if (e.who === 'player') {
          s('hurt', { delay: fire + 0.05, volume: 0.8, rate: 0.7 });
          s('heartbeat', { delay: fire + 0.35, volume: 0.9 });
        } else {
          s('creature-hurt', { delay: fire + 0.08, volume: 0.7, rate: 0.75 });
        }
        break;
      case 'dodge':
        s('block', { delay: fire + 0.05, volume: 0.8 });
        break;
      case 'dealerEndures':
        s('growl-small', { delay: fire + 0.25, volume: 0.8, rate: 0.6 });
        break;
      case 'score': {
        const at = fire || t;
        if (!jackpot) s('coin', { delay: at + 0.1, volume: 0.6, rate: jitter(1 + Math.min(1, e.mult / 20)) });
        break;
      }
      case 'reload':
        for (let i = 0; i < Math.min(4, e.live + e.blank); i++) s('reload', { delay: t + i * 0.12, volume: 0.45, rate: jitter(1.1), cooldown: 0 });
        t += 0.45;
        break;
      case 'dealerPeek':
        s('whisper', { delay: t, volume: 0.35, rate: 0.7 });
        s('static-burst', { delay: t + 0.1, volume: 0.15 });
        t += 0.5;
        break;
      case 'dealerSaw':
        s('chains-rattle', { delay: t, volume: 0.6 });
        s('ratchet', { delay: t + 0.2, volume: 0.6, rate: 0.8 });
        t += 0.3;
        break;
      case 'itemUsed':
        s({ peek: 'scan', eject: 'shell-casing', hollow: 'reload', bandage: 'heal' }[e.id] ?? 'click', { delay: t, volume: 0.6 });
        break;
      case 'chipBroken':
        s('glass-break', { delay: fire + 0.5, volume: 0.6 });
        break;
      case 'chipEffect':
      case 'chipReturned':
        if (e.coins) s('coin-double', { delay: fire + 0.4, volume: 0.5 });
        break;
      case 'stageClear':
        s('level-complete', { delay: t + 0.3, volume: 0.8 });
        s('coin-bag', { delay: t + 0.9, volume: 0.8 });
        if (e.bonus >= 6) s('ka-ching', { delay: t + 1.2, volume: 0.7 });
        break;
      case 'phoneRing':
        startRinging(t + 1.9);
        break;
      case 'augment':
        stopRinging();
        s('door-heavy', { volume: 0.25, rate: 1.4 }); // 수화기를 내려놓는 소리
        s('unlock', { delay: 0.3, volume: 0.6 });
        break;
      case 'bought':
        s(e.kind === 'chip' ? 'chip-stack' : 'ka-ching', { volume: 0.7 });
        break;
      case 'boughtBooth':
        s('loot-rare', { volume: 0.7 });
        break;
      case 'sold':
      case 'chipRemoved':
        s('coin', { volume: 0.5, rate: 0.8 });
        break;
      case 'reroll':
        s('card-shuffle', { volume: 0.7 });
        break;
      case 'spin':
        s('slot-spin', { volume: 0.7 });
        [0.7, 0.95, 1.2].forEach((d) => s('slot-stop', { delay: d, volume: 0.6, cooldown: 0 }));
        if (e.coins >= 8 || e.tickets) s('jackpot', { delay: 1.4, volume: 0.8 });
        else if (e.coins > 0) s('coin-bag', { delay: 1.4, volume: 0.6 });
        else if (e.hp < 0) s('horror-sting', { delay: 1.4, volume: 0.6 });
        break;
      case 'stageStart':
        if (e.stage > 1) s('round-start', { volume: 0.5, rate: 0.8 });
        break;
      case 'gameOver':
        stopRinging();
        if (e.reason === 'dead') {
          s('body-fall', { delay: fire + 0.4, volume: 0.9 });
          s('horror-sting', { delay: fire + 0.9, volume: 0.8 });
        } else {
          s('buzzer-wrong', { delay: t + 0.2, volume: 0.6 });
          s('game-over', { delay: t + 0.8, volume: 0.7 });
        }
        break;
      case 'victory':
        s('victory', { delay: t + 1, volume: 0.9 });
        break;
      case 'invalid':
        s('deny', { volume: 0.35 });
        break;
    }
  }

  // 큰 한 방: 레벨이 높을수록 화려하게
  if (jackpot) {
    const at = fire + 0.1;
    if (jackpot === 1) s('coin-bag', { delay: at, volume: 0.9 });
    if (jackpot >= 2) { s('jackpot', { delay: at, volume: 1 }); s('coin-bag', { delay: at + 0.5, volume: 0.8 }); }
    if (jackpot >= 3) { s('ka-ching', { delay: at + 0.9, volume: 0.9 }); s('firework', { delay: at + 1.1, volume: 0.5 }); }
  }

  // 체력 1: 심장 소리가 계속 들린다
  if (state) updateHeartbeat(state);
}

function startRinging(delay) {
  stopRinging();
  const ring = () => {
    s('alarm', { volume: 0.45, rate: 1.25 });
    s('alarm', { delay: 0.65, volume: 0.45, rate: 1.25 });
  };
  ringTimer = setTimeout(function loop() {
    ring();
    ringTimer = setTimeout(loop, 2600);
  }, delay * 1000);
}

function stopRinging() {
  clearTimeout(ringTimer);
  ringTimer = null;
}

function updateHeartbeat(state) {
  const danger = (state.phase === 'player' || state.phase === 'dealer') && state.player.hp === 1;
  if (danger && !heartTimer) {
    heartTimer = setInterval(() => s('heartbeat', { volume: 0.55, rate: 0.95 }), 1100);
  } else if (!danger && heartTimer) {
    clearInterval(heartTimer);
    heartTimer = null;
  }
}
