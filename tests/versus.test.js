import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newVersus, actVersus, viewFor, forfeit, VS } from '../src/core/versus.js';
import { createOnlineHost, createOnlineGuest } from '../src/core/online.js';

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

// ── 3~4인 ──
test('4인: 차례가 살아 있는 다음 사람에게 돌고, 쓰러진 사람은 건너뛴다', () => {
  const { state: s } = newVersus(3, 4);
  assert.equal(s.players, 4);
  s.shells = [true, false, false, false, false];
  s.turn = 0;
  s.hp[2] = 1;
  actVersus(s, 0, { type: 'shoot', target: 2 }); // 2 탈락
  assert.equal(s.hp[2], 0);
  assert.equal(s.turn, 1);
  actVersus(s, 1, { type: 'shoot', target: 3 }); // 공포탄 → 차례 넘어감 (2는 건너뜀)
  assert.equal(s.turn, 3);
  assert.equal(actVersus(s, 3, { type: 'shoot', target: 2 })[0].type, 'invalid'); // 쓰러진 사람은 못 쏜다
});

test('3인: 마지막 한 명이 남으면 그 판 승리', () => {
  const { state: s } = newVersus(4, 3);
  s.shells = [true, true, false];
  s.turn = 0;
  s.hp = [4, 1, 1];
  actVersus(s, 0, { type: 'shoot', target: 1 });
  assert.equal(s.phase, 'play');
  s.turn = 0;
  const ev = actVersus(s, 0, { type: 'shoot', target: 2 });
  assert.ok(ev.some((e) => e.type === 'roundWin' && e.player === 0));
});

test('나간 사람은 탈락 처리, 차례였으면 다음 사람에게', () => {
  const { state: s } = newVersus(5, 3);
  s.turn = 1;
  forfeit(s, 1);
  assert.equal(s.hp[1], 0);
  assert.equal(s.turn, 2);
  const ev = forfeit(s, 2);
  assert.ok(ev.some((e) => e.type === 'roundWin' && e.player === 0));
});

test('무작위 4인 1000판 — 모두 끝나고 불변식 유지', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const n = 2 + (seed % 3);
    const { state: s } = newVersus(seed, n);
    let steps = 0;
    while (s.phase !== 'over') {
      if (s.phase === 'roundOver') { actVersus(s, 0, { type: 'nextRound' }); continue; }
      const p = s.turn;
      const targets = s.hp.map((h, i) => (h > 0 && i !== p ? i : -1)).filter((i) => i >= 0);
      const r = (seed * 31 + steps * 17) % 10;
      const action = r < 2 && s.items[p].length ? { type: 'useItem', index: 0 } : { type: 'shoot', target: r < 6 ? targets[r % targets.length] : 'self' };
      actVersus(s, p, action);
      assert.ok(s.hp[s.turn] > 0 || s.phase !== 'play', '쓰러진 사람 차례');
      assert.ok(++steps < 5000);
    }
  }
});

// ── 온라인 동기화: 가짜 연결로 방장 1 + 참가자 3 ──
function fakeNet() {
  const hostH = { join: [], leave: [], msg: [] };
  const guests = {};
  const hub = {
    onJoin: (f) => hostH.join.push(f),
    onLeave: (f) => hostH.leave.push(f),
    onMessage: (f) => hostH.msg.push(f),
    send: (id, m) => queueMicrotask(() => guests[id]?.h.forEach((f) => f(JSON.parse(JSON.stringify(m))))),
  };
  const connect = (id) => {
    guests[id] = { h: [] };
    const link = { onMessage: (f) => guests[id].h.push(f), send: (m) => queueMicrotask(() => hostH.msg.forEach((f) => f(id, JSON.parse(JSON.stringify(m))))) };
    queueMicrotask(() => hostH.join.forEach((f) => f(id)));
    return link;
  };
  const leave = (id) => { delete guests[id]; hostH.leave.forEach((f) => f(id)); };
  return { hub, connect, leave };
}
const tick = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

test('온라인 4인: 대기실 → 시작 → 차례대로 쏘고 모두 화면이 맞는다', async () => {
  const net = fakeNet();
  let hostView, hostLobby;
  const host = createOnlineHost({ hub: net.hub, seed: 42, onLobby: (l) => { hostLobby = l; }, onUpdate: (v) => { hostView = v; } });
  const g = [1, 2, 3].map((k) => {
    const o = { view: null, lobby: null };
    o.c = createOnlineGuest({ link: net.connect('g' + k), onLobby: (l) => { o.lobby = l; }, onUpdate: (v) => { o.view = v; } });
    return o;
  });
  await tick();
  assert.equal(hostLobby.players, 4);
  assert.deepEqual(g.map((x) => x.lobby.me), [1, 2, 3]);
  assert.ok(host.start());
  await tick();
  assert.ok(g.every((x) => x.view && x.view.players === 4));
  assert.equal(g[0].view.shells, undefined, '참가자에게 탄 순서는 가지 않는다');
  for (let i = 0; i < 30 && hostView.phase === 'play'; i++) {
    const t = hostView.turn;
    const target = hostView.hp.findIndex((h, k) => h > 0 && k !== t);
    if (t === 0) host.act({ type: 'shoot', target });
    else g[t - 1].c.act({ type: 'shoot', target });
    await tick();
    for (const x of g) {
      assert.equal(x.view.turn, hostView.turn, `차례 일치 (${i})`);
      assert.deepEqual(x.view.hp, hostView.hp, `체력 일치 (${i})`);
    }
  }
});

test('온라인: 5번째 사람은 거절, 게임 중 나가면 탈락 처리', async () => {
  const net = fakeNet();
  let hostView;
  const host = createOnlineHost({ hub: net.hub, seed: 9, onUpdate: (v) => { hostView = v; } });
  for (const k of [1, 2, 3]) createOnlineGuest({ link: net.connect('g' + k) });
  let refused = null;
  createOnlineGuest({ link: net.connect('g4'), onRefused: (r) => { refused = r; } });
  await tick();
  assert.ok(refused);
  host.start();
  await tick();
  net.leave('g2');
  await tick();
  assert.equal(hostView.hp[2], 0);
});

test('온라인: 참가자는 자기 차례가 아니면 보내지 않는다', async () => {
  const net = fakeNet();
  let hostView;
  const host = createOnlineHost({ hub: net.hub, seed: 5, onUpdate: (v) => { hostView = v; } });
  const guest = createOnlineGuest({ link: net.connect('g1') });
  await tick();
  host.start();
  await tick();
  assert.equal(hostView.turn, 0);
  assert.equal(guest.act({ type: 'shoot', target: 0 })[0].type, 'invalid');
});
