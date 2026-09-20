// D23 (with D30/D21/D49): an `ownerId` column is legal ONLY on a table that PASSES the D23 test — a true
// producer, a parentless per-user aggregate, or a sanctioned scope-subject. Every other table DERIVES its
// owner by following one FK to an owned entity, so a new stamp on an unclassified table is a doubling.
//
// OWNERID_CLASSIFICATIONS IS AUTHORITATIVE DATA, NOT A GRANT (exception-authority-census: "28 schema
// ownership classifications" — a DATED quotation of that census, not a live count; the table is 29 rows as
// of 2026-09-20 and the only number that polices itself is the stale arm's `count` below). It is the ruling itself — which tables the ledger decided OWN rather than
// derive — so it stays in the module as typed rows with a `why`, and the policy is HARD: the escape is
// re-deciding D23, never a comment at the stamp.
//
// TWO-SIDED: a classified table that carries no `ownerId` column is a STALE row. That arm needs the WHOLE
// production schema to be honest (a partial fileset would call every unwalked row stale), so it is gated on
// the schema BARREL being in the effective population — the §4.5 real-tree-anchor shape, which is NOT any
// row's own path and therefore still sees a table that was deleted outright.
//
// FAMILY `drizzle-schema` — the shared reader is `lib/schema-fact.ts` (`drizzleSchemaFact`), which owns
// Drizzle builder identity and the table/column model for every member.
// POPULATION PORT: byte-identical. The legacy descriptor scoped with
// `scanRoot: (p) => /\/packages\/db\/src\/schema\//u.test(`/${p}`)` and the final declares the PROVIDER'S
// OWN `DRIZZLE_SCHEMA_POPULATION` — the same admitted set, barrel included, which this policy's stale arm
// depends on because the barrel IS its real-tree anchor. The family's one-path delta against the OTHER
// legacy spelling (`isSchemaFile`, barrel excluded) is recorded at that constant in `lib/schema-fact.ts`.
//
// The legacy `ownerid-registry` descriptor (66d28b1272c9dc255545a073276a3b159eddf85a — the PARENT of this
// module's own conversion commit `e847189f7`, verified 2026-09-12 to hold a `GateDescriptor` with the
// `scanRoot` quoted above) resolved schema columns through the legacy `_shared/schema-read.ts` reader
// (`columnProperties`, `schemaScan`) before this conversion moved it onto the shared Drizzle schema fact.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `ownerid-registry` descriptor at 66d28b1272c9dc255545a073276a3b159eddf85a, the parent of the conversion `e847189f7`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,141 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 30 and
// final `population` admits 30. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/db/src/schema/__cbbhr_in_assets.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.

import { defineGate } from "../contract/policy.ts";
import type { SchemaModel } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";

const OWNER_COLUMN = "ownerId";
/** The real-tree anchor for the stale arm. Never a classified row's own path (§4.4a): a deleted table's row
 *  must still be judged, which is exactly what an anchor keyed on a row's own file silences. */
const SCHEMA_BARREL = "packages/db/src/schema/index.ts";

/** One ownership ruling. Deliberately NOT the legacy `ExemptionTable`: that type intentionally conflates
 *  allowlists, sanctioned homes and deferred debt, and these rows are none of those — they are the D23
 *  decision about which tables OWN their scope rather than derive it. `why` carries the D-cite. */
interface OwnershipClassification {
  readonly why: string;
}

/** SQL table names the ledger CLASSIFIED as owning their scope, each with its D-cite. Verified against
 *  packages/db/src/schema at landing; the stale arm below keeps the verification current. */
export const OWNERID_CLASSIFICATIONS: Readonly<Record<string, OwnershipClassification>> = {
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
  user_connections: {
    why: "D23 true producer (a connection is the user's own row — inference program §5.3; the resolver refuses a binding that names a stranger's)",
  },
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
  embed_space_state: {
    why: "D23 parentless per-user aggregate (×vector scope) — the last COMPLETE embed space per (owner, scope) (inference program §10-5). There is no parent to derive through: the row's SUBJECT is the owner's corpus as a whole, not any one vector row, and a vector table cannot carry it (those are keyed per producer and deliberately ownerless, D20). The owner IS the identity here, exactly as owner_stats is",
  },
  model_stats: { why: "D23 parentless per-user aggregate (×model)" },
  keyword_cooccurrence: { why: "D23 parentless per-user aggregate (×keyword-pair)" },
  theme_clusters: { why: "D23 parentless per-user aggregate (×cluster)" },
  // SCOPE-SUBJECT (D23 "no derivable owner → KEEP")
  chat_tags: { why: "D30 per-user overlay on an ownerless chat (the tagger IS the owner)" },
  global_documents: { why: "D49 personal-bank scope junction (the ownerId IS the scope subject)" },
};

const MESSAGE =
  "a table stamps an `ownerId` column but is NOT on the D23 ownership-stamp classification — an ownerId is legal ONLY on a TRUE PRODUCER, a parentless per-user aggregate, or a sanctioned scope-subject (chat_tags D30 / global_documents D49); every other table DERIVES its owner via ONE FK. Drop the stamp or add a justified, D-cited row to OWNERID_CLASSIFICATIONS in tooling/src/verify/gates/ownerid-registry.ts. See Core-Path-Registry.md D23.";
const FIX = "drop the redundant ownerId (derive the owner via ONE FK to an owned entity), or add a D-cited row to OWNERID_CLASSIFICATIONS.";
const staleMessage = (table: string): string =>
  `OWNERID_CLASSIFICATIONS names "${table}" but no schema table of that name carries an \`ownerId\` column — the ledger row now classifies nothing, and a classification that outlives its subject is the two-sided rot §4.4 exists to catch. Delete the stale entry (tooling/src/verify/gates/ownerid-registry.ts). See Core-Path-Registry.md D23.`;

/** Every SQL table name in the ready schema that carries an `ownerId` column. */
function stampedTables(schema: SchemaModel): ReadonlyMap<string, SchemaModel["tables"][number]["columns"][number]> {
  const stamped = new Map<string, SchemaModel["tables"][number]["columns"][number]>();
  for (const table of schema.tables) {
    for (const column of table.columns) {
      if (column.identity.propertyName === OWNER_COLUMN) {
        stamped.set(table.sqlName, column);
      }
    }
  }
  return stamped;
}

export const gate = defineGate({
  id: "ownerid-registry",
  family: "drizzle-schema",
  authority: "hard",
  severity: "error",
  population: DRIZZLE_SCHEMA_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(drizzleSchemaFact).schema();
      recordReadySchemaFact(ctx, fact);
      const stamped = stampedTables(fact.value);
      for (const [table, column] of stamped) {
        if (!Object.hasOwn(OWNERID_CLASSIFICATIONS, table)) {
          ctx.report.node(column.declaration, { token: column.identity.propertyName, offset: 0, message: MESSAGE });
        }
      }
      // The stale arm needs the WHOLE production schema, recognised by its barrel. Without it a fixture (or
      // any partial fileset) would report every classified row as stale — the misfire §4.5 warns about.
      const paths = ctx.files.map(ctx.relativePath);
      if (!paths.includes(SCHEMA_BARREL)) {
        return;
      }
      for (const table of Object.keys(OWNERID_CLASSIFICATIONS)) {
        if (!stamped.has(table)) {
          ctx.report.file(SCHEMA_BARREL, { message: staleMessage(table) });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const ownerId = text("owner_id");\n' +
          'export const t = sqliteTable("not_classified", { ownerId });\n',
      },
      expect: { count: 1, token: "ownerId", messageIncludes: "ownership-stamp classification" },
      why: "THE #1035 SHORTHAND RED: a D23 ownership stamp on an unclassified table, written as a shorthand member — the exact keystroke that used to empty this gate's subject",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x-columns.ts": 'import { text } from "drizzle-orm/sqlite-core";\nexport const tColumns = { ownerId: text("owner_id") };\n',
        "packages/db/src/schema/x.ts":
          'import { sqliteTable } from "drizzle-orm/sqlite-core";\nimport { tColumns } from "./x-columns";\nexport const t = sqliteTable("not_classified", tColumns);\n',
      },
      expect: { count: 1, token: "ownerId", messageIncludes: "ownership-stamp classification" },
      why: "THE #945 IMPORTED-COLUMNS RED: the same stamp reached through an imported columns object — the classified rows keep their own stale checks satisfied, so nothing else would have noticed",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("not_classified", { ownerId: text("owner_id") });\n',
      },
      expect: { count: 1, messageIncludes: "ownership-stamp classification" },
      why: "a NEW ownerId on an unclassified table — a redundant ownership doubling (D23)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("not_classified", { ownerId: text("owner_id") });\n',
      },
      expect: { count: 1, messageIncludes: "ownership-stamp classification" },
      why: "SAME DECLARATION NAME, DIFFERENT TABLE: the JS binding is spelled `characters` (a classified row) but the SQL table it creates is `not_classified`. The classification is about the TABLE the database gets, so the declaration name must not launder the stamp",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/index.ts": 'export * from "./chat.ts";\n',
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n',
      },
      expect: { count: 29, messageIncludes: "classifies nothing" },
      why: 'THE STALE ARM, mode (B) of §4.4a: the barrel resolves so the schema is the production one, and every classified table is GONE — a classification that outlives its subject must RED rather than sit there looking like a ruling. `count` is `Object.keys(OWNERID_CLASSIFICATIONS).length` — 29 since `embed_space_state` landed (`0d126b195`, the joint-space embeddings work) WITHOUT bumping this literal, which is exactly the drift the coupling is for and which sat undetected because this suite is `--full`-only and `pnpm check:structure` is structurally blind to it. RE-DERIVED 2026-09-20 by three independent methods that agree: `Object.keys()` through the real export, an ast-grep structural read of the object literal, and the arm\'s own refusal under a planted `count: 30` ("expected effective finding count=30 but got 29"). It is EXACT on purpose: without it the row passed on ONE stale finding as readily as on all of them, so a stale sweep that silently shrank to a single row would still have looked green (#1968/#2001). It moves with the table, which is the coupling this arm is FOR.',
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          'const ownerId = text("owner_id");\n' +
          'export const t = sqliteTable("characters", { ownerId });\n',
      },
      why: "the SHORTHAND's green twin: the same resolved stamp on a CLASSIFIED table — resolving the member kind widens the obligation set, never the accusation",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("characters", { ownerId: text("owner_id") });\n',
      },
      why: "characters is a D23 TRUE PRODUCER on the classification — a sanctioned ownerId, passes",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("chats", { id: text("id").primaryKey() });\n',
      },
      why: "a table with no ownerId column is not an ownership stamp — ignored, passes",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("characters", { ownerId: text("owner_id") });\n',
      },
      why: "DECLARED LIMIT (§4.5): with NO schema barrel in the population this is not the production schema, so the stale arm withholds — otherwise every fixture would report all 27 classifications as stale",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("not_classified", { userOwnerId: text("user_owner_id"), ownerHandle: text("owner_handle") });\n',
      },
      why: "DECLARED LIMIT / no-false-positive: the stamp is the EXACT `ownerId` property; a differently-named owner-ish column is a different question (`own-tables-only` owns scoping)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const notClassified = sqliteTable("characters", { ownerId: text("owner_id") });\n',
      },
      why: "the counterfactual's green twin: a JS binding spelled `notClassified` creating the CLASSIFIED `characters` table passes — the two rows together prove the verdict keys on the SQL name in both directions",
    },
  ],
});
