// 약실 장전: 실탄(true)과 공포탄(false)을 섞는다. 최소 1발씩은 들어간다.
export function loadChamber(rng, maxShells, liveFrac = 0.5) {
  const total = rng.int(3, maxShells);
  // 실탄 상한은 스테이지마다 다르다(초반 절반 → 후반 2/3). 공포탄이 있어야 '나를 쏘는' 도박이 성립한다
  // 실탄은 최소 1/3 (점수를 낼 기회 보장), 최대 liveFrac
  const hi = Math.max(1, Math.min(total - 1, Math.floor(total * liveFrac)));
  const lo = Math.min(hi, Math.max(1, Math.ceil(total / 3)));
  const live = rng.int(lo, hi);
  const shells = rng.shuffle([
    ...Array(live).fill(true),
    ...Array(total - live).fill(false),
  ]);
  return { shells, live, blank: total - live };
}
