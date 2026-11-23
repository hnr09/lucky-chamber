import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { loadChamber } from '../src/core/chamber.js';

test('같은 시드는 같은 수열을 만든다', () => {
  const a = createRng({ s: 42 }), b = createRng({ s: 42 });
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('약실에는 항상 실탄과 공포탄이 최소 1발씩 있다', () => {
  const rng = createRng({ s: 7 });
  for (let i = 0; i < 2000; i++) {
    const { shells, live, blank } = loadChamber(rng, 8);
    assert.ok(live >= 1 && blank >= 1);
    assert.equal(shells.filter(Boolean).length, live);
    assert.ok(shells.length >= 2 && shells.length <= 8);
  }
});
