// semver: the one ordering for plain `major.minor.patch` versions (plugin upgrades and the app's stable update
// check). Callers validate against SEMVER_RE at their boundary first; pre-release and build suffixes are not
// part of either vocabulary, so this compares three numeric segments and nothing else.

/** A version this module orders: exactly three dot-separated non-negative integers. */
export const SEMVER_RE = /^\d+\.\d+\.\d+$/u;

/** The three segments a version carries. */
const SEMVER_SEGMENTS = 3;

/** Order two `major.minor.patch` versions: `-1` when `a` is older, `1` when newer, `0` when equal. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < SEMVER_SEGMENTS; i += 1) {
    if (pa[i] !== pb[i]) {
      return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
    }
  }
  return 0;
}
