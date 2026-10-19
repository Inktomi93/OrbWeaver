// Gate: caught-failure-census-row — a caught-failure site (waived or not) with no row in the committed census.
// One arm: the live site's `siteId` is absent from `caught-failure-ownership.population.json`. DECLARED LIMIT: a row
// whose site is gone is whole-corpus knowledge and stays with `caught-failure-ownership-health`.
// FAMILY: caught-failure-ownership, the site classifier and identity readers its siblings share.
// POPULATION: the sibling's, so a narrowed structure check still judges each selected file's sites.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { JSON_RESOURCE_PATHS } from "../contract/resource-json.ts";
import { CAUGHT_FAILURE_POPULATION } from "../lib/caught-failure.ts";
import { censusSiteIds, keyCaughtFailureSites } from "../lib/caught-failure-identity.ts";
import { boundedFailureSites, judgeableSiteIds, nativeFailureRead } from "../lib/caught-failure-native.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const POPULATION_PATH = JSON_RESOURCE_PATHS["caught-failure-population"];

const MESSAGE = `a caught-failure site has no row in the committed census (${POPULATION_PATH}). CI and the pre-push application check enforce census membership; commit hooks run only Biome and typecheck. (tooling/src/verify/ops/gen/caught-failure-population.ts)`;

const FIX = `add the site's row to ${POPULATION_PATH}: \`{ "siteId": "<id named in the finding>", "verdict": "deliberate-absorb", "reason": "<why this absorb is safe and when it ends>" }\`. The census generator re-derives the totals before the owner pushes; edit only your own row.`;

const missingRow = (siteId: string): string =>
  `caught-failure site \`${siteId}\` has no census row. Add \`{ "siteId": "${siteId}", "verdict": "deliberate-absorb", "reason": "<why this absorb is safe and when it ends>" }\` to ${POPULATION_PATH}. (tooling/src/verify/ops/gen/caught-failure-population.ts)`;

const SITE_PATH = "packages/server/src/domain/probe/absorb.ts";
const SITE_ID = `${SITE_PATH}::absorb::catch::1`;
const SITE = "export function absorb(): void {\n  try { risky(); } catch {}\n}\n";
// A catch owned only by a `never` three factory hops away: its verdict is past the closure bound (D328).
const PAST =
  "declare function work(): void;\ndeclare function halt(): never;\nfunction hop3(): unknown { return halt(); }\nfunction hop2(): unknown { return hop3(); }\nfunction hop1(): unknown { return hop2(); }\n";
const PAST_SITE = (sibling: string): string =>
  `${PAST}export function absorb(p: Promise<void>): unknown {\n  try { work(); } catch { return hop1(); }\n  ${sibling}\n  return 1;\n}\n`;
const census = (...siteIds: readonly string[]): Readonly<Record<string, string>> => ({
  [POPULATION_PATH]: `${JSON.stringify({ rows: siteIds.map((siteId) => ({ siteId, verdict: "unproven", reason: null })) }, null, 2)}\n`,
});

export const gate = defineGate({
  id: "caught-failure-census-row",
  family: "caught-failure-ownership",
  authority: "hard",
  severity: "error",
  population: CAUGHT_FAILURE_POPULATION,
  // `resource`, not `syntax`: the census is a declared JSON resource, which only resource analysis may read.
  analysis: "resource",
  // Each site's verdict depends on its own file plus the census, so a selected-file subset is a complete answer.
  execution: "selected-files",
  facts: [],
  resources: [{ kind: "json", id: "caught-failure-population" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const nominees: Node[] = [];
    const native = nativeFailureRead(ctx, () => nominees);
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CatchClause, SyntaxKind.CallExpression],
          visit: (node): void => {
            nominees.push(node);
          },
        },
      ],
      prepare: native.prepare,
      evaluate: () => {
        const unknown = (node: Node, reason: string): void => ctx.report.analysis(node, { kind: "unknown", reason });
        const bounded = boundedFailureSites(nominees, native, ctx.relativePath, unknown);
        const read = censusSiteIds(readyResourceValue(ctx.resources.json("caught-failure-population")).value);
        // A census that is not a census is `caught-failure-ownership-health`'s finding; this arm cannot join against it.
        if (!read.ok) {
          return;
        }
        const committed = new Set(read.siteIds);
        // A site with no derivable anchor has no id; the health policy reports it.
        const live = [...bounded.sitesByPath].flatMap(([path, sites]) => keyCaughtFailureSites(path, sites).filter(({ siteId }) => siteId !== undefined));
        const judgeable = judgeableSiteIds(
          bounded,
          live.flatMap(({ siteId }) => (siteId === undefined || committed.has(siteId) ? [] : [siteId])),
          unknown,
        );
        for (const { site, siteId } of live) {
          if (siteId !== undefined && judgeable.has(siteId)) {
            ctx.report.node(site.node, { message: missingRow(siteId) });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: { ...census(), [SITE_PATH]: SITE },
      expect: { count: 1, messageIncludes: `caught-failure site \`${SITE_ID}\` has no census row` },
      why: "THE FOUNDING CASE: a lane adds an absorber (the waiver marker only silences the ownership gate) and not its census row; the finding names the exact siteId and the row to add",
    },
    {
      mode: "resource",
      files: {
        ...census(SITE_ID),
        [SITE_PATH]: `export function before(): void {\n  try { risky(); } catch {}\n}\n${SITE}`,
      },
      expect: { count: 1, messageIncludes: `\`${SITE_PATH}::before::catch::1\` has no census row` },
      why: "THE ID IS SCOPED TO ITS DECLARATION: a same-token catch inserted in a DIFFERENT function above the recorded one is the only finding; under a per-file ordinal it would have taken the recorded id",
    },
    {
      mode: "resource",
      files: { ...census(SITE_ID), [SITE_PATH]: "export function absorb(): void {\n  try { risky(); } catch {}\n  try { risky(); } catch {}\n}\n" },
      expect: { count: 1, messageIncludes: `\`${SITE_PATH}::absorb::catch::2\` has no census row` },
      why: "MULTIPLICITY is part of the identity: a second bindingless catch in the same function is `::absorb::catch::2`, not a duplicate of the recorded `::absorb::catch::1`",
    },
    {
      mode: "resource",
      files: { ...census(), [SITE_PATH]: PAST_SITE("void p.catch(() => undefined);") },
      expect: { count: 1, messageIncludes: `\`${SITE_PATH}::absorb::p::1\` has no census row` },
      why: "D328, NO HIDDEN CUT: an unresolved catch shifts only its own `::catch::` ordinals, so a fully known sibling absorber in the same function still owes its row",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...census(SITE_ID), [SITE_PATH]: SITE },
      why: "the agreeing state: the site has its row, so adding the row clears the finding",
    },
    {
      mode: "resource",
      files: {
        ...census(),
        [SITE_PATH]: "export function owned(): void {\n  try { risky(); } catch (err) { throw err; }\n}\n",
      },
      why: "an OWNED catch is not a site, so it owes no row: the arm counts exactly what the classifier counts",
    },
    {
      mode: "resource",
      files: { ...census(), [SITE_PATH]: PAST_SITE("try { work(); } catch {}") },
      why: "D328 PAST THE BOUND: the empty catch beside an unresolved one may be `::catch::1` or `::catch::2`, so its id is withheld and reported as an advisory unknown rather than judged (tests/tooling/verify/gates/caught-failure-bound.test.ts asserts the unknown)",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { [SITE_PATH]: SITE },
      expect: { messageIncludes: "json:caught-failure-population" },
      why: "a MISSING census withholds the verdict rather than reading as zero committed ids and reporting every site",
    },
  ],
});
