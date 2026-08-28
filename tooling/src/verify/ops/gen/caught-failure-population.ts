// Generator for docs/reviews/caught-failure-ownership/population.json — the durable, LOSSLESS census of
// every caught-failure site the `caught-failure-ownership` detector finds, with the ownership verdict each
// one currently resolves to. It is a REVIEW RECORD, not a ratchet: no gate reads it, it suppresses nothing,
// and there is no budget to hide behind (issue #751 — the owner banned any bulk allowlist/baseline here).
// Every field is DERIVED (#569 — a derived classification beats a declared one), so no hand edit can mint a
// verdict the tree does not earn, and `tests/tooling/verify/gates/caught-failure-ownership.test.ts` reds the
// day the committed file and a fresh derivation disagree in EITHER direction.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { caughtFailureReviewSites, gate } from "../../gates/caught-failure-ownership.ts";
import { findGateIgnore, parseGateIgnoreMarker } from "../../lib/gate-ignore.ts";
// NOT `harness.ts`'s `getProject` — MEASURED 2026-08-28: its fileset is deliberately narrower than
// `harnessGlobs` and EXCLUDES `tooling/src/**`, which this gate scans. Deriving the census from it reported
// 329 sites where the real run finds 448, and the undercount reads exactly like a smaller population. The
// artifact must walk the SAME fileset the gate run walks, or it is a census of a different tree.
import { projectCtx } from "../../lib/pass.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline caught-failure-population");

export const POPULATION_REL = "docs/reviews/caught-failure-ownership/population.json";

/** How a site's failure is owned TODAY. A partition, derived every run — never a stored opinion. */
export type CaughtFailureVerdict = "deliberate-absorb" | "detached-owned" | "unproven";

export interface CaughtFailureRow {
  /** Stable across line moves: path + reported position + the nth occurrence of that pair in the file. */
  readonly siteId: string;
  readonly path: string;
  readonly line: number;
  readonly column: number;
  /** `promise` | `empty` | `default` — the detector arm. */
  readonly grammar: string;
  /** The exact token the finding reports and a marker must name. */
  readonly position: string;
  /** Multiplicity: the 1-based occurrence of (path, position) in file order. */
  readonly ordinal: number;
  readonly snippet: string;
  readonly verdict: CaughtFailureVerdict;
  /** The FULL adjacent reason, verbatim — null for `unproven`, and for `detached-owned` (whose reason lives
   *  in its `@swallowed-ok` marker, two-sided by `detached-work-traced`). */
  readonly reason: string | null;
  readonly markerLine: number | null;
}

export interface CaughtFailurePopulation {
  readonly gate: string;
  readonly generatedBy: string;
  readonly totals: {
    readonly sites: number;
    readonly enforced: number;
    readonly reported: number;
    readonly byVerdict: Readonly<Record<CaughtFailureVerdict, number>>;
    readonly byGrammar: Readonly<Record<string, number>>;
  };
  readonly rows: readonly CaughtFailureRow[];
}

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** The verdict + its receipt. `enforced: false` means a live positioned `@swallowed-ok` (or a framework
 *  owner) already proves the site; otherwise a live caught-failure marker is the deliberate absorb, and
 *  anything left is UNPROVEN — the population this program exists to drive to zero. */
function judge(
  node: Parameters<typeof findGateIgnore>[0],
  position: string,
  enforced: boolean,
  lines: readonly string[],
): {
  readonly verdict: CaughtFailureVerdict;
  readonly reason: string | null;
  readonly markerLine: number | null;
} {
  if (!enforced) {
    return { verdict: "detached-owned", reason: null, markerLine: null };
  }
  const markerLine = findGateIgnore(node, gate.name, position);
  if (markerLine === undefined) {
    return { verdict: "unproven", reason: null, markerLine: null };
  }
  // `parseGateIgnoreMarker` is ANCHORED at `^//` (the mention fence) and the suppressor feeds it the COMMENT
  // node's own text; a source LINE carries the indentation in front of it, so an un-trimmed line parses as
  // "not a marker" and the reason comes back empty. That is the reader failing, never a reasonless marker —
  // `findGateIgnore` only returns a line it already matched a WELL-FORMED marker on, so REFUSE rather than
  // record a null and let the census read as a bare exemption.
  const marker = parseGateIgnoreMarker((lines[markerLine - 1] ?? "").trimStart());
  if (marker === undefined || marker.reason.length === 0) {
    throw new Error(
      `caught-failure-population: the suppressor honoured a marker at line ${markerLine} that this reader could not parse — ` +
        "the census cannot record a reason it did not read. Re-derive the marker read in " +
        "tooling/src/verify/ops/gen/caught-failure-population.ts.",
    );
  }
  return { verdict: "deliberate-absorb", reason: marker.reason, markerLine };
}

/** Re-derive the whole census from the tree. ONE producer — the same `caughtFailureReviewSites` the gate
 *  reports from — so the artifact and the gate can never disagree about what a site is. */
export function deriveCaughtFailurePopulation(root: string): CaughtFailurePopulation {
  const rows: CaughtFailureRow[] = [];
  for (const sf of projectCtx(root).files) {
    const path = relPath(root, sf.getFilePath());
    if (gate.scanRoot !== undefined && !gate.scanRoot(path)) {
      continue;
    }
    const sites = caughtFailureReviewSites(sf);
    if (sites.length === 0) {
      continue;
    }
    const lines = sf.getFullText().split(/\r?\n/u);
    const ordinals = new Map<string, number>();
    for (const site of sites) {
      const ordinal = (ordinals.get(site.position) ?? 0) + 1;
      ordinals.set(site.position, ordinal);
      const verdict = judge(site.node, site.position, site.enforced, lines);
      rows.push({
        siteId: `${path}::${site.position}::${ordinal}`,
        path,
        line: site.node.getStartLineNumber(),
        column: site.node.getStart() - site.node.getStartLinePos() + 1,
        grammar: site.position.split(":")[0] ?? "",
        position: site.position,
        ordinal,
        snippet: (lines[site.node.getStartLineNumber() - 1] ?? "").trim(),
        ...verdict,
      });
    }
  }
  rows.sort((a, b) => a.siteId.localeCompare(b.siteId));
  const byVerdict: Record<CaughtFailureVerdict, number> = { "deliberate-absorb": 0, "detached-owned": 0, unproven: 0 };
  const byGrammar: Record<string, number> = {};
  for (const row of rows) {
    byVerdict[row.verdict] += 1;
    byGrammar[row.grammar] = (byGrammar[row.grammar] ?? 0) + 1;
  }
  return {
    gate: gate.name,
    generatedBy: "tooling/src/verify/ops/gen/caught-failure-population.ts",
    totals: {
      sites: rows.length,
      enforced: rows.length - byVerdict["detached-owned"],
      reported: byVerdict.unproven,
      byVerdict,
      byGrammar,
    },
    rows,
  };
}

/** The `baseline caught-failure-population` verb — the SINGLE writer of the committed census. */
export function generateCaughtFailurePopulation(root: string): number {
  const population = deriveCaughtFailurePopulation(root);
  const target = join(root, POPULATION_REL);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(population, null, 2)}\n`);
  const { sites, reported } = population.totals;
  process.stdout.write(`wrote ${sites} sites (${reported} unproven) → ${POPULATION_REL}\n`);
  return EXIT.clean;
}
