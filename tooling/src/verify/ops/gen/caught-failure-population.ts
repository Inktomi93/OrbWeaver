// Generator for docs/reviews/caught-failure-ownership/population.json — the durable, LOSSLESS census of
// every caught-failure site the `caught-failure-ownership` policy finds, with the ownership verdict each
// one currently resolves to. It is a REVIEW RECORD, not a ratchet: no gate reads it, it suppresses nothing,
// and there is no budget to hide behind (issue #751 — the owner banned any bulk allowlist/baseline here).
// Every field is DERIVED (#569 — a derived classification beats a declared one), so no hand edit can mint a
// verdict the tree does not earn, and `tests/tooling/verify/gates/caught-failure-ownership.test.ts` reds the
// day the committed file and a fresh derivation disagree in EITHER direction.
//
// ── TWO READERS, ONE PRODUCER, AND NEITHER OWNS A PARSER (#1584) ─────────────────────────────────────────
// The SITES come from the shared classifier `lib/caught-failure.ts` — the same `catchClauseSite` /
// `promiseAbsorberSite` the policy reports from, so the artifact and the policy can never disagree about
// what a site is. The WAIVER verdict comes from the CENTRAL ordinary-waiver engine
// (`lib/ordinary-waiver.ts`) run over the same sources: this file does not parse a marker, does not own a
// grammar, and cannot honour one the production engine would refuse. It only lifts the REASON text out of
// a marker the engine already accepted as well-formed.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { SourceFile } from "ts-morph";
import type { CaughtFailurePopulation, CaughtFailureRow, CaughtFailureVerdict } from "../../contract/caught-failure.ts";
import { CAUGHT_FAILURE_ARMS } from "../../contract/caught-failure.ts";
import type { CoordinatedGateFinding } from "../../contract/gate-authority.ts";
import type { OrdinaryWaiverSource } from "../../contract/ordinary-waiver-source.ts";
import { gate } from "../../gates/caught-failure-ownership.ts";
import { caughtFailureReviewSites } from "../../lib/caught-failure.ts";
import { createOrdinaryWaiverEngine } from "../../lib/ordinary-waiver.ts";
import { compilePopulation } from "../../lib/population-resolver.ts";
// NOT `harness.ts`'s `getProject` — MEASURED 2026-08-28: its fileset is deliberately narrower than
// `harnessGlobs` and EXCLUDES `tooling/src/**`, which this gate scans. Deriving the census from it reported
// 329 sites where the real run finds 448, and the undercount reads exactly like a smaller population. The
// artifact must walk the SAME fileset the gate run walks, or it is a census of a different tree.
import { projectCtx } from "../../lib/project-context.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline caught-failure-population");

export const POPULATION_REL = "docs/reviews/caught-failure-ownership/population.json";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

interface DerivedSite {
  readonly path: string;
  readonly arm: string;
  readonly position: string;
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
}

/** Every site in one file, already carrying the EXACT coordinates and token the policy reports — which is
 *  also the position a `@orb-waive` marker must name. A site whose anchor is underivable REFUSES loudly: a
 *  census row naming no position would read exactly like a waivable site that nobody waived. */
function derivedSites(sf: SourceFile, path: string): readonly DerivedSite[] {
  const lines = sf.getFullText().split(/\r?\n/u);
  return caughtFailureReviewSites(sf).map((site) => {
    if (site.anchor === undefined) {
      throw new Error(
        `caught-failure-population: the site at ${path}:${site.node.getStartLineNumber()} has no derivable waiver position. ` +
          "The census cannot record a position the classifier did not produce — extend the anchor fallback in " +
          "tooling/src/verify/lib/caught-failure.ts rather than recording a null.",
      );
    }
    const { line, column } = sf.getLineAndColumnAtPos(site.node.getStart() + site.anchor.offset);
    return { path, arm: site.arm, position: site.anchor.token, line, column, snippet: (lines[line - 1] ?? "").trim() };
  });
}

/** The reason text out of a marker the ENGINE already validated. `waiverId` is `<path>:<line>:<column>` of
 *  the marker comment, and the grammar puts the reason after the first `):` on that line. */
function waiverReason(sf: SourceFile, markerLine: number): string {
  const line = sf.getFullText().split(/\r?\n/u)[markerLine - 1] ?? "";
  const at = line.indexOf("):");
  const reason =
    at === -1
      ? ""
      : line
          .slice(at + 2)
          .replace(/\*\/\s*$/u, "")
          .trim();
  if (reason.length === 0) {
    throw new Error(
      `caught-failure-population: the central waiver engine honoured a marker at line ${markerLine} whose reason this reader ` +
        "could not lift. The census cannot record a reason it did not read — re-derive the read in " +
        "tooling/src/verify/ops/gen/caught-failure-population.ts.",
    );
  }
  return reason;
}

/** Re-derive the whole census from the tree. */
export function deriveCaughtFailurePopulation(root: string): CaughtFailurePopulation {
  const includes = compilePopulation(gate.population);
  const files = projectCtx(root)
    .files.map((sf) => ({ sf, path: relPath(root, sf.getFilePath()) }))
    .filter(({ path }) => includes(path))
    .toSorted((left, right) => left.path.localeCompare(right.path));
  const sources: OrdinaryWaiverSource[] = files.map(({ sf, path }) => ({ kind: "typescript", path, sourceFile: sf }));
  const byPath = new Map(files.map(({ sf, path }) => [path, sf]));
  const sites = files.flatMap(({ sf, path }) => derivedSites(sf, path));
  const findings: CoordinatedGateFinding[] = sites.map((site) => ({
    file: site.path,
    line: site.line,
    column: site.column,
    token: site.position,
    policyId: gate.id,
    severity: gate.severity,
  }));
  const match = createOrdinaryWaiverEngine({ sources, knownPolicies: [{ id: gate.id, authority: gate.authority, severity: gate.severity }] }).match(findings);

  const rows: CaughtFailureRow[] = [];
  const ordinals = new Map<string, number>();
  for (const [index, site] of sites.entries()) {
    const key = `${site.path}::${site.position}`;
    const ordinal = (ordinals.get(key) ?? 0) + 1;
    ordinals.set(key, ordinal);
    const waiverId = match.waiverIds[index] ?? null;
    const markerLine = waiverId === null ? null : Number(waiverId.split(":").at(-2));
    const verdict: CaughtFailureVerdict = markerLine === null ? "unproven" : "deliberate-absorb";
    rows.push({
      siteId: `${key}::${ordinal}`,
      path: site.path,
      line: site.line,
      column: site.column,
      grammar: site.arm,
      position: site.position,
      ordinal,
      snippet: site.snippet,
      verdict,
      reason: markerLine === null ? null : waiverReason(byPath.get(site.path) as SourceFile, markerLine),
      markerLine,
    });
  }
  rows.sort((a, b) => a.siteId.localeCompare(b.siteId));
  const byVerdict: Record<CaughtFailureVerdict, number> = { "deliberate-absorb": 0, unproven: 0 };
  // Seeded from the homed arm tuple: an arm that produces ZERO rows must still appear with a 0, or the
  // census silently loses a detector arm instead of showing it went quiet.
  const byGrammar: Record<string, number> = Object.fromEntries(CAUGHT_FAILURE_ARMS.map((arm) => [arm, 0]));
  for (const row of rows) {
    byVerdict[row.verdict] += 1;
    byGrammar[row.grammar] = (byGrammar[row.grammar] ?? 0) + 1;
  }
  return {
    gate: gate.id,
    generatedBy: "tooling/src/verify/ops/gen/caught-failure-population.ts",
    totals: { sites: rows.length, reported: byVerdict.unproven, byVerdict, byGrammar },
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
