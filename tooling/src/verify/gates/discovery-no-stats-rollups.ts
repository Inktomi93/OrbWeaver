// stats-discovery-seam.md / Knowledge-Cluster.md §7 #7: discovery is SEMANTICS and computes NO usage
// rollup — the four stats rollup tables are stats' alone, and economics reach discovery ONLY as the
// injected pre-aggregated ops. A dep-cruiser rule cannot hold this line (every `@orb/db` import resolves to
// the barrel), so the seal is the TABLE'S DECLARATION HOME read through the shared module-origin reader: a
// same-named table exported by another module is a different table and passes, while an alias, a namespace
// member and a re-export of the real one do not. DECLARED LIMITS live in the mustPass rows.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { readSealedOrigin } from "../lib/sealed-origin.ts";

/** The four rollup tables declared in `packages/db/src/schema/stats.ts`. The home is the schema DIRECTORY
 *  rather than the one file so a schema split cannot silently retire the seal. */
const STATS_ROLLUP_HOME: SealedHome = {
  pathInfix: "/packages/db/src/schema/",
  exportedNames: new Set(["ownerStats", "characterStats", "dailyStats", "modelStats"]),
};

const MESSAGE =
  "the stats rollup tables (ownerStats / characterStats / dailyStats / modelStats) are stats' alone — " +
  "discovery is SEMANTICS and computes no usage rollup (stats-discovery-seam.md; Knowledge-Cluster.md §7 #7). " +
  "Economics reach discovery ONLY through the injected pre-aggregated stats ops.";

const FIX =
  "consume the injected stats economics op (DiscoveryContext.characterEconomics / characterModelEconomics, " +
  "wired at the entry root) — never a rollup table.";

/** Legacy `scanRoot` tested `/packages\\/server\\/src\\/domain\\/discovery\\//` against the repo path; the
 *  `@server` root plus this `under` glob admits exactly that set. */
const DISCOVERY_POPULATION = { in: ["@server"], under: ["packages/server/src/domain/discovery/**"] } as const;

/** The per-file candidate prefilter: an `ImportSpecifier`'s `getName()` is the ORIGINAL exported name even
 *  under an alias, and a namespace member is spelled with the exported name, so the rollup NAMES gate the
 *  expensive origin resolution without losing an alias or a namespace read. */
function candidate(node: Node): { readonly name: string; readonly anchor: Node } | null {
  if (Node.isImportSpecifier(node)) {
    const name = node.getName();
    return STATS_ROLLUP_HOME.exportedNames.has(name) ? { name, anchor: node } : null;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return null;
  }
  const member = readMemberReference(node);
  return member.kind === "resolved" && STATS_ROLLUP_HOME.exportedNames.has(member.value.name) ? { name: member.value.name, anchor: node } : null;
}

export const gate = defineGate({
  id: "discovery-no-stats-rollups",
  family: "discovery-no-stats-rollups",
  authority: "ordinary",
  severity: "error",
  population: DISCOVERY_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
        visit: (node) => {
          const hit = candidate(node);
          if (hit === null) {
            return;
          }
          // FAIL-CLOSED: a rollup NAME whose origin cannot be read is reported. A seam an unreadable
          // barrel can walk through is not a seam.
          if (readSealedOrigin(hit.anchor, STATS_ROLLUP_HOME).kind !== "foreign") {
            ctx.report.node(hit.anchor, { token: hit.name, offset: hit.anchor.getText().indexOf(hit.name) });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/stats.ts": 'export const ownerStats = { name: "owner_stats" };\n',
        "packages/server/src/domain/discovery/persistence/x.ts":
          'import { ownerStats } from "../../../../../db/src/schema/stats.ts";\nexport const t = ownerStats;\n',
      },
      expect: { count: 1, token: "ownerStats" },
      why: "the founding shape — a stats rollup table imported inside domain/discovery, the seam breach the dep-cruiser barrel-resolution hole let through",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/stats.ts": 'export const characterStats = { name: "character_stats" };\n',
        "packages/db/src/index.ts": 'export { characterStats } from "./schema/stats.ts";\n',
        "packages/server/src/domain/discovery/persistence/barrel.ts":
          'import { characterStats as rollup } from "../../../../../db/src/index.ts";\nexport const t = rollup;\n',
      },
      expect: { count: 1, token: "characterStats" },
      why: "AN ALIAS THROUGH THE BARREL is the same table — the legacy reader matched the imported spelling against an `@orb/db` module-specifier regex, so it happened to catch this, but it could not say WHY. The canonical declaration is what does",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/stats.ts": 'export const dailyStats = { name: "daily_stats" };\n',
        "packages/server/src/domain/discovery/persistence/ns.ts":
          'import * as schema from "../../../../../db/src/schema/stats.ts";\nexport const t = schema.dailyStats;\n',
      },
      expect: { count: 1, token: "dailyStats" },
      why: "A NAMESPACE READ produces no ImportSpecifier at all — the legacy import-keyed detector was offered no node whatsoever and this was a silent green (#1506)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/stats.ts": 'export const modelStats = { name: "model_stats" };\n',
        "packages/server/src/domain/discovery/persistence/bracket.ts":
          'import * as schema from "../../../../../db/src/schema/stats.ts";\nexport const t = schema["modelStats"];\n',
      },
      expect: { count: 1, token: "modelStats" },
      why: "the BRACKET spelling of the same namespace read names the same table — the ElementAccess half of the #1506 respelling class",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/discovery/persistence/unreadable.ts": 'import { ownerStats } from "./missing.ts";\nexport const t = ownerStats;\n',
      },
      expect: { count: 1, token: "ownerStats" },
      why: "FAIL-CLOSED — a rollup name whose door does not resolve is reported rather than admitted; the seam must not be walkable through an unreadable module",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/discovery.ts": 'export const characterSummaries = { name: "character_summaries" };\n',
        "packages/server/src/domain/discovery/persistence/own.ts":
          'import { characterSummaries } from "../../../../../db/src/schema/discovery.ts";\nexport const t = characterSummaries;\n',
      },
      why: "discovery's OWN derived table passes — only the four stats rollups are sealed, and discovery is entitled to its own semantics store",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/discovery/lib/local-stats.ts": 'export const ownerStats = { label: "in-memory histogram" };\n',
        "packages/server/src/domain/discovery/persistence/foreign.ts": 'import { ownerStats } from "../lib/local-stats.ts";\nexport const t = ownerStats;\n',
      },
      why: "THE HOME COUNTERFACTUAL — a GENUINE module export, same name, resolving cleanly, differing only in its declaration home. The legacy reader keyed on the name plus an `@orb/db` specifier regex; deleting the schema-home comparison turns this row red",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/stats.ts": 'export const characterStats = { name: "character_stats" };\n',
        "packages/server/src/domain/stats/persistence/z.ts":
          'import { characterStats } from "../../../../../db/src/schema/stats.ts";\nexport const t = characterStats;\n',
        "packages/server/src/domain/discovery/persistence/quiet.ts": "export const quiet = 1;\n",
      },
      why: "the SAME import inside domain/stats — the rollups' owner — is outside this policy's population entirely; stats is where they live",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/stats.ts": 'export const ownerStats = { name: "owner_stats" };\n',
        "packages/server/src/domain/discovery/persistence/waived.ts":
          '// @orb-waive discovery-no-stats-rollups(ownerStats): a one-off backfill reading the rollup directly; ends when the injected economics op covers the backfill shape.\nimport { ownerStats } from "../../../../../db/src/schema/stats.ts";\nexport const t = ownerStats;\n',
      },
      why: "the ONE central positioned waiver naming the exact reported token — malformed, stale and over-broad markers are proven CENTRALLY, never re-proved per policy",
    },
  ],
});
