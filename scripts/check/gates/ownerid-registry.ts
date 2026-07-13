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
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

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
  workload_schedules:
    "D23 true producer (a user-authored recurring-run config; no owned anchor to derive from — the TIME dimension over the workloads queue)",
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
const STALE_MESSAGE = (table: string): string =>
  `OWNERID_ALLOWLIST names "${table}" but no schema table of that name carries an \`ownerId\` column — ` +
  "delete the stale entry (scripts/check/gates/ownerid-registry.ts). See Core-Path-Registry.md D23.";

/** If this node is a `sqliteTable("<name>", { … ownerId … })` call, its SQL table name — else undefined.
 *  The single-node form of `ownerIdTables`, for the single-pass visit (no per-file re-walk). */
function ownerIdTableOf(node: Node): string | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = node.getExpression();
  if (!(callee.isKind(SyntaxKind.Identifier) && callee.getText() === TABLE_FN)) {
    return;
  }
  const [nameArg, colsArg] = node.getArguments();
  if (nameArg === undefined || !nameArg.isKind(SyntaxKind.StringLiteral)) {
    return;
  }
  if (colsArg === undefined || !colsArg.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return;
  }
  const hasOwner = colsArg
    .getProperties()
    .some(
      (p) =>
        (p.isKind(SyntaxKind.PropertyAssignment) ||
          p.isKind(SyntaxKind.ShorthandPropertyAssignment)) &&
        p.getName() === OWNER_COL,
    );
  return hasOwner ? nameArg.getLiteralText() : undefined;
}

// STAMP arm (per-node): a sqliteTable with an ownerId column not on the allowlist → per-site finding at
// visit. STALE arm (whole-tree): a listed table with no ownerId column anywhere → finalize. The stale arm
// is name-keyed against the LIVE OWNERID_ALLOWLIST, so a synthetic tree (which omits the real schema
// tables) would misfire — guarded on (a) project scope and (b) the schema barrel being loaded. The
// barrel is loaded on every real full-tree run, so the ratchet is preserved.
const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const seenOwnerTables = new Set<string>();

export const gate: GateDescriptor = {
  name: "ownerid-registry",
  docRow: "Core-Path-Registry.md D23 (D30/D21/D49)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a table stamps an `ownerId` column but is NOT on the D23 ownership-stamp allowlist — an ownerId is legal ONLY on a TRUE PRODUCER, a parentless per-user aggregate, or a sanctioned scope-subject (chat_tags D30 / global_documents D49); every other table DERIVES its owner via ONE FK. Drop the stamp or add a justified allowlist row in scripts/check/gates/ownerid-registry.ts with a D-cite. See Core-Path-Registry.md D23.",
  fix: "drop the redundant ownerId (derive the owner via ONE FK to an owned entity), or add a D-cited row to OWNERID_ALLOWLIST.",
  scanRoot: (p) => SCHEMA_DIR.test(`/${p}`),
  kinds: [SyntaxKind.CallExpression],
  begin: () => {
    seenOwnerTables.clear();
  },
  visit: (node, _sf, ctx) => {
    const table = ownerIdTableOf(node);
    if (table === undefined) {
      return;
    }
    seenOwnerTables.add(table);
    if (!(table in OWNERID_ALLOWLIST)) {
      ctx.report(node, { token: `ownerId on "${table}"`, offset: 0 });
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, SCHEMA_BARREL)) {
      return; // not the real full schema tree — the name-keyed stale arm would misfire (§4.4)
    }
    for (const table of Object.keys(OWNERID_ALLOWLIST)) {
      if (!seenOwnerTables.has(table)) {
        ctx.report({
          file: "packages/db/src/schema",
          line: 0,
          column: 0,
          message: STALE_MESSAGE(table),
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'export const t = sqliteTable("not_allowlisted", { ownerId: text("owner_id") });\n',
      at: "packages/db/src/schema/x.ts",
      expect: { messageIncludes: "ownership-stamp allowlist" },
      why: "a NEW ownerId on a table not on the D23 allowlist — a redundant ownership doubling",
    },
  ],
  // NOTE: the OWNERID_ALLOWLIST stale/ratchet arm (a listed table with no ownerId anywhere) is
  // `fileLoaded`-guarded to the real schema barrel — its coverage moves to the live `pnpm check:structure`
  // run. Only the pure FLAG/PASS branches port as examples below.
  mustPass: [
    {
      files: 'export const t = sqliteTable("characters", { ownerId: text("owner_id") });\n',
      at: "packages/db/src/schema/character.ts",
      why: "characters is a D23 TRUE PRODUCER on the allowlist — a sanctioned ownerId, passes",
    },
    {
      // a table with no ownerId column is not stamped — ignored.
      files: 'export const t = sqliteTable("chats", { id: text("id").primaryKey() });\n',
      at: "packages/db/src/schema/chat.ts",
      why: "a table with no ownerId column is not an ownership stamp — ignored, passes",
    },
  ],
};
