// Gate: ownerid-registry (D23 ownership-stamp rule, D30 chat_tags, D21 assets). An `ownerId` column may
// exist ONLY on a table that PASSES the D23 test — a true producer, a parentless per-user aggregate, or
// a sanctioned "ownerId IS the scope subject" case (see OWNERID_ALLOWLIST's per-entry justification).
// Every other table must derive its owner by following one FK to an owned entity. A newly-stamped
// `ownerId` on an unlisted table is a doubling — RED with the D23 cite; a stale allowlist entry is also RED (two-direction ratchet).
// COLUMNS ARE RESOLVED, NOT REQUIRED INLINE (#945): the columns argument is read through
// `_shared/schema-read.ts`, which follows an imported/aliased object-literal binding (and object spreads)
// and refuses loudly on any other shape. `sqliteTable("x", importedColumns, …)` used to yield ZERO columns
// here, erasing this gate's obligations while the schema file scan stayed healthy; findings anchor on the
// column's DECLARING file and the scan line prints the resolved table/column population.
import { columnProperties, schemaScan } from "@orb/tooling/_shared/schema-read";
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";

const SCHEMA_DIR = /\/packages\/db\/src\/schema\//u;
const OWNER_COL = "ownerId";
const TABLE_FN = "sqliteTable";

/** SQL table names sanctioned to carry an `ownerId` column, each with its ledger justification. The
 *  gate is measured against reality: a NEW ownerId on a table NOT here is RED; a listed table with NO
 *  ownerId column anywhere is a STALE entry (RED). Verified against packages/db/src/schema at landing. */
export const OWNERID_ALLOWLIST: ExemptionTable = {
  // TRUE PRODUCERS (D23 KEEP)
  characters: { why: "D23 true producer" },
  personas: { why: "D23 true producer" },
  presets: { why: "D23 true producer (nullable — the shared system default)" },
  world_books: { why: "D23 true producer" },
  regex_scripts: { why: "D23 true producer (D121-E — the regex SCRIPT LIBRARY; a script is authored with no owning parent to derive through)" },
  refinery_schemas: {
    why: "D23 true producer (R3/SF0 — the custom payload-schema LIBRARY; a schema is authored library tooling with no owning parent to derive through, the presets shape)",
  },
  roster_presets: {
    why: "D23 true producer (D61 B6 — a saved party is the user's authored artifact; its character references are a LIST via the roster_preset_members junction, so there is no single required FK to derive the owner through)",
  },
  tags: { why: "D23 true producer" },
  user_credentials: { why: "D23 true producer" },
  workloads: { why: "D23 true producer" },
  workload_schedules: {
    why: "D23 true producer (a user-authored recurring-run config; no owned anchor to derive from — the TIME dimension over the workloads queue)",
  },
  documents: { why: "D49 databank producer / D23 top-level owned canon" },
  themes: { why: "D23 generalized producer list (themes) / D44/D63" },
  assets: { why: "D21 single-owned (per-user, fetchOwned)" },
  automation_rules: { why: "D46 host-authored rule (runs as its author)" },
  global_variables: { why: "D46 per-user cross-chat KV (fetchOwned)" },
  plugins: { why: "D46 true producer (the installing principal's per-user plugin registry; a plugin runs as its owner)" },
  plugin_kv: {
    why: "D46 denormalized guard on the plugin_id partition — the belt WHERE (plugin_id, owner_id) makes a cross-owner KV read structurally impossible even if a plugin_id were reused (plugin-design/02 §3); owner also drives the user-hard-delete cascade",
  },
  // PARENTLESS PER-USER AGGREGATES (D23 KEEP)
  owner_stats: { why: "D23 parentless per-user aggregate" },
  stats_canon_versions: { why: "D23 parentless per-user aggregate — monotonic rebuild ownership token" },
  automation_owner_budgets: {
    why: "D23 parentless per-user aggregate + D46 — C5's owner-GLOBAL fire-rate ceiling. It is the SIBLING of automation_budgets (chatId PK) and it exists BECAUSE that key cannot express a chat-less rule's scope: a NULL-scope row is unrepresentable on a chat-keyed PK, and a synthetic sentinel chat id would be the D24 soft-ref class. The owner IS the scope here — the row has no parent to derive one from — so the stamp is the identity, not a redundant denormalization (interaction-direction-spec §3-S3)",
  },
  daily_stats: { why: "D23 parentless per-user aggregate (×day)" },
  model_stats: { why: "D23 parentless per-user aggregate (×model)" },
  keyword_cooccurrence: { why: "D23 parentless per-user aggregate (×keyword-pair)" },
  theme_clusters: { why: "D23 parentless per-user aggregate (×cluster)" },
  // SCOPE-SUBJECT (D23 "no derivable owner → KEEP")
  chat_tags: { why: "D30 per-user overlay on an ownerless chat (the tagger IS the owner)" },
  global_documents: { why: "D49 personal-bank scope junction (the ownerId IS the scope subject)" },
};
const STALE_MESSAGE = (table: string): string =>
  `OWNERID_ALLOWLIST names "${table}" but no schema table of that name carries an \`ownerId\` column — ` +
  "delete the stale entry (tooling/src/verify/gates/ownerid-registry.ts). See Core-Path-Registry.md D23.";

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
  if (colsArg === undefined) {
    return;
  }
  const hasOwner = columnProperties(colsArg).some((column) => column.name === OWNER_COL);
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
    "a table stamps an `ownerId` column but is NOT on the D23 ownership-stamp allowlist — an ownerId is legal ONLY on a TRUE PRODUCER, a parentless per-user aggregate, or a sanctioned scope-subject (chat_tags D30 / global_documents D49); every other table DERIVES its owner via ONE FK. Drop the stamp or add a justified allowlist row in tooling/src/verify/gates/ownerid-registry.ts with a D-cite. See Core-Path-Registry.md D23.",
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
    ctx.scan(schemaScan(ctx.project));
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
      files: 'const ownerId = text("owner_id");\nexport const t = sqliteTable("not_allowlisted", { ownerId });\n',
      at: "packages/db/src/schema/x.ts",
      expect: { count: 1, messageIncludes: "D23" },
      why: "THE #1035 SHORTHAND RED: a D23 ownership stamp on an unlisted table, written as a shorthand member — the exact keystroke that used to empty this gate's subject",
    },
    {
      files: {
        "packages/db/src/schema/x-columns.ts": 'export const tColumns = { ownerId: text("owner_id") };\n',
        "packages/db/src/schema/x.ts": 'import { tColumns } from "./x-columns";\nexport const t = sqliteTable("not_allowlisted", tColumns);\n',
      },
      expect: { count: 1, messageIncludes: "D23" },
      why: "THE #945 IMPORTED-COLUMNS RED: a D23 ownership stamp on an unlisted table, reached through an imported columns object — the existing allowlist rows keep their own stale checks satisfied, so nothing else would have noticed",
    },
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
      files: 'const ownerId = text("owner_id");\nexport const t = sqliteTable("characters", { ownerId });\n',
      at: "packages/db/src/schema/x.ts",
      why: "the SHORTHAND's green twin: the same resolved stamp on an ALLOWLISTED table — passes, and its allowlist row keeps earning its keep",
    },
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
