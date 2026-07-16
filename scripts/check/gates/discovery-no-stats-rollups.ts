// Gate: discovery-no-stats-rollups (stats-discovery-seam.md lint backstop; Knowledge-Cluster.md §7 #7 /
// Core-0 §6 partitioning) — discovery is SEMANTICS and computes NO usage rollup; the four stats rollup
// tables (`owner_stats`/`character_stats`/`daily_stats`/`model_stats`, db/schema/stats.ts) are stats'
// alone. Economics reach discovery ONLY as the injected, pre-aggregated stats ops
// (`characterEconomics`/`characterModelEconomics`, wired at the entry root). A dep-cruiser rule CANNOT
// hold this line — every `@orb/db` import resolves to the barrel, never to schema/stats — so the seal
// matches the named table symbols at the ImportSpecifier level (the no-direct-users-read mechanism).
import type { ImportSpecifier } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const ROLLUP_TABLES = new Set(["ownerStats", "characterStats", "dailyStats", "modelStats"]);
const DB_SPECIFIER = /^@orb\/db(?:\/|$)/u;
const MESSAGE =
  "the stats rollup tables (ownerStats/characterStats/dailyStats/modelStats) are stats' alone — discovery is SEMANTICS and computes no usage rollup (stats-discovery-seam.md; Knowledge-Cluster.md §7 #7). Economics reach discovery ONLY through the injected pre-aggregated stats ops.";
const SCAN_DIR = /packages\/server\/src\/domain\/discovery\//u;

/** Is this ImportSpecifier one of the four rollup tables imported from an @orb/db module? */
function isRollupFromDb(spec: ImportSpecifier): boolean {
  if (!ROLLUP_TABLES.has(spec.getName())) {
    return false;
  }
  const decl = spec.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  return decl !== undefined && DB_SPECIFIER.test(decl.getModuleSpecifierValue());
}

export const gate: GateDescriptor = {
  name: "discovery-no-stats-rollups",
  docRow: "stats-discovery-seam.md (the discovery↔stats rollup seal)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "consume the injected stats economics op (DiscoveryContext.characterEconomics / characterModelEconomics, wired at the entry root) — never a rollup table.",
  scanRoot: (p) => SCAN_DIR.test(p),
  kinds: [SyntaxKind.ImportSpecifier],
  visit: (node, _sf, ctx) => {
    if (Node.isImportSpecifier(node) && isRollupFromDb(node)) {
      ctx.report(node, { token: node.getText(), offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'import { ownerStats } from "@orb/db";\nexport const t = ownerStats;\n',
      at: "packages/server/src/domain/discovery/persistence/x.ts",
      why: "a stats rollup table imported inside domain/discovery — the seam breach the dep-cruiser barrel-resolution hole let through",
    },
  ],
  mustPass: [
    {
      files: 'import { characterSummaries } from "@orb/db";\nexport const t = characterSummaries;\n',
      at: "packages/server/src/domain/discovery/persistence/y.ts",
      why: "discovery's OWN rollup table passes — only the four stats rollups are sealed",
    },
    {
      files: 'import { characterStats } from "@orb/db";\nexport const t = characterStats;\n',
      at: "packages/server/src/domain/stats/persistence/z.ts",
      why: "the same import inside domain/stats (the owner) passes — the scan root is discovery only",
    },
  ],
};
