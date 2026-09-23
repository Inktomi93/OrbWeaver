// Policy: caught-failure-ownership-health — the committed caught-failure census and the tree must name the
// SAME sites. It joins `caught-failure-ownership.population.json` (beside this file) to the live sites on
// `siteId`, in both directions: a committed `siteId` whose site is gone is a finding NAMED BY THAT ID, and a
// live site the census never recorded is a finding at the site. Neither is ever a silent drop.
//
// ── WHY A SIBLING, AND WHY HARD ─────────────────────────────────────────────────────────────────────────
// `caught-failure-ownership` is a per-file, `ordinary` occurrence policy: its verdict on one file is complete
// from that file, and every finding has a waiver door. A join against a whole-corpus record is neither — a
// `gone` row is only knowable over the ENTIRE population (a narrowed run would read every unseen file's rows
// as gone), and a stale record has no legitimate waiver. §12.1 splits a module on authority, so the join is
// its own `hard`, `entire-population` policy on the same family and the same shared reader.
//
// ── WHY THE JOIN IS COORDINATE-FREE (work item 0009) ────────────────────────────────────────────────────
// The committed row is `{ siteId, verdict, reason }`. A line inserted above a site moves no id, so this
// policy stays green through every such edit — which is the whole point of keying on `siteId` rather than
// on the `line`/`markerLine` the file used to carry (it was touched by about one commit in eleven for that
// alone). The site identity is `lib/caught-failure.ts#keyCaughtFailureSites`, the same function the census
// generator keys with, so the two can never spell an id differently.
//
// ── WHAT THIS POLICY DOES NOT JUDGE ─────────────────────────────────────────────────────────────────────
// The VERDICT and REASON columns. Whether a marker waives a site is the central ordinary-waiver engine's
// answer, which a policy context deliberately cannot run; `ledgers:fresh` re-derives the whole census with
// that engine and reds on a changed verdict or reason. This policy owns membership only.
import { SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { JSON_RESOURCE_PATHS } from "../contract/resource-json.ts";
import type { CaughtFailureSite } from "../lib/caught-failure.ts";
import { CAUGHT_FAILURE_POPULATION, catchClauseSite, keyCaughtFailureSites, promiseAbsorberSite } from "../lib/caught-failure.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const POPULATION_PATH = JSON_RESOURCE_PATHS["caught-failure-population"];
const REGEN = "pnpm exec node tooling/src/verify/cli.ts baseline caught-failure-population";

const MESSAGE = `the committed caught-failure census (${POPULATION_PATH}) and the tree disagree about which sites exist. The census is keyed by \`siteId\` (path::position::ordinal), and every committed id must name a live site and every live site must have a row. (tooling/src/verify/ops/gen/caught-failure-population.ts)`;

const FIX = `regenerate the census (\`${REGEN}\`) and commit it, or hand-edit only your own row: a new site gets \`{ "siteId", "verdict", "reason" }\`, a removed site's row is deleted. A line inserted above a site never needs either.`;

const GONE = (siteId: string): string =>
  `census row \`${siteId}\` names a site that is no longer on the tree. Delete the row, or regenerate the census (\`${REGEN}\`).`;
const UNRECORDED = (siteId: string): string =>
  `caught-failure site \`${siteId}\` has no census row. Regenerate the census (\`${REGEN}\`), or add its \`{ "siteId", "verdict", "reason" }\` row.`;
const UNKEYABLE =
  "this caught-failure site has no derivable waiver position, so it has no `siteId` and the census cannot record it. Extend the anchor fallback in tooling/src/verify/lib/caught-failure.ts rather than inventing a key.";
const NOT_A_POPULATION = (reason: string): string =>
  `${POPULATION_PATH} is not a caught-failure census: ${reason}. Regenerate it (\`${REGEN}\`); nothing can be joined against a file whose rows cannot be read.`;
const DERIVED_NOTHING =
  "the census has no rows and this run found no caught-failure site anywhere in the population, so the join agreed about nothing. An empty census over a non-empty corpus is a blind classifier or a broken population, never a clean tree. (tooling/src/verify/lib/caught-failure.ts)";

type CensusRead = { readonly ok: true; readonly siteIds: readonly string[] } | { readonly ok: false; readonly reason: string };

/** The committed ids, or why the file is not a census. Only `rows[].siteId` is read: the verdict and reason
 *  are `ledgers:fresh`'s to judge (header). */
function censusSiteIds(value: JsonValue): CensusRead {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "the top level is not an object" };
  }
  const rows = (value as { readonly [key: string]: JsonValue })["rows"];
  if (!Array.isArray(rows)) {
    return { ok: false, reason: "it has no `rows` array" };
  }
  const siteIds: string[] = [];
  for (const [index, row] of rows.entries()) {
    const siteId = typeof row === "object" && row !== null && !Array.isArray(row) ? (row as { readonly [key: string]: JsonValue })["siteId"] : undefined;
    if (typeof siteId !== "string" || siteId.length === 0) {
      return { ok: false, reason: `row ${index} has no \`siteId\` string` };
    }
    siteIds.push(siteId);
  }
  return { ok: true, siteIds };
}

/** Every live site by its id. A site with no derivable anchor has no id; it is reported, never keyed on an
 *  invented one. */
function liveSites(ctx: GatePolicyContext, sitesByPath: ReadonlyMap<string, readonly CaughtFailureSite[]>): ReadonlyMap<string, CaughtFailureSite> {
  const live = new Map<string, CaughtFailureSite>();
  for (const [path, sites] of sitesByPath) {
    for (const { site, siteId } of keyCaughtFailureSites(path, sites)) {
      if (siteId === undefined) {
        ctx.report.node(site.node, { message: UNKEYABLE });
      } else {
        live.set(siteId, site);
      }
    }
  }
  return live;
}

/** The two-sided join on `siteId`. */
function join(ctx: GatePolicyContext, committedIds: readonly string[], live: ReadonlyMap<string, CaughtFailureSite>): void {
  if (live.size === 0 && committedIds.length === 0) {
    ctx.report.file(POPULATION_PATH, { line: 1, message: DERIVED_NOTHING });
    return;
  }
  const committed = new Set(committedIds);
  for (const siteId of committed) {
    if (!live.has(siteId)) {
      ctx.report.file(POPULATION_PATH, { line: 1, message: GONE(siteId) });
    }
  }
  for (const [siteId, site] of live) {
    if (!committed.has(siteId)) {
      ctx.report.node(site.node, { message: UNRECORDED(siteId) });
    }
  }
}

// ── self-proof substrate ────────────────────────────────────────────────────────────────────────────
const SITE_PATH = "packages/server/src/domain/probe/absorb.ts";
const SITE_ID = `${SITE_PATH}::catch::1`;
const SITE = "export function absorb(): void {\n  try { risky(); } catch {}\n}\n";
const ANCHOR = { "packages/server/src/domain/probe/clean.ts": "export const CLEAN = 1;\n" };
const census = (...siteIds: readonly string[]): Readonly<Record<string, string>> => ({
  [POPULATION_PATH]: `${JSON.stringify({ rows: siteIds.map((siteId) => ({ siteId, verdict: "unproven", reason: null })) }, null, 2)}\n`,
});

export const gate = defineGate({
  id: "caught-failure-ownership-health",
  family: "caught-failure-ownership",
  authority: "hard",
  severity: "error",
  population: CAUGHT_FAILURE_POPULATION,
  // `resource`, not `types`: the census is a declared JSON resource, which only resource analysis may read.
  // The checker is still available to the shared classifier through the context.
  analysis: "resource",
  // A `gone` row is only knowable over the whole corpus; a narrowed request must defer, never read every
  // unseen file's rows as vanished.
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "json", id: "caught-failure-population" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const sitesByPath = new Map<string, CaughtFailureSite[]>();
    const collect = (path: string, site: CaughtFailureSite | undefined): void => {
      if (site !== undefined) {
        sitesByPath.set(path, [...(sitesByPath.get(path) ?? []), site]);
      }
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CatchClause],
          visit: (node, sourceFile) => collect(ctx.relativePath(sourceFile), catchClauseSite(node.asKindOrThrow(SyntaxKind.CatchClause))),
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => collect(ctx.relativePath(sourceFile), promiseAbsorberSite(node.asKindOrThrow(SyntaxKind.CallExpression))),
        },
      ],
      evaluate: () => {
        const read = censusSiteIds(readyResourceValue(ctx.resources.json("caught-failure-population")).value);
        if (read.ok) {
          join(ctx, read.siteIds, liveSites(ctx, sitesByPath));
        } else {
          ctx.report.file(POPULATION_PATH, { line: 1, message: NOT_A_POPULATION(read.reason) });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: { ...census(SITE_ID), ...ANCHOR },
      expect: { count: 1, messageIncludes: `census row \`${SITE_ID}\` names a site that is no longer on the tree` },
      why: "THE FOUNDING CASE, and the direction the census used to lose silently: the site was deleted and its row stayed. The finding is NAMED BY THE ID, because the committed row carries no coordinate to cite; the clean in-population file is the anchor that keeps the fixture a finding rather than an empty-population refusal",
    },
    {
      mode: "resource",
      files: { ...census(), [SITE_PATH]: SITE },
      expect: { count: 1, messageIncludes: `caught-failure site \`${SITE_ID}\` has no census row` },
      why: "THE OTHER DIRECTION: a live site the census never recorded. Without it the join is one-sided and a new absorber would enter the tree with no review row at all",
    },
    {
      mode: "resource",
      files: { ...census(SITE_ID), [SITE_PATH]: "export function absorb(): void {\n  try { risky(); } catch {}\n  try { risky(); } catch {}\n}\n" },
      expect: { count: 1, messageIncludes: `\`${SITE_PATH}::catch::2\` has no census row` },
      why: "MULTIPLICITY is part of the identity: a second bindingless catch in the same file is `::catch::2`, not a duplicate of the recorded `::catch::1`. A join on (path, position) alone would call this tree agreeing",
    },
    {
      mode: "resource",
      files: { [POPULATION_PATH]: '{ "gate": "caught-failure-ownership" }\n', [SITE_PATH]: SITE },
      expect: { count: 1, messageIncludes: "is not a caught-failure census: it has no `rows` array" },
      why: "a file that is valid JSON and not a census (no `rows`) would otherwise read as zero committed ids and report every live site as unrecorded — the refusal names the file instead",
    },
    {
      mode: "resource",
      files: { ...census(), ...ANCHOR },
      expect: { count: 1, messageIncludes: "the join agreed about nothing" },
      why: "BLINDNESS: an empty census over a corpus where the classifier found nothing would agree forever. The in-population anchor is what makes this a finding rather than a population refusal",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...census(SITE_ID), [SITE_PATH]: SITE },
      why: "the agreeing state: one live site, one row, the same id",
    },
    {
      mode: "resource",
      files: { ...census(SITE_ID), [SITE_PATH]: `// a line inserted above the site\n\n${SITE}` },
      why: "WORK ITEM 0009's DONE BAR: the same census over the same site after lines were inserted above it stays green. The row carries no coordinate, so there is nothing for the move to stale",
    },
    {
      mode: "resource",
      files: {
        ...census(SITE_ID),
        [SITE_PATH]: SITE,
        "packages/server/src/domain/probe/owned.ts": "export function owned(): void {\n  try { risky(); } catch (err) { throw err; }\n}\n",
      },
      why: "an OWNED catch is not a site, so it owes no row: the join counts exactly what the classifier counts, and a rethrowing catch beside a recorded site leaves the census agreeing",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { [SITE_PATH]: SITE },
      expect: { messageIncludes: "json:caught-failure-population" },
      why: "a MISSING census withholds the verdict rather than reading as zero committed ids: an absent file and an empty one are different answers, and treating absence as `rows: []` would report every live site as unrecorded against a file that was never read",
    },
  ],
});
