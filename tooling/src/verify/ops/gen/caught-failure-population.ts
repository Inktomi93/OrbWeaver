// Generator for tooling/src/verify/gates/caught-failure-ownership.population.json — the durable, LOSSLESS
// census of every caught-failure site the `caught-failure-ownership` policy finds, with the ownership verdict
// each one currently resolves to. It is a REVIEW RECORD, not a ratchet: it suppresses nothing and there is no
// budget to hide behind (issue #751 — the owner banned any bulk allowlist/baseline here). Every field is
// DERIVED (#569 — a derived classification beats a declared one), so no hand edit can mint a verdict the tree
// does not earn: `ledgers:fresh` reds the day the committed file and a fresh derivation disagree in EITHER
// direction, and `caught-failure-ownership-health` reds on a `siteId` the tree and the file do not share.
//
// ── THE COMMITTED ROW IS THE JUDGMENT; THE COORDINATES ARE READ-TIME (work item 0009) ─────────────────────
// `deriveCaughtFailureSites` is the live read: every site with its line, column, snippet and marker line.
// `deriveCaughtFailurePopulation` projects it onto what is committed — `siteId`, `verdict`, `reason` — so an
// insertion above a site changes nothing on disk. A consumer that needs a coordinate derives it here, from
// the tree, never from the file.
//
// ── ONE PRODUCER, AND NO PARSER OF ITS OWN (#1584) ───────────────────────────────────────────────────────
// The SITES come from the shared classifier `lib/caught-failure.ts` — the same `catchClauseSite` /
// `promiseAbsorberSite` the policy reports from, and the same `keyCaughtFailureSites` identity the health
// policy joins on, so the artifact and the policies can never disagree about what a site is. The WAIVER
// verdict comes from the CENTRAL ordinary-waiver engine (`lib/ordinary-waiver.ts`) run over the same sources:
// this file does not parse a marker, does not own a grammar, and cannot honour one the production engine
// would refuse. It only lifts the REASON text out of a marker the engine already accepted as well-formed.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { SourceFile } from "ts-morph";
import type { CaughtFailureArm, CaughtFailurePopulation, CaughtFailureRow, CaughtFailureVerdict } from "../../contract/caught-failure.ts";
import { CAUGHT_FAILURE_ARMS } from "../../contract/caught-failure.ts";
import type { CoordinatedGateFinding } from "../../contract/gate-authority.ts";
import type { OrdinaryWaiverSource } from "../../contract/ordinary-waiver-source.ts";
import { JSON_RESOURCE_PATHS } from "../../contract/resource-json.ts";
import { gate } from "../../gates/caught-failure-ownership.ts";
import { caughtFailureReviewSites } from "../../lib/caught-failure.ts";
import { keyCaughtFailureSites } from "../../lib/caught-failure-identity.ts";
import { createOrdinaryWaiverEngine } from "../../lib/ordinary-waiver.ts";
import { compilePopulation } from "../../lib/population-resolver.ts";
// NOT `harness.ts`'s `getProject` — MEASURED 2026-08-28: its fileset is deliberately narrower than
// `harnessGlobs` and EXCLUDES `tooling/src/**`, which this gate scans. Deriving the census from it reported
// 329 sites where the real run finds 448, and the undercount reads exactly like a smaller population. The
// artifact must walk the SAME fileset the gate run walks, or it is a census of a different tree.
import { projectCtx } from "../../lib/project-context.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline caught-failure-population");

export const POPULATION_REL = JSON_RESOURCE_PATHS["caught-failure-population"];

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

interface DerivedSite {
  readonly siteId: string;
  readonly path: string;
  readonly arm: CaughtFailureArm;
  readonly position: string;
  readonly ordinal: number;
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
}

/** Every site in one file, keyed and already carrying the EXACT coordinates and token the policy reports —
 *  which is also the position a `@orb-waive` marker must name. A site whose anchor is underivable REFUSES
 *  loudly: a census row naming no position would read exactly like a waivable site that nobody waived. */
function derivedSites(sf: SourceFile, path: string): readonly DerivedSite[] {
  const lines = sf.getFullText().split(/\r?\n/u);
  return keyCaughtFailureSites(path, caughtFailureReviewSites(sf)).map(({ site, siteId, ordinal }) => {
    if (site.anchor === undefined || siteId === undefined) {
      throw new Error(
        `caught-failure-population: the site at ${path}:${site.node.getStartLineNumber()} has no derivable waiver position. ` +
          "The census cannot record a position the classifier did not produce — extend the anchor fallback in " +
          "tooling/src/verify/lib/caught-failure.ts rather than recording a null.",
      );
    }
    const { line, column } = sf.getLineAndColumnAtPos(site.node.getStart() + site.anchor.offset);
    return { siteId, path, arm: site.arm, position: site.anchor.token, ordinal, line, column, snippet: (lines[line - 1] ?? "").trim() };
  });
}

/** A `//` continuation line and its body. */
const LINE_COMMENT = /^\s*\/\/(.*)$/u;
/** A comment body that starts something else — another marker or a tool directive — ends the reason. */
const REASON_STOP = /^(?:@|biome-ignore|eslint-|prettier-ignore)/u;
/** Terminal punctuation, then any closing quote, bracket or backtick. */
const SENTENCE_END = /[.!?]["'`)\]]*$/u;
/** The end condition every reason carries by house convention — the grammar does not require it; 531 of the
 *  533 live clauses spell `Ends if`, the other two `Ends when`. */
const END_CLAUSE = /\bEnds (?:if|when)\b/u;

/** The wrapped continuation of a `//` marker's reason: the consecutive non-empty `//` lines after it, up to a
 *  blank comment line, a stop word, code — or the moment the captured reason is COMPLETE, i.e. it already
 *  holds its end condition and ends a sentence. Measured 2026-09-23 over the real tree (217 markers wrap):
 *  a bare sentence-end rule truncated 16 real reasons whose "Ends if" clause sits on a later line; requiring the
 *  end clause first keeps all 215 wraps and stops exactly the two markers in
 *  `create-autosave-entity-form.tsx` whose complete reason was followed by a separate ordinary comment. A
 *  reason with no end clause at all keeps the plain line rules. */
function continuation(lines: readonly string[], markerLine: number, head: string): readonly string[] {
  const parts: string[] = [];
  let captured = head;
  for (const line of lines.slice(markerLine)) {
    const body = LINE_COMMENT.exec(line)?.[1]?.trim();
    const complete = END_CLAUSE.test(captured) && SENTENCE_END.test(captured);
    if (complete || body === undefined || body.length === 0 || REASON_STOP.test(body)) {
      break;
    }
    parts.push(body);
    captured = `${captured} ${body}`;
  }
  return parts;
}

/** The reason text out of a marker the ENGINE already validated, WHOLE. `waiverId` is
 *  `<path>:<line>:<column>` of the marker comment, and the grammar puts the reason after the first `):` on
 *  that line. The engine reads only that line, but authors wrap a long reason onto following `//` lines, and
 *  the census promises the full reason verbatim ({@link continuation} owns where a wrap ends). Before this the
 *  census recorded "documented — the caller (liftString) turns" and dropped the rest. */
function waiverReason(sf: SourceFile, markerLine: number): string {
  const lines = sf.getFullText().split(/\r?\n/u);
  const first = lines[markerLine - 1] ?? "";
  const at = first.indexOf("):");
  const head =
    at === -1
      ? ""
      : first
          .slice(at + 2)
          .replace(/\*\/\s*$/u, "")
          .trim();
  // A block-comment marker closes on its own line; only a `//` marker can wrap onto continuation lines.
  const parts = [head, ...(LINE_COMMENT.test(first) ? continuation(lines, markerLine, head) : [])];
  const reason = parts.join(" ").trim();
  if (parts[0]?.length === 0 || reason.length === 0) {
    throw new Error(
      `caught-failure-population: the central waiver engine honoured a marker at line ${markerLine} whose reason this reader ` +
        "could not lift. The census cannot record a reason it did not read — re-derive the read in " +
        "tooling/src/verify/ops/gen/caught-failure-population.ts.",
    );
  }
  return reason;
}

/** Every live site with its coordinates, read from the tree NOW — the read-time half of the census. */
export function deriveCaughtFailureSites(root: string): readonly CaughtFailureRow[] {
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

  return sites
    .map((site, index): CaughtFailureRow => {
      const waiverId = match.waiverIds[index] ?? null;
      const markerLine = waiverId === null ? null : Number(waiverId.split(":").at(-2));
      return {
        siteId: site.siteId,
        verdict: markerLine === null ? "unproven" : "deliberate-absorb",
        reason: markerLine === null ? null : waiverReason(byPath.get(site.path) as SourceFile, markerLine),
        path: site.path,
        line: site.line,
        column: site.column,
        grammar: site.arm,
        position: site.position,
        ordinal: site.ordinal,
        snippet: site.snippet,
        markerLine,
      };
    })
    .toSorted((a, b) => a.siteId.localeCompare(b.siteId));
}

/** The committed census: the live sites projected onto their judgments, plus the totals. No coordinate is
 *  written, so it is stable under every line move that keeps each site's `siteId`. */
export function deriveCaughtFailurePopulation(root: string): CaughtFailurePopulation {
  const sites = deriveCaughtFailureSites(root);
  const byVerdict: Record<CaughtFailureVerdict, number> = { "deliberate-absorb": 0, unproven: 0 };
  // Seeded from the homed arm tuple: an arm that produces ZERO rows must still appear with a 0, or the
  // census silently loses a detector arm instead of showing it went quiet.
  const byGrammar: Record<string, number> = Object.fromEntries(CAUGHT_FAILURE_ARMS.map((arm) => [arm, 0]));
  for (const site of sites) {
    byVerdict[site.verdict] += 1;
    byGrammar[site.grammar] = (byGrammar[site.grammar] ?? 0) + 1;
  }
  return {
    gate: gate.id,
    generatedBy: "tooling/src/verify/ops/gen/caught-failure-population.ts",
    totals: { sites: sites.length, reported: byVerdict.unproven, byVerdict, byGrammar },
    rows: sites.map(({ siteId, verdict, reason }) => ({ siteId, verdict, reason })),
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
