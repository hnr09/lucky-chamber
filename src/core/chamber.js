// 약실 장전: 실탄(true)과 공포탄(false)을 섞는다. 최소 1발씩은 들어간다.
export function loadChamber(rng, maxShells) {
  const total = rng.int(2, maxShells);
  const live = rng.int(1, total - 1);
  const shells = rng.shuffle([
    ...Array(live).fill(true),
    ...Array(total - live).fill(false),
  ]);
  return { shells, live, blank: total - live };
}
