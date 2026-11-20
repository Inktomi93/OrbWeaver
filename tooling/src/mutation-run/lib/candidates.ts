// The rule that drew the target list from `pnpm hotspots`, so `--candidates` can say what the list lacks and what no
// longer ranks. It prints; the owner edits ./targets.ts.
//
// Each sort ranks the first CANDIDATE_DEPTH files under `packages/`. A logic file that appears in at least
// CANDIDATE_MIN_SORTS rankings is a candidate, ordered by the sum of its positions, a sort that misses it counting as one
// past the end. Positions are read from the full ranking, before the logic-file filter, as the hotspot tool prints them.

export const CANDIDATE_SORTS = ["defect", "hot", "fix", "recent", "ratio", "churn"] as const;
export type CandidateSort = (typeof CANDIDATE_SORTS)[number];
export const CANDIDATE_DEPTH = 150;
export const CANDIDATE_PATH = "packages/";
const CANDIDATE_MIN_SORTS = 3;

// A `.tsx` file is out because only a component test reaches it, and the run executes Vitest alone; a file outside a
// package's `src/` is out because the runner refuses it.
const MUTABLE_SOURCE = /^packages\/[^/]+\/src\/.+\.ts$/u;
// Text no test may pin, and barrels.
const TEXT_OR_BARREL_FILE = /(?:^|[/-])(?:variants|copy|names|labels|index)\.ts$/u;
const WIRING_DIRS = ["/entry/compose/", "/contract/", "/migrations/"] as const;
const CONTRACTS_PACKAGE = "packages/contracts/";

/** A hotspot row as `pnpm hotspots --json` prints it; only the path is read here. */
export interface HotspotRow {
  readonly path: string;
}

export function isLogicFile(path: string): boolean {
  return MUTABLE_SOURCE.test(path) && !TEXT_OR_BARREL_FILE.test(path) && !WIRING_DIRS.some((dir) => path.includes(dir)) && !path.startsWith(CONTRACTS_PACKAGE);
}

export interface RankedFile {
  readonly path: string;
  readonly rank: number;
  readonly sorts: number;
}

/** Every candidate, best first. */
export function rankCandidates(rankings: Readonly<Record<CandidateSort, readonly HotspotRow[]>>): readonly RankedFile[] {
  const positions = new Map<string, number[]>();
  for (const sort of CANDIDATE_SORTS) {
    rankings[sort].slice(0, CANDIDATE_DEPTH).forEach(({ path }, index) => {
      positions.set(path, [...(positions.get(path) ?? []), index + 1]);
    });
  }
  const missed = CANDIDATE_DEPTH + 1;
  return [...positions]
    .filter(([path, found]) => isLogicFile(path) && found.length >= CANDIDATE_MIN_SORTS)
    .map(([path, found]) => ({
      path,
      sorts: found.length,
      rank: found.reduce((sum, position) => sum + position, 0) + missed * (CANDIDATE_SORTS.length - found.length),
    }))
    .toSorted((a, b) => a.rank - b.rank || a.path.localeCompare(b.path));
}

export interface CandidateReport {
  /** Candidates the list lacks that outrank its lowest-ranked target, or the list's own length of them when no target ranks. */
  readonly missing: readonly RankedFile[];
  /** Listed targets that are no longer candidates. */
  readonly unranked: readonly string[];
}

export function compareCandidates(ranked: readonly RankedFile[], listed: readonly string[]): CandidateReport {
  const onList = new Set(listed);
  const lowest = ranked.findLastIndex(({ path }) => onList.has(path));
  const reach = lowest === -1 ? listed.length : lowest + 1;
  const rankedPaths = new Set(ranked.map(({ path }) => path));
  return {
    missing: ranked.slice(0, reach).filter(({ path }) => !onList.has(path)),
    unranked: listed.filter((path) => !rankedPaths.has(path)),
  };
}
