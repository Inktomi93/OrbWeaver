// Gate: ownerid-registry (D23 the ownership-stamp rule + D30 chat_tags + D21 assets). An `ownerId`
// column may exist ONLY on a table that PASSES the D23 test — a TRUE PRODUCER (the user's authored
// artifact with no owned anchor) OR a parentless per-user aggregate OR one of the two sanctioned
// "ownerId IS the scope subject, not a parent mirror" cases (chat_tags D30 · global_documents D49). Every
// OTHER table must DERIVE its owner by following ONE FK to an owned entity (drop the stamp — a redundant
// mirror of the parent's owner). A newly-stamped `ownerId` on an unlisted table is a doubling: RED with
// the D23 cite. The allowlist is the vector-scope-derived data-driven shape (a Set the tree is measured
// against), and it is a TWO-DIRECTION ratchet — a stale entry (a listed table that has lost its ownerId
// or no longer exists) is ALSO RED, so the allowlist can't rot silent.
//
// Each entry is a SQL table name (the first arg to `sqliteTable`), classified against the ledger:
//   • TRUE PRODUCERS (D23 KEEP — stamp + fetchOwned): characters · personas · presets · world_books ·
//     tags · user_credentials · workloads · documents (D49) · roster_presets (D61) · themes (D23 generalized
//     producer list) · assets (D21 single-owned) · automation_rules (D46 host-authored) · global_variables
//     (D46 per-user KV).
//   • PARENTLESS PER-USER AGGREGATES (D23 KEEP — owner × a non-entity dimension): owner_stats · daily_stats ·
//     model_stats · keyword_cooccurrence · theme_clusters.
//   • SCOPE-SUBJECT (the ownerId IS the partition subject, not a derivable parent mirror — the D23 "no
//     derivable owner → KEEP" case): chat_tags (D30 per-user overlay on an ownerless chat) · global_documents
//     (D49 — the ownerId is the scope subject of the personal bank).
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const SCHEMA_DIR = /\/packages\/db\/src\/schema\//u;
const OWNER_COL = "ownerId";
const TABLE_FN = "sqliteTable";

/** SQL table names sanctioned to carry an `ownerId` column, each with its ledger justification. The
 *  gate is measured against reality: a NEW ownerId on a table NOT here is RED; a listed table with NO
 *  ownerId column anywhere is a STALE entry (RED). Verified against packages/db/src/schema at landing. */
export const OWNERID_ALLOWLIST: Readonly<Record<string, string>> = {
  // TRUE PRODUCERS (D23 KEEP)
  characters: "D23 true producer",
  personas: "D23 true producer",
  presets: "D23 true producer (nullable — the shared system default)",
  world_books: "D23 true producer",
  tags: "D23 true producer",
  user_credentials: "D23 true producer",
  workloads: "D23 true producer",
  documents: "D49 databank producer / D23 top-level owned canon",
  roster_presets: "D61 true producer",
  themes: "D23 generalized producer list (themes) / D44/D63",
  assets: "D21 single-owned (per-user, fetchOwned)",
  automation_rules: "D46 host-authored rule (runs as its author)",
  global_variables: "D46 per-user cross-chat KV (fetchOwned)",
  // PARENTLESS PER-USER AGGREGATES (D23 KEEP)
  owner_stats: "D23 parentless per-user aggregate",
  daily_stats: "D23 parentless per-user aggregate (×day)",
  model_stats: "D23 parentless per-user aggregate (×model)",
  keyword_cooccurrence: "D23 parentless per-user aggregate (×keyword-pair)",
  theme_clusters: "D23 parentless per-user aggregate (×cluster)",
  // SCOPE-SUBJECT (D23 "no derivable owner → KEEP")
  chat_tags: "D30 per-user overlay on an ownerless chat (the tagger IS the owner)",
  global_documents: "D49 personal-bank scope junction (the ownerId IS the scope subject)",
};

const STAMP_MESSAGE = (table: string): string =>
  `table "${table}" stamps an \`ownerId\` column but is NOT on the D23 ownership-stamp allowlist — an ` +
  "ownerId is legal ONLY on a TRUE PRODUCER (authored artifact, no owned anchor), a parentless per-user " +
  "aggregate, or a sanctioned scope-subject (chat_tags D30 / global_documents D49). Every other table " +
  "DERIVES its owner via ONE FK to an owned entity — drop the stamp or add a justified allowlist row " +
  "(scripts/check/gates/ownerid-registry.ts) with a D-cite. See Core-Path-Registry-D1-D34.md D23.";
const STALE_MESSAGE = (table: string): string =>
  `OWNERID_ALLOWLIST names "${table}" but no schema table of that name carries an \`ownerId\` column — ` +
  "delete the stale entry (scripts/check/gates/ownerid-registry.ts). See Core-Path-Registry-D1-D34.md D23.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** Every `sqliteTable("<name>", { … })` whose columns object declares an `ownerId` property, as
 *  (sqlName, file, line) — the AST truth the allowlist is measured against. */
function ownerIdTables(sf: SourceFile): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!(callee.isKind(SyntaxKind.Identifier) && callee.getText() === TABLE_FN)) {
      continue;
    }
    const [nameArg, colsArg] = call.getArguments();
    if (nameArg === undefined || !nameArg.isKind(SyntaxKind.StringLiteral)) {
      continue;
    }
    if (colsArg === undefined || !colsArg.isKind(SyntaxKind.ObjectLiteralExpression)) {
      continue;
    }
    const hasOwner = colsArg
      .getProperties()
      .some(
        (p) =>
          (p.isKind(SyntaxKind.PropertyAssignment) ||
            p.isKind(SyntaxKind.ShorthandPropertyAssignment)) &&
          p.getName() === OWNER_COL,
      );
    if (hasOwner) {
      out.push({ name: nameArg.getLiteralText(), line: call.getStartLineNumber() });
    }
  }
  return out;
}

/** Stamp-side arm: every ownerId table not on the allowlist is RED; returns the set of seen owner
 *  tables so the caller can run the stale-side arm. */
function stampViolations(
  root: string,
  project: { getSourceFiles: () => SourceFile[] },
  allowlist: Readonly<Record<string, string>>,
): { violations: Violation[]; seen: Set<string> } {
  const violations: Violation[] = [];
  const seen = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    if (!SCHEMA_DIR.test(sf.getFilePath())) {
      continue;
    }
    const rel = relPath(root, sf.getFilePath());
    for (const table of ownerIdTables(sf)) {
      seen.add(table.name);
      if (!(table.name in allowlist)) {
        violations.push({ file: rel, line: table.line, message: STAMP_MESSAGE(table.name) });
      }
    }
  }
  return { violations, seen };
}

/** Factory: the gate over an injected allowlist (the ratchet-arm test seam — the same
 *  createEnforcementRegistryParity precedent). `ownerIdRegistry` below is the live-allowlist instance. */
export function createOwnerIdRegistry(allowlist: Readonly<Record<string, string>>): Check {
  return {
    name: "ownerid-registry",
    run: ({ root, project }): Violation[] => {
      const { violations, seen } = stampViolations(root, project, allowlist);
      // Vacuous on the placeholder tree (no schema loaded) — never flag stale entries then.
      if (seen.size === 0) {
        return violations;
      }
      for (const table of Object.keys(allowlist)) {
        if (!seen.has(table)) {
          violations.push({
            file: "packages/db/src/schema",
            line: 0,
            message: STALE_MESSAGE(table),
          });
        }
      }
      return violations;
    },
  };
}

export const ownerIdRegistry: Check = createOwnerIdRegistry(OWNERID_ALLOWLIST);
