import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newVersus, actVersus, viewFor, VS } from '../src/core/versus.js';
import { createOnlineMatch } from '../src/core/online.js';

function rig(shells, turn = 0) {
  const { state } = newVersus(7);
  state.shells = [...shells];
  state.turn = turn;
  return state;
}

test('결투: 상대를 실탄으로 맞히면 체력 -1, 차례 넘어감', () => {
  const s = rig([true, false, false]);
  actVersus(s, 0, { type: 'shoot', target: 'opponent' });
  assert.equal(s.hp[1], VS.hp - 1);
  assert.equal(s.turn, 1);
});

test('결투: 나를 쏴서 공포탄 → 배수 +1, 차례 유지', () => {
  const s = rig([false, true, true]);
  actVersus(s, 0, { type: 'shoot', target: 'self' });
  assert.equal(s.heat[0], 2);
  assert.equal(s.turn, 0);
});

test('결투: 배수 3 이상에서 맞히면 피해 2, 강화탄까지 3', () => {
  const s = rig([false, false, true, true]);
  s.items[0] = ['hollow'];
  actVersus(s, 0, { type: 'shoot', target: 'self' });
  actVersus(s, 0, { type: 'shoot', target: 'self' });
  actVersus(s, 0, { type: 'useItem', index: 0 });
  actVersus(s, 0, { type: 'shoot', target: 'opponent' });
  assert.equal(s.hp[1], VS.hp - 3);
});

test('결투: 상대 차례에는 행동할 수 없다', () => {
  const s = rig([true, false]);
  assert.equal(actVersus(s, 1, { type: 'shoot', target: 'self' })[0].type, 'invalid');
});

test('결투: 체력 0 → 판 승리, 2판 이기면 매치 승리', () => {
  const s = rig([true, true, true, true, false]);
  s.hp[1] = 1;
  const ev = actVersus(s, 0, { type: 'shoot', target: 'opponent' });
  assert.ok(ev.some((e) => e.type === 'roundWin' && e.player === 0));
  assert.equal(s.phase, 'roundOver');
  actVersus(s, 0, { type: 'nextRound' });
  assert.equal(s.round, 2);
  assert.equal(s.turn, 1); // 2판은 상대 선공
  s.shells = [true, false, false];
  s.turn = 0;
  s.hp[1] = 1;
  const ev2 = actVersus(s, 0, { type: 'shoot', target: 'opponent' });
  assert.ok(ev2.some((e) => e.type === 'matchWin'));
  assert.equal(s.phase, 'over');
});

test('결투: 상대에게 보내는 화면에는 탄 순서와 내 돋보기 결과가 없다', () => {
  const s = rig([true, false, true]);
  s.items[0] = ['peek'];
  actVersus(s, 0, { type: 'useItem', index: 0 });
  const v1 = viewFor(s, 1);
  assert.equal(v1.shells, undefined);
  assert.equal(v1.rng, undefined);
  assert.equal(v1.myPeek, null);
  assert.equal(viewFor(s, 0).myPeek, true);
  assert.deepEqual(v1.left, { live: 2, blank: 1 });
  assert.ok(JSON.stringify(v1).length < 3000, '4KB presence 제한 안');
});

test('결투: 무작위 2000판 — 모두 끝나고 불변식 유지', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const { state: s } = newVersus(seed);
    let steps = 0;
    while (s.phase !== 'over') {
      if (s.phase === 'roundOver') { actVersus(s, 0, { type: 'nextRound' }); continue; }
      const p = s.turn;
      const r = (seed * 31 + steps * 17) % 10;
      const action = r < 2 && s.items[p].length ? { type: 'useItem', index: 0 } : { type: 'shoot', target: r < 6 ? 'opponent' : 'self' };
      actVersus(s, p, action);
      assert.ok(s.hp.every((h) => h >= 0 && h <= VS.hp));
      assert.ok(s.phase !== 'play' || s.shells.length > 0);
      assert.ok(++steps < 3000);
    }
    assert.equal(Math.max(...s.wins), VS.roundsToWin);
  }
});

// ── 온라인 동기화: 가짜 room으로 방장/참가자 두 화면을 흉내 ──
function fakeRoomPair() {
  const pres = [{}, {}];
  const handlers = [[], []];
  const peersFor = (me) => [0, 1].map((i) => ({ peer: `p${i}`, isMe: i === me, presence: pres[i] }));
  const deliver = () => {
    for (const i of [0, 1]) for (const h of handlers[i]) h({ peers: peersFor(i) });
  };
  const make = (i) => ({
    presence(patch) { pres[i] = JSON.parse(JSON.stringify({ ...pres[i], ...patch })); queueMicrotask(deliver); return Promise.resolve(); },
    onPeers(h) { handlers[i].push(h); queueMicrotask(() => h({ peers: peersFor(i) })); return () => {}; },
    peers: () => peersFor(i),
  });
  return [make(0), make(1)];
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('온라인: 방장과 참가자가 번갈아 쏘고 화면이 맞는다', async () => {
  const [ra, rb] = fakeRoomPair();
  let hostView, guestView;
  const guestEvents = [];
  const host = createOnlineMatch({ room: ra, role: 'host', seed: 42, onUpdate: (v) => { hostView = v; } });
  const guest = createOnlineMatch({ room: rb, role: 'guest', onUpdate: (v, ev) => { guestView = v; guestEvents.push(...ev); } });
  await tick(); await tick();
  assert.ok(host.opponentHere && guest.opponentHere);
  assert.ok(guestView, '참가자가 화면을 받음');
  assert.equal(guestView.shells, undefined, '참가자에게 탄 순서는 가지 않는다');

  // 몇 차례 진행: 차례인 쪽이 상대를 쏜다
  for (let i = 0; i < 12 && hostView.phase === 'play'; i++) {
    if (hostView.turn === 0) host.act({ type: 'shoot', target: 'opponent' });
    else guest.act({ type: 'shoot', target: 'opponent' });
    await tick(); await tick(); await tick();
    assert.equal(guestView.turn, hostView.turn, `차례 일치 (${i})`);
    assert.deepEqual(guestView.hp, hostView.hp, `체력 일치 (${i})`);
    assert.equal(guest.pending, false);
  }
  assert.ok(guestEvents.some((e) => e.type === 'shot'));
});

test('온라인: 참가자는 자기 차례가 아니면 행동을 보내지 않는다', async () => {
  const [ra, rb] = fakeRoomPair();
  let hostView;
  createOnlineMatch({ room: ra, role: 'host', seed: 5, onUpdate: (v) => { hostView = v; } });
  const guest = createOnlineMatch({ room: rb, role: 'guest' });
  await tick(); await tick();
  assert.equal(hostView.turn, 0);
  const r = guest.act({ type: 'shoot', target: 'opponent' });
  assert.equal(r[0].type, 'invalid');
});
