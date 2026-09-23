// Gate: open-json-column-key-parity — an OPEN JSON column (`mode:"json"` whose `$type` is
// `Record<string, unknown>` / `unknown` / `JsonValue`, i.e. NO type crosses the write/read seam) whose READER
// names a key the WRITERS never produce renders empty forever while every other gate stays green. FOUNDING
// DEFECT (issue #164, fixed `5e19418b4`): `image_embeddings.caption_meta` was read through fourteen facet
// paths (`$.artStyle`, `$.palette`, …) by discovery's image analytics while both writers ever stored
// `{ model }` — declared, exported, wired to tRPC, rendered in a tab, integration-tested, and blank. The
// silent-reader audit (2026-08-18 §0) MEASURED that the class can
// only live here: 297 fields over 43 TYPED json-column types swept clean, because a type binds writer to
// reader. So the column set is DERIVED from the schema's openness, never hand-listed (§4.6: an empty
// derivation on a tree that HAS a schema is RED in the hard health sibling, never a silent pass).
//
// TWO ARMS, one class:
//   PARITY   — a reader key absent from an ENUMERABLE writer key-set. `caption_meta` verbatim.
//   UNPROVABLE — the column has named readers but its writers carry an OPEN-typed value end to end, so the
//     key vocabulary is undecidable statically. That is not a gate limitation to excuse; it IS the defect
//     condition (nothing binds the two sides), and the audit's preferred fix is the same one: CLOSE THE TYPE
//     — one named shape in `contracts` that both sides import (`packages/contracts/src/embeddings/index.ts`
//     is the worked example). Fires ONCE PER COLUMN, at its first reader, and only when exactly one open
//     column owns the read — otherwise the blame is unattributable.
//
// READER SHAPES (all four the audit found): a `json_extract`/`json_each` `'$.k'` path in a `sql` template
// (the column resolved through the template's own FROM/JOIN aliases or a drizzle `${table.col}`
// interpolation), `blob["k"]`, `blob.k`, and the one-hop `f(blob, "k")` helper — the last three fenced on an
// OPEN-BAG receiver TYPE (a string index signature / `unknown`), so a same-named local object is never
// mistaken for the column.
//
// DECLARED LIMITS, each with a mustPass row: a TYPED column is never judged (the type is the enforcer); an
// INTERPOLATED json path (`json_extract(${col}, ${sel.path})` — the live allowlisted caption drill) names no
// literal key; `Object.keys(blob)` / `blob[key]` iterate rather than name; a reader whose blob reached it
// through an untyped hop (a Map, a parameter named nothing like the column) is invisible to a column-scoped
// reader index — the audit's §9.1 limit, inherited deliberately because the alternative (a corpus-wide
// name sweep) is contaminated by the READER's own vocabulary map.
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { openJsonParityFact } from "../lib/open-json-parity-fact.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

const OPERATION = "open-json-key-read";

const MESSAGE =
  'an OPEN JSON column (mode:"json" + $type<Record<string, unknown>|unknown|JsonValue>) is READ by a key ' +
  "no writer produces, or its writers carry an open-typed value end to end so the key vocabulary is " +
  "unprovable. Nothing binds the two sides, so the surface renders empty forever while every gate stays " +
  "green — issue #164's image_embeddings.caption_meta verbatim. The token names the column and the key; the " +
  "class, its bound, and the per-column dispositions are measured in the 2026-08-18 silent-reader audit " +
  "(tooling/src/verify/gates/open-json-column-key-parity.ts).";

const FIX =
  "CLOSE THE TYPE: give the blob ONE named shape below both sides (packages/contracts/src/embeddings/index.ts " +
  "is the worked example — the write path builds it, the read path imports it, and tsc becomes the enforcer). " +
  "If the key is genuinely produced somewhere this reader index cannot see, make the producer's type say so. " +
  "Take an exact reviewed grant only for a permanent externally-authored key space.";

export const gate = defineGate({
  id: "open-json-column-key-parity",
  family: "open-json-column-key-parity",
  authority: "reviewed-grant",
  severity: "error",
  population: {
    in: ["@db", "@server"],
    under: ["packages/db/src/schema/**", "packages/server/src/**"],
  },
  analysis: "types",
  execution: "entire-population",
  facts: [openJsonParityFact, drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const schema = ctx.fact(drizzleSchemaFact).schema();
      recordReadySchemaFact(ctx, schema);
      const analysis = ctx.fact(openJsonParityFact).analyze(schema.value);
      reportReviewedGrantCandidates(
        ctx.report,
        analysis.verdict.violations.map(({ hit, token }) => ({ node: hit.node, subject: token, operation: OPERATION })),
        { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE },
      );
    },
  }),

  mustFlag: [
    {
      mode: "types",
      grant: { subject: "imageEmbeddings.captionMeta:artStyle", operation: OPERATION },
      files: {
        "packages/db/src/schema/embeddings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const imageEmbeddings = sqliteTable("image_embeddings", {\n  captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/embeddings/indexer/caption.ts":
          "export async function analyse(db, id, model) {\n  await db.insert(imageEmbeddings).values({ captionMeta: { model } });\n}\n",
        "packages/server/src/domain/discovery/persistence/embed-store-reads.ts":
          "export async function facetRows(db) {\n  return await db.all(sql`SELECT id FROM image_embeddings ie WHERE json_extract(ie.caption_meta, '$.artStyle') IS NOT NULL`);\n}\n",
      },
      expect: { count: 1, messageIncludes: "imageEmbeddings.captionMeta:artStyle" },
      why: "THE FOUNDING DEFECT verbatim (issue #164): the writer stores `{ model }` and the reader json_extracts `$.artStyle` off the same open column — a rendered surface that is blank forever with every gate green",
    },
    {
      mode: "types",
      grant: { subject: "imageEmbeddings.captionMeta:palette", operation: OPERATION },
      files: {
        "packages/db/src/schema/embeddings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const imageEmbeddings = sqliteTable("image_embeddings", {\n  captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/embeddings/indexer/caption.ts":
          "export async function analyse(db, id, model) {\n  await db.insert(imageEmbeddings).values({ captionMeta: { model } });\n}\n",
        "packages/server/src/domain/discovery/image-analytics/facets.ts":
          'export function label(row: { captionMeta: { [k: string]: unknown } }): unknown {\n  return row.captionMeta["palette"];\n}\n',
      },
      expect: { count: 1, messageIncludes: "imageEmbeddings.captionMeta:palette" },
      why: 'the `blob["k"]` spelling of the same defect — a string-keyed read off an open bag, which is text and not a type at every tier (audit §0.3). A name/shape matcher would pass it',
    },
    {
      mode: "types",
      grant: { subject: "imageEmbeddings.captionMeta", operation: OPERATION },
      files: {
        "packages/db/src/schema/embeddings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const imageEmbeddings = sqliteTable("image_embeddings", {\n  captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/embeddings/persistence/queries.ts":
          "export async function store(db, input: { captionMeta: { [k: string]: unknown } }) {\n  await db.insert(imageEmbeddings).values({ captionMeta: input.captionMeta });\n}\n",
        "packages/server/src/domain/discovery/image-analytics/facets.ts":
          'export function label(row: { captionMeta: { [k: string]: unknown } }): unknown {\n  return row.captionMeta["artStyle"];\n}\n',
      },
      expect: { count: 1, messageIncludes: "imageEmbeddings.captionMeta" },
      why: "the UNPROVABLE arm: the writer carries an OPEN-typed value end to end, so nothing in the tree can say whether `artStyle` is ever produced — the exact shape that let the founding defect exist. Reported at the schema column, where CLOSING THE TYPE fixes it",
    },
    {
      // THE DRIZZLE-SQL WRITE FENCE (D148 #679 U8, RED-FIRST discriminating). A `.set({ col: sql`…` })` write
      // (or any value TYPED as drizzle `SQL`) stores an UNKNOWABLE key set — the raw fragment is opaque to the
      // checker. Without the fence, `typeKeys` harvests the `SQL` interface's members (getSQL/queryChunks/…) as
      // a fake, NON-opaque vocabulary: the reader key then misses it and the gate emits a per-key PARITY token
      // `widgets.residue:someKey`, so this row (expecting the whole-column UNPROVABLE token) goes RED. With the
      // fence the write is opaque, the read is the UNPROVABLE arm, and the token is `widgets.residue` — the same
      // treatment `namesNoKey` already gives String/Array to keep their prototypes out of the vocabulary. On the
      // REAL tree this is exactly what U8's `writePluginCardData` `.set({ extensions: sql`json_set(…)` })`
      // triggered: 5 open-json reds off `characters.extensions` + a staled DOORWAY, all 0 after the fence.
      // The column here is a SYNTHETIC `widgets.residue` on purpose — the real `characters.extensions` is a
      // DOORWAY row, so its UNPROVABLE token is exempted and the finding is swallowed (0, not 1); a fresh
      // non-exempt column is what lets the pin actually observe the flip.
      mode: "types",
      grant: { subject: "widgets.residue", operation: OPERATION },
      files: {
        "packages/db/src/schema/widget.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const widgets = sqliteTable("widgets", {\n  residue: text("residue", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/widget/persistence/write.ts":
          "interface SQL { getSQL(): void; queryChunks: unknown[] }\nexport async function writeState(db, frag: SQL) {\n  await db.update(widgets).set({ residue: frag });\n}\n",
        "packages/server/src/domain/widget/read.ts":
          "export function readState(db) {\n  return db.all(sql`SELECT id FROM widgets w WHERE json_extract(w.residue, '$.someKey') IS NOT NULL`);\n}\n",
      },
      expect: { count: 1, messageIncludes: "widgets.residue" },
      why: "the drizzle-SQL write fence, red-first: WITHOUT it `typeKeys` harvests the `SQL` interface's prototype members as a fake vocabulary and the reader key misses it, emitting the per-key parity token `widgets.residue:someKey` (this row, expecting the whole-column UNPROVABLE token, then fails); WITH it the write is opaque, so the read is UNPROVABLE and the token is `widgets.residue`. A synthetic non-DOORWAY column is used because the real `characters.extensions` (the U8 carrier) is exempt and would swallow the finding.",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const settings = sqliteTable("settings", {\n  value: text("value", { mode: "json" }).$type<JsonValue>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/write.ts":
          "export async function save(db) {\n  await db.insert(settings).values({ value: { theme: 1 } });\n}\n",
        "packages/server/src/domain/automation/persistence/migrate.ts":
          "export async function arms(db) {\n  return await db.all(sql`select element.key from json_each(actions_json) as element where json_extract(element.value, '$.type') = 'tool'`);\n}\n",
      },
      why: "#1802 — a `json_each(…) AS element` alias is a table-valued function's VIRTUAL row: `element.value` is json_each's own column, never the open `settings.value` blob, so the read addresses nothing open (the pool-by-name fallback used to attribute it and red a key the blob's writers never spell — a lying, run-order-dependent verdict)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const imageEmbeddings = sqliteTable("image_embeddings", {\n  captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/embeddings/indexer/caption.ts":
          "export async function analyse(db, model, artStyle) {\n  await db.insert(imageEmbeddings).values({ captionMeta: { model, artStyle } });\n}\n",
        "packages/server/src/domain/discovery/persistence/embed-store-reads.ts":
          "export async function facetRows(db) {\n  return await db.all(sql`SELECT id FROM image_embeddings ie WHERE json_extract(ie.caption_meta, '$.artStyle') IS NOT NULL`);\n}\n",
      },
      why: "THE FIX shape: the writer's literal produces the very key the reader names — parity holds, and this row is the gate's regression pin against re-flagging a corrected column",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }).$type<ChatMetadata>(),\n});\nexport interface ChatMetadata { readonly background?: string }\n',
        "packages/server/src/domain/chat/verbs/read.ts": "export function bg(meta: ChatMetadata): unknown {\n  return meta.background;\n}\n",
      },
      why: "DECLARED LIMIT — a TYPED column is NEVER judged: the type binds writer to reader, which is why the audit's 297-field sweep over 43 typed column types found zero (§0). The gate's whole scope is the open set",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", {\n  runtimeVariables: text("runtime_variables", { mode: "json" }).$type<Record<string, string>>(),\n});\n',
        "packages/server/src/domain/chat/verbs/vars.ts": "export function names(vars: Record<string, string>): string[] {\n  return Object.keys(vars);\n}\n",
      },
      why: "DECLARED LIMIT — a USER-AUTHORED key space (macro names) read by `Object.keys` names no key at all: there is no fixed vocabulary to drift from, so it is not this class (audit §3 row 13)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/embeddings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const imageEmbeddings = sqliteTable("image_embeddings", {\n  captionMeta: text("caption_meta", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/embeddings/indexer/caption.ts":
          "export async function analyse(db, model) {\n  await db.insert(imageEmbeddings).values({ captionMeta: { model } });\n}\n",
        "packages/server/src/domain/discovery/persistence/embed-store-reads.ts":
          "export async function byFacet(db, sel: { path: string }) {\n  return await db.all(sql`SELECT id FROM image_embeddings ie WHERE json_extract($" +
          "{imageEmbeddings.captionMeta}, $" +
          "{sel.path}) IS NOT NULL`);\n}\n",
      },
      why: "DECLARED LIMIT — an INTERPOLATED json path names no literal key, so it is invisible here (the live allowlisted caption drill, audit §4). The vocabulary it pivots on is closed one tier up, in contracts",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/server/src/domain/chat/verbs/local.ts": "export function local(): unknown {\n  const metadata = { model: 1 };\n  return metadata.model;\n}\n",
        "packages/server/src/domain/chat/verbs/named.ts":
          'interface JwtClaims { readonly [k: string]: unknown }\nexport function claim(row: { metadata: JwtClaims }): unknown {\n  return row.metadata["sub"];\n}\n',
      },
      why: "the OPEN-BAG type fence: a same-named LOCAL object is not the column. Without it every `metadata.x` in the server would enter the reader index and the gate would be a false-positive factory",
    },
  ],
});
