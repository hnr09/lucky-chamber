// 밸런스 리포트: node sim/balance.js [판수] [selfThreshold]
// 전략 봇으로 여러 판을 돌려 승률, 사망/할당량 실패 비율, 스테이지별 점수/할당량 배율을 출력한다.
import { newRun, act } from '../src/core/engine.js';
import { CONFIG, stageSpec } from '../src/core/config.js';
import { decide } from './bot.js';

const RUNS = Number(process.argv[2] ?? 2000);
const THRESHOLD = Number(process.argv[3] ?? 0.45);

const reached = Array(CONFIG.finalStage + 2).fill(0);
const fail = { dead: Array(CONFIG.finalStage + 1).fill(0), quota: Array(CONFIG.finalStage + 1).fill(0) };
const scores = Array.from({ length: CONFIG.finalStage + 1 }, () => []);
const ratios = Array.from({ length: CONFIG.finalStage + 1 }, () => []);
const bestShot = Array.from({ length: CONFIG.finalStage + 1 }, () => []);
const hpAtClear = Array.from({ length: CONFIG.finalStage + 1 }, () => []);
let wins = 0;

for (let r = 0; r < RUNS; r++) {
  const { state } = newRun(1000 + r);
  let steps = 0;
  let stageBest = 0;
  while (state.phase !== 'gameOver' && state.phase !== 'victory' && steps++ < 20000) {
    const stage = state.stage;
    const events = act(state, decide(state, { selfThreshold: THRESHOLD }));
    for (const e of events) {
      if (e.type === 'score') stageBest = Math.max(stageBest, e.points);
      if (e.type === 'stageClear') {
        ratios[stage].push(e.score / e.quota);
        scores[stage].push(e.score);
        bestShot[stage].push(stageBest / e.quota);
        hpAtClear[stage].push(state.player.hp);
        stageBest = 0;
      }
      if (e.type === 'invalid') throw new Error(`봇이 잘못된 행동: ${e.reason} (phase ${state.phase})`);
    }
  }
  reached[state.stage]++;
  if (state.result.victory) wins++;
  else fail[state.result.reason][state.stage]++;
}

const pct = (n) => `${((n / RUNS) * 100).toFixed(1)}%`;
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const p90 = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.9)] : 0);

console.log(`\n${RUNS}판 · 자기 사격 기준 실탄확률 < ${THRESHOLD}`);
console.log(`승률 ${pct(wins)}  · 사망 ${pct(fail.dead.reduce((a, b) => a + b, 0))}  · 할당량 실패 ${pct(fail.quota.reduce((a, b) => a + b, 0))}\n`);
console.log('스테이지 | 할당량 | 도달 | 사망 | 할당량실패 | 점수/할당량 중앙값 | 상위10% | 최고 한방/할당량 중앙값 | 클리어 시 체력 | 점수 중앙값');
let alive = RUNS;
for (let s = 1; s <= CONFIG.finalStage; s++) {
  const line = [
    String(s).padStart(4),
    String(stageSpec(s).quota).padStart(7),
    pct(alive).padStart(6),
    pct(fail.dead[s]).padStart(6),
    pct(fail.quota[s]).padStart(8),
    `×${median(ratios[s]).toFixed(2)}`.padStart(10),
    `×${p90(ratios[s]).toFixed(2)}`.padStart(8),
    `×${median(bestShot[s]).toFixed(2)}`.padStart(10),
    median(hpAtClear[s]).toFixed(0).padStart(6),
    String(median(scores[s])).padStart(8),
  ];
  console.log(line.join(' | '));
  alive -= fail.dead[s] + fail.quota[s];
}
