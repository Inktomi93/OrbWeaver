// Gate: json-column-write-parity — a JSON column with BOTH a key-wise writer and a whole-record-replace
// writer is a silent clobber. FOUNDING DEFECT (`163b93fa10`, red-first at
// tests/server/domain/refinery/verbs/update-session.int.test.ts): `refinery_sessions.selection` was written
// two ways — `applyFields` REMAPPED `greetingIndexes` key-wise when an accepted rewrite removed a greeting,
// while `updateSession` did `set.selection = refinerySelectionSchema.parse(patch.selection)`, a whole value
// rebuilt from the client's image alone. A scope-dialog save carrying a pre-remap image therefore UNDID the
// remap in the very next write, and the session's positional greeting indexes pointed at the wrong slots.
// The fix was a DELTA patch grammar merged onto the stored value (`mergeSelection`, the rpg `patchSheet` /
// stats `mergeSheet` precedent). Neither writer was wrong alone — the STRADDLE was.
//
// THE CLASSIFIER, and why it is a taint test rather than a name test. A writer is KEY-WISE iff its value
// depends on something read from the ROW; WHOLE-REPLACE iff the value is a pure function of the caller's
// input (`schema.parse(patch.X)`, `patch.X`, `{ ...patch.X }`, a literal). Names prove nothing here: the
// pre-fix `refinerySelectionSchema.parse(patch.selection)` and the post-fix
// `mergeSelection(current, refinerySelectionPatchSchema.parse(patch.selection))` BOTH mention `.selection`,
// so a shape/name matcher would have passed the defect (a LYING PROOF, tooling/src/verify/gates/GATE-AUTHORING.md §5). The taint
// roots are: identifiers in the assignment's own RHS, plus — when the `.set()` argument spreads a local
// helper (`{ ...parsePatch(patch, sessionViewOf(row).selection) }`, the exact live shape) — that helper's
// parameters mapped to their call-site arguments, so only the parameters the assignment actually READS
// carry the caller's actual expression. A local declaration is NOT row provenance: the bounded reader
// traces actual Drizzle reads/projections and callable bodies, validates same-column known schema bodies,
// and proves real omitted-member fallbacks/spreads. Unknown/fabricated/opaque producer or normalizer
// paths refuse. A documented catch carries historical-heal provenance, never a value-identity claim;
// heal-fed versioned-config writes still owe the existing ARM-B dominance guard.
//
// DERIVED, NEVER HAND-LISTED: the JSON-column set comes from `packages/db/src/schema/**`'s
// `text(..., { mode: "json" })` declarations (the LIVE single source of truth, §10) and the table identity
// from the `db.update(<tableVar>)` in the chain. An empty derivation on a real tree is a RED blindness
// tripwire (§4.6), not a silent pass.
//
// ARM B — THE DOMINANCE ARM (#879, from the #471 settings-blob wipe). A JSON column whose `$type<T>` is a
// type a `defineVersionedConfig(...)` OWNS carries a blob whose READ seam DEGRADES an unreadable value to
// schema defaults; a whole-replace write built on that read persists the stand-in and destroys the real
// blob silently and permanently. `@orb/server/kit`'s `stored-config` module (it lived at
// `domain/settings/substrate/stored-config.ts` until #1026 gave it a second domain caller) and its
// `requireIntactStoredConfig(...)` are the ONE refusal seam, and until this arm its totality over future
// writers rested on a header sentence (0 of 233 gate files referenced it). So: EVERY whole-replace writer
// of a versioned-config column must be DOMINATED by that call inside its own function body — dominance,
// not presence: the guard's own top-level statement must PRECEDE the write's top-level statement in the
// same function body, so a guard sitting in a sibling branch (or after the write) does not absolve it.
// A guard nested inside an EARLIER statement is dominance enough and is the live correct shape
// (`writeUserConfig`'s `if (row !== undefined) { requireIntactStoredConfig(…) }` — an ABSENT row is a
// legitimate first write with nothing to lose).
// FAIL-CLOSED (#944 posture): a `.set(<identifier>)` on a versioned-config-owning table is OPAQUE — the
// gate cannot read which columns it assigns — so it is judged as a whole-replace write rather than skipped.
// The owned-type derivation reads the EXPLICIT type argument first and falls back to the declaration's
// resolved `VersionedConfig<T>`; a call it can read neither way is REPORTED and counted `unresolved`.
//
// DECLARED LIMITS (each has a mustPass row): a column with ONE writer is never judged (there is nothing to
// straddle); an `.insert()`/`.values()` is creation, not a patch; a writer reached through more than one
// helper hop, or through a `db.run(sql\`json_set(...)\`)`, is not classified.
// AND ARM B'S OWN LIMIT: the AppSettings override blob is NOT reachable by this derivation. It lives in the
// generic KV column `settings.value`, typed `JsonValue`, and is identified only by the RUNTIME string
// `APP_SETTINGS_KEY` in a `where(eq(settings.key, …))` — there is no type crossing the seam, so no
// structural fact links that row to `appSettingsConfig`. Its writer (`writeAppOverride`) is guarded by
// convention and by its own header. DO NOT "fix" this with a hand-listed key/path table: a hand list is a
// second home for the ownership fact and rots silently the day the key moves (§3). The end condition is the
// blob moving to a `$type`d column of its own, at which point this arm covers it with no gate edit.
// COLUMNS ARE RESOLVED, NOT REQUIRED INLINE (#945): the columns argument is read through
// `_shared/schema-read.ts`, which follows an imported/aliased object-literal binding (and object spreads)
// and refuses loudly on any other shape. `sqliteTable("x", importedColumns, …)` used to yield ZERO columns
// here, erasing this gate's obligations while the schema file scan stayed healthy; findings anchor on the
// column's DECLARING file and the scan line prints the resolved table/column population.
import { defineGate } from "../contract/policy.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { jsonColumnWriteFact } from "../lib/json-column-write-fact.ts";
import { jsonStageConfigProofFiles, jsonWriteProofFiles } from "../lib/json-column-write-proof-fixtures.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";

/** `<tableVar>.<column>` → why a straddle is correct there, and what would end the exemption. Two-sided: a
 *  row whose column no longer straddles is RED.
 *
 *  BOTH ROWS WERE INVISIBLE UNTIL #879 added the SHORTHAND reader: `.set({ behavior, … })` /
 *  `.set({ config, … })` is a `ShorthandPropertyAssignment`, and a PropertyAssignment-only collector saw
 *  neither — so this gate reported ✓ over two live straddles, one of them the settings blob the whole
 *  #471 fix exists to protect. Neither is a defect (each reason below says why); the gate's SILENCE was. */
const MESSAGE =
  "WHOLE-RECORD REPLACE of a JSON column that ANOTHER writer merges key-wise — the replace silently undoes " +
  "the merge on the next write. The founding defect: refinery_sessions.selection, where applyFields remapped " +
  "greetingIndexes across a greeting removal while updateSession rebuilt the whole value from the client's " +
  "image (fixed in 163b93fa10; red-first at " +
  "tests/server/domain/refinery/verbs/update-session.int.test.ts). Neither writer is wrong alone; the " +
  "STRADDLE is. ARM B (#879): AND a whole-replace writer of a VERSIONED-CONFIG column (one whose `$type` is " +
  "a type `defineVersionedConfig(...)` owns) must be DOMINATED in its own function body by " +
  "`requireIntactStoredConfig(...)` — the read seam degrades an unreadable blob to schema defaults, so a " +
  "write built on it persists the stand-in and destroys the user's real blob (#471, the proven cause of the " +
  "#461 settings wipe). Dominance, not presence: a guard in a sibling branch, or after the write, absolves " +
  "nothing. A `.set(<identifier>)` on such a table is OPAQUE and judged as a whole replace.";

const FIX =
  "make the patch a DELTA and merge it key-wise onto the STORED value — the `mergeSelection` shape in " +
  "packages/server/src/domain/refinery/verbs/update-session.ts (absent = keep, null = clear, value = set), " +
  "with the merge basis read through the domain's ONE read seam. The rpg `patchSheet` / stats `mergeSheet` " +
  "helpers are the other precedents. If the replace is genuinely correct (every writer replaces), the OTHER " +
  "writer is the one to convert. ARM B: read the row and hand its `parseOutcome` to " +
  "`requireIntactStoredConfig(...)` BEFORE the write, in the same function body — " +
  "packages/server/src/domain/settings/persistence/queries.ts `writeUserConfig` is the worked shape. If the " +
  "written value genuinely never derives from a read of that row (a packaged reseed constant), add a cited " +
  "GUARD_EXEMPT row keyed `<file>#<function>` in the gate.";

export const gate = defineGate({
  id: "json-column-write-parity",
  family: "json-column-write-parity",
  authority: "reviewed-grant",
  severity: "error",
  population: {
    in: ["@db", "@server", "@contracts"],
    under: ["packages/db/src/schema/**", "packages/server/src/domain/**", "packages/contracts/src/**"],
  },
  analysis: "types",
  execution: "entire-population",
  facts: [jsonColumnWriteFact, drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const schema = ctx.fact(drizzleSchemaFact).schema();
      recordReadySchemaFact(ctx, schema);
      const analysis = ctx.fact(jsonColumnWriteFact).analyze(schema.value);
      const candidates = analysis.guardTargets
        .filter((target) => !target.dominated)
        .map((target) => ({ node: target.node, subject: target.key, operation: "versioned-config-replace" }));
      for (const [subject, writers] of analysis.writers) {
        if (!(writers.some((writer) => writer.wholeReplace) && writers.some((writer) => !writer.wholeReplace))) {
          continue;
        }
        for (const writer of writers.filter((candidate) => candidate.wholeReplace)) {
          candidates.push({ node: writer.node, subject, operation: "json-column-straddle" });
        }
      }
      reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE });
    },
  }),

  mustFlag: [
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); const current = stageViewOf(row).stageConfig; await ctx.db.update(refinerySessions).set({ stageConfig: { score: patch.score ?? current.score, rewrite: patch.rewrite ?? current.rewrite, analyze: patch.analyze ?? current.analyze } }).where(id); }",
        {
          "packages/contracts/src/stage-versioned.ts":
            'import type { StageConfig } from "./refinery/index.ts"; declare function defineVersionedConfig<T>(options: object): object; export const config = defineVersionedConfig<StageConfig>({});',
        },
      ),
      expect: { count: 1, token: "stageConfig" },
      grant: { subject: "packages/server/src/domain/refinery/verbs/stage-proof.ts#run", operation: "versioned-config-replace" },
      why: "an imported static stage heal remains historicalHeal and cannot bypass the versioned-config guard even on an otherwise keywise merge",
    },
    {
      mode: "types",
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function replace(current) { return { ...current, fields: [], greetingIndexes: [] }; } export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: replace(sessionViewOf(row).selection) }).where(id); } export async function sibling(ctx, removed, id) { const { session } = await resolveApplyBasis(ctx, id); await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(id); }",
      }),
      expect: { count: 1 },
      why: "a dead stored spread followed by fixed overrides of every owned field remains a whole replacement beside the actual remap",
    },
    {
      mode: "types",
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function replace(current, patch) { return { ...current, fields: patch.fields, greetingIndexes: patch.greetingIndexes }; } export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: replace(sessionViewOf(row).selection, patch) }).where(id); } export async function sibling(ctx, removed, id) { const { session } = await resolveApplyBasis(ctx, id); await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(id); }",
      }),
      expect: { count: 1 },
      why: "later caller assignments replace the whole stored spread and drop an omitted greeting axis instead of preserving it",
    },
    {
      mode: "types",
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function replace(current, patch: { greetingIndexes?: number[] }) { return { ...current, greetingIndexes: patch.greetingIndexes }; } export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: replace(sessionViewOf(row).selection, patch) }).where(id); } export async function sibling(ctx, removed, id) { const { session } = await resolveApplyBasis(ctx, id); await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(id); }",
      }),
      expect: { count: 1 },
      why: "preserving another field does not excuse an optional caller override that drops the unaddressed greeting axis",
    },
    {
      mode: "types",
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "export async function replace(db, row: typeof refinerySessions.$inferSelect, id) { await db.update(refinerySessions).set({ selection: row.selection }).where(id); } export async function sibling(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: mergeSelection(sessionViewOf(row).selection, patch) }).where(id); }",
      }),
      expect: { count: 1 },
      why: "an unbound schema-annotated root parameter is a caller whole snapshot, not stored provenance; its actual merging sibling still exposes the straddle",
    },
    {
      mode: "types",
      grant: { subject: "userSettings.config", operation: "json-column-straddle" },
      files: jsonWriteProofFiles({
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const userSettings = sqliteTable("user_settings", { config: text("config", { mode: "json" }), other: text("other", { mode: "json" }) });',
        "packages/server/src/domain/settings/persistence/proof.ts":
          "export async function merge(db, id) { await db.update(userSettings).set({ config: sql`json_set(\u0024{userSettings.config}, '$.theme', json('null'))` }).where(id); } export async function replace(db, snapshot, id) { await db.update(userSettings).set({ config: sql`json_set(\u0024{JSON.stringify(snapshot)}, '$.later', \u0024{userSettings.config})` }).where(id); }",
      }),
      expect: { count: 1 },
      why: "a later stored-column interpolation cannot launder a new snapshot passed as json_set's first argument",
    },
    {
      mode: "types",
      grant: { subject: "userSettings.config", operation: "json-column-straddle" },
      files: jsonWriteProofFiles({
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const userSettings = sqliteTable("user_settings", { config: text("config", { mode: "json" }), other: text("other", { mode: "json" }) });',
        "packages/server/src/domain/settings/persistence/proof.ts":
          "export async function merge(db, id) { await db.update(userSettings).set({ config: sql`json_set(\u0024{userSettings.config}, '$.theme', json('null'))` }).where(id); } export async function foreign(db, id) { const row = await readStored(db); await db.update(userSettings).set({ config: { ...row.other } }).where(id); }",
      }),
      expect: { count: 1 },
      why: "a real read of another JSON column is not preservation of the sink column",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/settings/persistence/heal.ts#run", operation: "versioned-config-replace" },
      files: jsonWriteProofFiles({
        "packages/contracts/src/settings/index.ts":
          'import type { Selection } from "../refinery/index.ts"; export const userSettingsConfig = defineVersionedConfig<Selection>({ schema: s, version: 1, lifts: {}, default: d });\n',
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; import type { Selection } from "../../../contracts/src/refinery/index.ts"; export const userSettings = sqliteTable("user_settings", { config: text("config", { mode: "json" }).$type<Selection>() });\n',
        "packages/server/src/domain/settings/persistence/heal.ts":
          'import { refinerySelectionSchema } from "../../../../../contracts/src/refinery/index.ts";\nconst parser = refinerySelectionSchema.catch(() => ({ fields: [] }));\nexport async function run(ctx, id) {\n  const row = await readStored(ctx.db);\n  await ctx.db.update(userSettings).set({ config: { ...parser.parse(row.config) } }).where(id);\n}\n',
      }),
      expect: { count: 1, token: "config" },
      why: "a historical-heal-fed versioned-config merge still owes the stand-in guard even when ARM-A proves valid-row same-column preservation",
    },
    {
      mode: "types",
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function badMerge(current, patch) { void current.fields; return { fields: patch.fields, greetingIndexes: [] }; } export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: badMerge(sessionViewOf(row).selection, patch) }).where(id); } export async function sibling(ctx, removed, id) { const { session } = await resolveApplyBasis(ctx, id); await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(id); }",
      }),
      expect: { count: 1 },
      why: "an irrelevant read of current does not preserve omitted client fields; the actual remap sibling still exposes the stale full replacement",
    },
    {
      // #1035: the straddling JSON column is a SHORTHAND member; the inline `notes.body` column keeps the
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      // derivation non-empty so the red cannot come from the blindness arm.
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst selection = text("selection", { mode: "json" });\nexport const refinerySessions = sqliteTable("refinery_sessions", { selection });\nexport const notes = sqliteTable("notes", {\n  body: text("body", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "export async function run(ctx, patch, sessionId) {\n  await ctx.db.update(refinerySessions).set({ selection: refinerySelectionSchema.parse(patch.selection) }).where(sessionId);\n}\n",
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      }),
      expect: { count: 1 },
      why: "THE #1035 SHORTHAND RED: a JSON column declared as a shorthand member still owes write parity — dropped, the straddle that undid the greeting remap would have been invisible",
    },
    {
      // #945: the straddling JSON column is IMPORTED, and a second INLINE json column keeps the derivation
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      // non-empty — so the red cannot come from the zero-result blindness arm instead of the real straddle.
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery-columns.ts":
          'import { text } from "drizzle-orm/sqlite-core";\nexport const sessionColumns = {\n  id: text("id"),\n  selection: text("selection", { mode: "json" }),\n};\n',
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nimport { sessionColumns } from "./refinery-columns";\nexport const refinerySessions = sqliteTable("refinery_sessions", sessionColumns);\nexport const notes = sqliteTable("notes", {\n  body: text("body", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "export async function run(ctx, patch, sessionId) {\n  await ctx.db.update(refinerySessions).set({ selection: refinerySelectionSchema.parse(patch.selection) }).where(sessionId);\n}\n",
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      }),
      expect: { count: 1 },
      why: "THE #945 IMPORTED-COLUMNS RED: a JSON column behind an imported columns object still owes write parity — and the inline `notes.body` column proves the red is the straddle, not the empty-derivation tripwire",
    },
    {
      mode: "types",
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const refinerySessions = sqliteTable("refinery_sessions", {\n  id: text("id"),\n  selection: text("selection", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "function parsePatch(patch) {\n  const set = {};\n  set.selection = refinerySelectionSchema.parse(patch.selection);\n  return set;\n}\nexport async function run(ctx, patch, sessionId) {\n  await ctx.db.update(refinerySessions).set({ ...parsePatch(patch) }).where(sessionId);\n}\n",
        // The live shape, faithfully: `session` is DESTRUCTURED out of an awaited resolver, not handed in
        // as a parameter. Conformance caught an earlier draft of this row that took it as a param and
        // therefore proved the opposite of the defect — the LYING-PROOF class, tooling/src/verify/gates/GATE-AUTHORING.md §5.
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      }),
      expect: { count: 1 },
      why: "THE FOUNDING DEFECT verbatim (163b93fa10): the whole-replace lives one helper hop in and reads only `patch`, while the sibling verb merges key-wise off an actual loaded-and-normalized session — the straddle that undid the greeting remap",
    },
    {
      mode: "types",
      grant: { subject: "chats.metadata", operation: "json-column-straddle" },
      files: jsonWriteProofFiles({
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/a.ts":
          "export async function a(ctx, parsed, chatId) {\n  const chat = await loadChat(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: { ...chat.metadata, group: parsed } }).where(chatId);\n}\n",
        "packages/server/src/domain/chat/verbs/b.ts":
          "export async function b(ctx, patch, chatId) {\n  await ctx.db.update(chats).set({ metadata: { ...patch.metadata } }).where(chatId);\n}\n",
      }),
      expect: { count: 1 },
      why: "the `X: { ...patch.X }` spelling of the replace — a spread of the CALLER's image is still a whole record; the spread reads nothing stored",
    },
    {
      mode: "types",
      grant: { subject: "rpgSheets.sheet", operation: "json-column-straddle" },
      files: jsonWriteProofFiles({
        "packages/db/src/schema/rpg.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const rpgSheets = sqliteTable("rpg_sheets", {\n  sheet: text("sheet", { mode: "json" }),\n});\n',
        "packages/server/src/domain/rpg/verbs/set.ts":
          "export async function set(ctx, input, id) {\n  await ctx.db.update(rpgSheets).set({ sheet: input.sheet }).where(id);\n}\n",
        "packages/server/src/domain/rpg/verbs/patch.ts":
          "export async function patchIt(ctx, input, id) {\n  const row = await load(ctx, id);\n  await ctx.db.update(rpgSheets).set({ sheet: patchSheet(row.sheet, input.delta) }).where(id);\n}\n",
      }),
      expect: { count: 1 },
      why: "the bare `X: input.X` replace beside the rpg `patchSheet` precedent — the taint test, not a name test, is what separates them",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/settings/persistence/queries.ts#writeUserConfig", operation: "versioned-config-replace" },
      files: jsonWriteProofFiles({
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n}\n",
      }),
      expect: { count: 1, token: "config" },
      why: "THE #879 ARM-B RED, and the founding #471 shape: a whole-blob writer of a versioned-config column with NO requireIntactStoredConfig anywhere — the read seam degrades, so this write persists the stand-in. It also proves the SHORTHAND spelling (`set({ config, … })`) is seen at all: the PropertyAssignment-only reader could not see the live writer",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/settings/persistence/queries.ts#writeUserConfig", operation: "versioned-config-replace" },
      files: jsonWriteProofFiles({
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  const row = await loadRow(db, ownerId);\n  if (row === undefined) {\n    requireIntactStoredConfig(userSettingsConfig.parseOutcome(row.config), 'user_settings');\n  } else {\n    await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n  }\n}\n",
      }),
      expect: { count: 1, token: "config" },
      why: "DOMINANCE, NOT PRESENCE: the guard is present in the SAME function and even in the same `if` — but in the SIBLING branch, so no execution reaching the write ever runs it. A presence test would pass this; that is the whole reason the arm is a dominance test",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/preset/persistence/writes.ts#writePresetRow", operation: "versioned-config-replace" },
      files: jsonWriteProofFiles({
        "packages/contracts/src/preset/index.ts":
          "export const promptConfigConfig = defineVersionedConfig<PromptConfig>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/preset.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }).$type<PromptConfig>().notNull(),\n});\n',
        // Deliberately a SYNTHETIC path: an example landing on a real GUARD_EXEMPT key would be absolved by
        // the table and prove nothing (it did, on the first draft of this row, against the
        // `queries.ts#updatePresetRow` entry #1026 has since deleted).
        "packages/server/src/domain/preset/persistence/writes.ts":
          "export async function writePresetRow(db, id, patch) {\n  await db.update(presets).set(patch).where(eq(presets.id, id));\n}\n",
      }),
      expect: { count: 1 },
      why: "FAIL-CLOSED (#944 posture): a `.set(<identifier>)` on a versioned-config-owning table is OPAQUE — the gate cannot read which columns it assigns — so it is JUDGED, never skipped. A silent skip is the audited escape verbatim, and `.set(patch)` is the live `updatePresetRow` shape (which since #1026 satisfies the arm with a dominating guard rather than an exemption row)",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/settings/persistence/queries.ts#seed", operation: "versioned-config-replace" },
      files: jsonWriteProofFiles({
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function seed(db, ownerId, config, at) {\n  await db.insert(userSettings).values({ userId: ownerId, config, updatedAt: at }).onConflictDoUpdate({ target: userSettings.userId, set: { config, updatedAt: at } });\n}\n",
      }),
      expect: { count: 1, token: "config" },
      why: "the UPSERT spelling: `onConflictDoUpdate({ set: { config } })` replaces an EXISTING row's blob, so it owes the guard exactly as `.set()` does. A plain `.values()` insert stays creation (a mustPass row below keeps that limit)",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ stageConfig: { ...stageViewOf(row).stageConfig } }).where(id); }",
        {
          "node_modules/typeid-js/index.d.ts":
            "export declare function fromString<T extends string>(typeId: string, prefix?: T): string; export declare class TypeID<T extends string> { static fromString<P extends string>(value: string, prefix?: P): TypeID<P>; }",
          "packages/kit/src/ids/index.ts":
            'import { TypeID } from "typeid-js"; import * as z from "zod"; export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const; export function typeIdSchema(prefix: string) { return z.string().transform((value, ctx) => { try { return TypeID.fromString(value, prefix); } catch { ctx.addIssue({ code: "custom", message: `Invalid ${prefix} id` }); return z.NEVER; } }); }',
        },
      ),
      expect: { messageIncludes: "schema operation is not the installed Zod method" },
      why: "the same installed package's boxed TypeID.fromString returns an object and is not the unboxed root export's same-string contract",
    },
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ stageConfig: { ...stageViewOf(row).stageConfig } }).where(id); }",
        {
          "packages/kit/src/ids/index.ts":
            'import * as z from "zod"; export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const; export function typeIdSchema(prefix: string): z.ZodType<string, string> { return z.string(); }',
        },
      ),
      expect: { messageIncludes: "schema operation is not the installed Zod method" },
      why: "a same-named factory returning a string schema without the prefix validator does not inherit the validating factory contract",
    },
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ stageConfig: { ...stageViewOf(row).stageConfig } }).where(id); }",
        {
          "packages/kit/src/ids/index.ts":
            'import { fromString } from "typeid-js"; import * as z from "zod"; export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const; const state = { count: 0 }; export function typeIdSchema(prefix: string) { state.count++; return z.string().transform((value, ctx) => { try { return fromString(value, prefix); } catch { ctx.addIssue({ code: "custom", message: `Invalid ${prefix} id` }); return z.NEVER; } }); }',
        },
      ),
      expect: { messageIncludes: "schema operation is not the installed Zod method" },
      why: "a factory prelude that mutates captured state cannot be ignored merely because its returned validator expression matches",
    },
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ stageConfig: { ...stageViewOf(row).stageConfig } }).where(id); }",
        {
          "packages/kit/src/ids/index.ts":
            'import * as z from "zod"; export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const; export declare function typeIdSchema(prefix: string): z.ZodType<string, string>;',
        },
      ),
      expect: { messageIncludes: "schema operation is not the installed Zod method" },
      why: "an opaque factory's ZodType annotation does not establish valid-row value preservation",
    },
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ stageConfig: { ...stageViewOf(row).stageConfig } }).where(id); }",
        {
          "packages/kit/src/ids/index.ts":
            'import { fromString } from "foreign-id"; import * as z from "zod"; export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const; export function typeIdSchema(prefix: string) { return z.string().transform((value, ctx) => { try { return fromString(value, prefix); } catch { ctx.addIssue({ code: "custom", message: `Invalid ${prefix} id` }); return z.NEVER; } }); }',
          "node_modules/foreign-id/index.d.ts": "export declare function fromString(value: string, prefix: string): string;",
        },
      ),
      expect: { messageIncludes: "schema operation is not the installed Zod method" },
      why: "a foreign same-named fromString export cannot inherit the installed TypeID validator's semantic contract",
    },
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ stageConfig: { ...stageViewOf(row).stageConfig } }).where(id); }",
        {
          "packages/kit/src/ids/index.ts":
            'import { fromString } from "typeid-js"; import * as z from "zod"; export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const; export function typeIdSchema(prefix: string) { return z.string().transform((value, ctx) => { try { return fromString(value.trim(), prefix); } catch { ctx.addIssue({ code: "custom", message: `Invalid ${prefix} id` }); return z.NEVER; } }); }',
        },
      ),
      expect: { messageIncludes: "schema operation is not the installed Zod method" },
      why: "a transform that alters the callback input before validation is not the same-value TypeID factory",
    },
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ stageConfig: { ...stageViewOf(row).stageConfig } }).where(id); }",
        {
          "packages/kit/src/ids/index.ts":
            'import { fromString } from "typeid-js"; import * as z from "zod"; export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const; export function typeIdSchema(prefix: string) { return z.string().transform((value, ctx) => { try { return fromString(value, "different_prefix"); } catch { ctx.addIssue({ code: "custom", message: `Invalid ${prefix} id` }); return z.NEVER; } }); }',
        },
      ),
      expect: { messageIncludes: "schema operation is not the installed Zod method" },
      why: "a factory cannot validate a different prefix instead of the statically bound caller prefix",
    },
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ stageConfig: { ...stageViewOf(row).stageConfig } }).where(id); }",
        {
          "packages/kit/src/ids/index.ts":
            'import { fromString } from "typeid-js"; import * as z from "zod"; export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const; export function typeIdSchema(prefix: string) { return z.string().transform((value, ctx) => { try { return fromString(value, prefix); } catch { return z.NEVER; } }); }',
        },
      ),
      expect: { messageIncludes: "schema operation is not the installed Zod method" },
      why: "dropping the Zod issue receipt is not the exact installed-validator factory error channel",
    },
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ stageConfig: { ...stageViewOf(row).stageConfig } }).where(id); }",
        {
          "packages/kit/src/ids/index.ts":
            'import { fromString } from "typeid-js"; import * as z from "zod"; export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const; const captured = { changed: false }; export function typeIdSchema(prefix: string) { return z.string().transform((value, ctx) => { try { captured.changed = true; return fromString(value, prefix); } catch { ctx.addIssue({ code: "custom", message: `Invalid ${prefix} id` }); return z.NEVER; } }); }',
        },
      ),
      expect: { messageIncludes: "schema operation is not the installed Zod method" },
      why: "a transform with a captured-state mutation before validation is not a pure same-value factory",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function merge(current, first, second) { const greetingIndexes = first.greetingIndexes === undefined ? current.greetingIndexes : (second.greetingIndexes ?? undefined); return refinerySelectionSchema.parse({ fields: first.fields ?? current.fields, ...(greetingIndexes === undefined ? {} : { greetingIndexes }) }); } export function create(ctx) { return async ({ guardPatch, valuePatch, id }) => { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: merge(sessionViewOf(row).selection, refinerySelectionPatchSchema.parse(guardPatch.selection), refinerySelectionPatchSchema.parse(valuePatch.selection)) }).where(id); }; }",
      }),
      expect: { messageIncludes: "guard and provided value name different incoming fields" },
      why: "two different members of one destructured root argument remain different callers despite identical greeting field names",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function merge(current, patch) { const greetingIndexes = patch.fields === undefined ? current.greetingIndexes : (patch.greetingIndexes ?? undefined); return refinerySelectionSchema.parse({ fields: patch.fields ?? current.fields, ...(greetingIndexes === undefined ? {} : { greetingIndexes }) }); } export function create(ctx) { return async ({ patch, id }) => { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: merge(sessionViewOf(row).selection, refinerySelectionPatchSchema.parse(patch.selection)) }).where(id); }; }",
      }),
      expect: { messageIncludes: "guard and provided value name different incoming fields" },
      why: "a destructured caller's fields guard cannot certify its nullable greeting clear/set axis",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function merge(current, first, second) { const greetingIndexes = first.greetingIndexes === undefined ? current.greetingIndexes : (second.greetingIndexes ?? undefined); return refinerySelectionSchema.parse({ fields: first.fields ?? current.fields, ...(greetingIndexes === undefined ? {} : { greetingIndexes }) }); } export function create(ctx) { return async ({ guardPatch: first, valuePatch: second, id }) => { const guardAlias = first; const valueAlias = second; const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: merge(sessionViewOf(row).selection, refinerySelectionPatchSchema.parse(guardAlias.selection), refinerySelectionPatchSchema.parse(valueAlias.selection)) }).where(id); }; }",
      }),
      expect: { messageIncludes: "guard and provided value name different incoming fields" },
      why: "renamed root bindings and immutable aliases do not collapse foreign receiver identities in the nullable clear arm",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "export function create(ctx) { return async ({ patch = {}, id }) => { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: mergeSelection(sessionViewOf(row).selection, refinerySelectionPatchSchema.parse(patch.selection)) }).where(id); }; }",
      }),
      expect: { messageIncludes: "guard and provided value name different incoming fields" },
      why: "a defaulted destructured parameter is not one proved lexical incoming-field projection",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "export function create(ctx) { return async ({ id, ...patch }) => { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: mergeSelection(sessionViewOf(row).selection, refinerySelectionPatchSchema.parse(patch.selection)) }).where(id); }; }",
      }),
      expect: { messageIncludes: "guard and provided value name different incoming fields" },
      why: "an object rest parameter cannot acquire a simple authored-key identity",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'function copy(current: import("../../../../../contracts/src/refinery/index.ts").Selection) { if (current.greetingIndexes === undefined) return current; const indexes: number[] & { filter(predicate: (value: number) => boolean): number[] } = current.greetingIndexes; return { ...current, greetingIndexes: indexes.filter((index) => index >= 0) }; } export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: copy(sessionViewOf(row).selection) }).where(id); }',
      }),
      expect: { messageIncludes: "opaque producer/view cannot certify persisted field provenance" },
      why: "a filter symbol combining a real Array declaration with a foreign member still has an unproved containing-owner identity",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'function copy(current: import("../../../../../contracts/src/refinery/index.ts").Selection) { if (current.greetingIndexes === undefined) return current; const indexes: { filter(predicate: (value: number) => boolean): number[] } = current.greetingIndexes; return { ...current, greetingIndexes: indexes.filter((index) => index >= 0) }; } export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: copy(sessionViewOf(row).selection) }).where(id); }',
      }),
      expect: { messageIncludes: "opaque producer/view cannot certify persisted field provenance" },
      why: "a foreign structural filter method does not acquire installed Array identity from its stored input",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "node_modules/@total-typescript/ts-reset/index.d.ts":
          "interface Array<T> { filter(predicate: (value: T) => unknown): T[] } interface Set<T> { has(value: T): boolean }\n",
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'import "@total-typescript/ts-reset"; class Set<T> { constructor(values: readonly T[]) { void values; } has(value: T): boolean { void value; return false; } } function copy(current: import("../../../../../contracts/src/refinery/index.ts").Selection, removed: readonly number[]) { const gone = new Set(removed); return { ...current, greetingIndexes: current.greetingIndexes.filter((index) => !gone.has(index)) }; } export async function run(ctx, removed, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: copy(sessionViewOf(row).selection, removed) }).where(id); }',
      }),
      expect: { messageIncludes: "pure same-field array remap" },
      why: "recognizing an augmented Array does not make a foreign same-named Set callback pure",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "node_modules/@total-typescript/ts-reset/index.d.ts": "interface Array<T> { filter(predicate: (value: T) => unknown): T[] }\n",
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'import "@total-typescript/ts-reset"; declare function pick(index: number): boolean; function copy(current: import("../../../../../contracts/src/refinery/index.ts").Selection) { return { ...current, greetingIndexes: current.greetingIndexes.filter(pick) }; } export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: copy(sessionViewOf(row).selection) }).where(id); }',
      }),
      expect: { messageIncludes: "pure same-field array remap" },
      why: "an opaque callback remains refused after an augmented installed filter is recognized",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "node_modules/@total-typescript/ts-reset/index.d.ts": "interface Array<T> { filter(predicate: (value: T) => unknown): T[] }\n",
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'import "@total-typescript/ts-reset"; function copy(current: import("../../../../../contracts/src/refinery/index.ts").Selection) { return { ...current, greetingIndexes: current.greetingIndexes.filter((index) => { current.fields = []; return index >= 0; }) }; } export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: copy(sessionViewOf(row).selection) }).where(id); }',
      }),
      expect: { messageIncludes: "pure same-field array remap" },
      why: "augmented collection identity does not permit a callback to mutate a sibling stored field",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "node_modules/@total-typescript/ts-reset/index.d.ts":
          "interface Promise<T> { catch<TResult = never>(rejected?: (reason: unknown) => TResult): Promise<T | TResult> }\n",
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          'import "@total-typescript/ts-reset"; async function fabricate(input: Row): Promise<Row> { return input; } export async function update(ctx, patch: Row, id) { const row = await fabricate(patch); await ctx.db.update(refinerySessions).set({ selection: mergeSelection(sessionViewOf(row).selection, {}) }).where({ id }); }\n',
      }),
      expect: { messageIncludes: "fabricated/foreign annotated row" },
      why: "recognizing an augmented library Promise does not turn a caller-wrapped annotated Row into a persisted producer",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "node_modules/@total-typescript/ts-reset/index.d.ts":
          "interface Promise<T> { catch<TResult = never>(rejected?: (reason: unknown) => TResult): Promise<T | TResult> }\n",
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          'import "@total-typescript/ts-reset"; declare function opaque(): Promise<Row | undefined>; export async function update(ctx, patch, id) { const row = await opaque(); if (row === undefined) throw new Error("missing"); await ctx.db.update(refinerySessions).set({ selection: mergeSelection(sessionViewOf(row).selection, patch) }).where({ id }); }\n',
      }),
      expect: { messageIncludes: "opaque producer/view cannot certify persisted field provenance" },
      why: "an opaque producer stays refused even when its library Promise and row-owner annotation are known",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/contracts/src/refinery/index.ts":
          'import * as z from "zod"; class Set<T> { readonly size = 0; constructor(_values: readonly T[]) {} } export const refinerySelectionSchema = z.object({ fields: z.array(z.enum(["description", "greetings"])).refine((fields) => new Set(fields).size === fields.length), greetingIndexes: z.array(z.number()).optional() }); export const refinerySelectionPatchSchema = refinerySelectionSchema; export type Selection = { fields: ("description" | "greetings")[]; greetingIndexes?: number[] | undefined };\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "export async function update(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: mergeSelection(sessionViewOf(row).selection, patch) }).where({ id }); }\n",
      }),
      expect: { messageIncludes: "unsupported refine" },
      why: "a same-spelled module-local Set constructor cannot certify the runtime Set uniqueness refinement",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/contracts/src/refinery/index.ts":
          'import * as z from "zod"; declare const Set: { new<T>(values: readonly T[]): { readonly size: number } }; export const refinerySelectionSchema = z.object({ fields: z.array(z.enum(["description", "greetings"])).refine((fields) => new Set(fields).size === fields.length), greetingIndexes: z.array(z.number()).optional() }); export const refinerySelectionPatchSchema = refinerySelectionSchema; export type Selection = { fields: ("description" | "greetings")[]; greetingIndexes?: number[] | undefined };\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "export async function update(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: mergeSelection(sessionViewOf(row).selection, patch) }).where({ id }); }\n",
      }),
      expect: { messageIncludes: "unsupported refine" },
      why: "an opaque locally declared Set value shadows the actual library constructor and must refuse",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'function merge(current: import("../../../../../contracts/src/refinery/index.ts").Selection, patch: { fields?: import("../../../../../contracts/src/refinery/index.ts").Selection["fields"]; greetingIndexes?: number[] }) { return { fields: patch.greetingIndexes === undefined ? current.fields : patch.fields, greetingIndexes: patch.greetingIndexes ?? current.greetingIndexes }; } export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: merge(sessionViewOf(row).selection, patch) }).where(id); }',
      }),
      expect: { messageIncludes: "guard and provided value name different incoming fields" },
      why: "a greeting-axis guard cannot certify the fields-axis value: patch={greetingIndexes:[1]} would drop fields",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'function merge(current: import("../../../../../contracts/src/refinery/index.ts").Selection, guardPatch: { fields?: import("../../../../../contracts/src/refinery/index.ts").Selection["fields"] }, valuePatch: { fields?: import("../../../../../contracts/src/refinery/index.ts").Selection["fields"] }) { return { fields: guardPatch.fields === undefined ? current.fields : valuePatch.fields, greetingIndexes: current.greetingIndexes }; } export async function run(ctx, guardPatch, valuePatch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: merge(sessionViewOf(row).selection, guardPatch, valuePatch) }).where(id); }',
      }),
      expect: { messageIncludes: "guard and provided value name different incoming fields" },
      why: "the same member spelling on two different caller receivers cannot certify omission preservation",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'function merge(current: import("../../../../../contracts/src/refinery/index.ts").Selection, first: { fields?: import("../../../../../contracts/src/refinery/index.ts").Selection["fields"] }, second: { fields?: import("../../../../../contracts/src/refinery/index.ts").Selection["fields"] }) { const guardAlias = first; const valueAlias = second; const guarded = guardAlias["fields"]; const supplied = valueAlias.fields; return { fields: guarded === undefined ? current.fields : supplied, greetingIndexes: current.greetingIndexes }; } export async function run(ctx, first, second, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: merge(sessionViewOf(row).selection, first, second) }).where(id); }',
      }),
      expect: { messageIncludes: "guard and provided value name different incoming fields" },
      why: "receiver/value aliases and bracket spelling do not launder a different caller root into the guard's field",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function copy(current, patch: Record<string, unknown>) { return { ...current, ...patch }; } export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: copy(sessionViewOf(row).selection, patch) }).where(id); }",
      }),
      expect: { messageIncludes: "dynamic spread can overwrite preserved fields" },
      why: "a later dynamic spread has unknown field presence and cannot inherit the earlier stored spread's preservation proof",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "declare function choose(): unknown; function copy(current) { return { ...current, greetingIndexes: choose() }; } export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: copy(sessionViewOf(row).selection) }).where(id); }",
      }),
      expect: { messageIncludes: "overridden field has an unknown omission contract" },
      why: "an unknown later field override cannot acquire preservation from the other stored fields",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function wrapper(row: typeof refinerySessions.$inferSelect): typeof refinerySessions.$inferSelect { return row; } export async function run(db, row: typeof refinerySessions.$inferSelect, id) { await db.update(refinerySessions).set({ selection: { ...wrapper(row).selection } }).where(id); }",
      }),
      expect: { messageIncludes: "fabricated/foreign annotated row" },
      why: "annotating a wrapper's return as a Row still cannot promote caller input to an actual persisted producer",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'function copy(current: import("../../../../../contracts/src/refinery/index.ts").Selection) { return { ...current, greetingIndexes: current.greetingIndexes.map((index) => { current.fields = []; return index; }) }; } export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: copy(sessionViewOf(row).selection) }).where(id); }',
      }),
      expect: { messageIncludes: "pure same-field array remap" },
      why: "a callback that mutates another stored field is not a pure remap of the addressed array field",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; import type { Values } from "../../../contracts/src/macros.ts"; export const userSettings = sqliteTable("user_settings", { config: text("config", { mode: "json" }).$type<Values>() });',
        "packages/contracts/src/macros.ts":
          'import * as z from "zod"; export const valuesSchema = z.record(z.string().transform((key) => key.toLowerCase()), z.boolean()); export type Values = z.output<typeof valuesSchema>;',
        "packages/server/src/domain/settings/persistence/proof.ts":
          'import { valuesSchema } from "../../../../../contracts/src/macros.ts"; export async function run(db, id) { const row = await readStored(db); await db.update(userSettings).set({ config: { ...valuesSchema.parse(row.config) } }).where(id); }',
      }),
      expect: { messageIncludes: "unsupported transform" },
      why: "a transformed record key is not pure validation even when the record output type is unchanged",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; import type { Values } from "../../../contracts/src/macros.ts"; export const userSettings = sqliteTable("user_settings", { config: text("config", { mode: "json" }).$type<Values>() });',
        "packages/contracts/src/macros.ts":
          'import * as z from "zod"; declare const unknownMember: z.ZodType<string>; export const valuesSchema = z.record(z.string(), z.union([z.boolean(), unknownMember])); export type Values = z.output<typeof valuesSchema>;',
        "packages/server/src/domain/settings/persistence/proof.ts":
          'import { valuesSchema } from "../../../../../contracts/src/macros.ts"; export async function run(db, id) { const row = await readStored(db); await db.update(userSettings).set({ config: { ...valuesSchema.parse(row.config) } }).where(id); }',
      }),
      expect: { messageIncludes: "schema constructor/body is opaque" },
      why: "every union branch must be proved: an opaque member cannot be laundered through a known sibling",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; import type { Values } from "../../../contracts/src/macros.ts"; export const userSettings = sqliteTable("user_settings", { config: text("config", { mode: "json" }).$type<Values>() });',
        "packages/contracts/src/macros.ts":
          'import * as z from "zod"; export const valuesSchema = z.record(z.string(), z.boolean()); export type Values = z.output<typeof valuesSchema>;',
        "packages/server/src/domain/settings/persistence/proof.ts":
          'import { valuesSchema } from "../../../../../contracts/src/macros.ts"; export async function run(db, patch, id) { const row = await readStored(db); const capture = valuesSchema.transform(() => row.config); await db.update(userSettings).set({ config: capture.parse(patch.config) }).where(id); }',
      }),
      expect: { messageIncludes: "unsupported transform" },
      why: "caller-only input does not acquit a transform that can close over the actual stored row",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'import * as z from "zod"; const changed = z.preprocess(() => ({ fields: [] }), refinerySelectionSchema); export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: { ...changed.parse(row.selection) } }).where(id); }',
      }),
      expect: { messageIncludes: "schema constructor/body is opaque" },
      why: "a preprocess body with an identical output type cannot establish valid-row preservation",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function fabricated(patch): typeof refinerySessions.$inferSelect { return { selection: refinerySelectionSchema.parse(patch.selection) }; } export async function run(ctx, patch, id) { const row = fabricated(patch); await ctx.db.update(refinerySessions).set({ selection: { ...row.selection } }).where(id); }",
      }),
      expect: { messageIncludes: "fabricated/foreign annotated row" },
      why: "a fabricated Row annotation is not an actual persisted producer",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "declare function opaqueLoad(): Promise<typeof refinerySessions.$inferSelect>; export async function run(ctx, id) { const row = await opaqueLoad(); await ctx.db.update(refinerySessions).set({ selection: { ...row.selection } }).where(id); }",
      }),
      expect: { messageIncludes: "producer/view" },
      why: "an opaque annotated load refuses instead of becoming row provenance",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'declare function opaqueView(row: typeof refinerySessions.$inferSelect): import("../../../../../contracts/src/refinery/index.ts").Selection; export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: opaqueView(row) }).where(id); }',
      }),
      expect: { messageIncludes: "producer/view" },
      why: "an opaque view cannot launder a real stored row through an unproved body",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "const changed = refinerySelectionSchema.transform(() => ({ fields: [] })); export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: { ...changed.parse(row.selection) } }).where(id); }",
      }),
      expect: { messageIncludes: "unsupported transform" },
      why: "matching output types do not authorize a transform that discards the current selection",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "const custom = { parse(value) { return { fields: [] }; } }; export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: { ...custom.parse(row.selection) } }).where(id); }",
      }),
      expect: { messageIncludes: "custom parse" },
      why: "a custom same-spelled parse is not the installed known-schema normalizer",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "const impure = refinerySelectionSchema.refine((value) => { value.fields = []; return true; }); export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: { ...impure.parse(row.selection) } }).where(id); }",
      }),
      expect: { messageIncludes: "unsupported refine" },
      why: "a value-mutating refinement refuses even if its declared schema output remains identical",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "declare function requireIntactStoredConfig(value: object): void; export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); const current = stageViewOf(row).stageConfig; requireIntactStoredConfig(current); await ctx.db.update(refinerySessions).set({ stageConfig: { score: patch.score ?? current.score, rewrite: patch.rewrite ?? current.rewrite, analyze: patch.analyze ?? current.analyze } }).where(id); }",
        {
          "packages/contracts/src/stage-versioned.ts":
            'import type { StageConfig } from "./refinery/index.ts"; declare function defineVersionedConfig<T>(options: object): object; export const config = defineVersionedConfig<StageConfig>({});',
        },
      ),
      why: "the same imported static historical-heal stage merge passes only with the existing earlier versioned-config dominance guard",
    },
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); const current = stageViewOf(row).stageConfig; await ctx.db.update(refinerySessions).set({ stageConfig: { score: patch.score ?? current.score, rewrite: patch.rewrite ?? current.rewrite, analyze: patch.analyze ?? current.analyze } }).where(id); }",
        {
          "packages/kit/src/ids/index.ts":
            'import { fromString as validateId } from "typeid-js"; import * as z from "zod"; export const ID_PREFIX = { refinerySchema: "refinery_schema" } as const; function renamedFactory(prefix: string): z.ZodType<string, string> { return z.string().transform((value, ctx) => { try { return validateId(value, prefix); } catch { ctx.addIssue({ code: "custom", message: `Invalid ${prefix} id` }); return z.NEVER; } }); } export { renamedFactory as typeIdSchema };',
        },
      ),
      why: "canonical primitive aliases and a renamed/re-exported factory still prove the actual body rather than an exported factory name",
    },
    {
      mode: "types",
      files: jsonStageConfigProofFiles(
        "export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); const current = stageViewOf(row).stageConfig; await ctx.db.update(refinerySessions).set({ stageConfig: { score: patch.score ?? current.score, rewrite: patch.rewrite ?? current.rewrite, analyze: patch.analyze ?? current.analyze } }).where(id); }",
      ),
      why: "the real nested fixed/custom stage constructor, validating TypeID factory and immutable imported read-heal default retain valid-row provenance",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function parseDestructured({ patch: incoming }, current) { const set = {}; if (incoming.selection !== undefined) set.selection = mergeSelection(current, refinerySelectionPatchSchema.parse(incoming.selection)); return set; } export async function run(ctx, input, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ ...parseDestructured(input, sessionViewOf(row).selection) }).where(id); }",
      }),
      why: "a bound destructured helper traces its actual argument and authored patch key before proving the same three-state field",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function parseActualPatch(patch, current) { const set = {}; if (patch.selection !== undefined) set.selection = mergeSelection(current, refinerySelectionPatchSchema.parse(patch.selection)); return set; } export function create(ctx) { return async ({ patch, sessionId }) => { const row = await loadOwnedSessionRow(ctx.db, sessionId); await ctx.db.update(refinerySessions).set({ ...parseActualPatch(patch, sessionViewOf(row).selection) }).where(sessionId); }; }",
      }),
      why: "the actual factory callback's destructured patch retains greeting field identity through parsed delta and three-state omission/null-clear/array merge",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function parseActualPatch(patch, current) { const set = {}; if (patch.selection !== undefined) set.selection = mergeSelection(current, refinerySelectionPatchSchema.parse(patch.selection)); return set; } export function create(ctx) { return async ({ patch: incoming, sessionId }) => { const row = await loadOwnedSessionRow(ctx.db, sessionId); await ctx.db.update(refinerySessions).set({ ...parseActualPatch(incoming, sessionViewOf(row).selection) }).where(sessionId); }; }",
      }),
      why: "a renamed object-parameter binding keeps the same original patch axis through the real three-state merge",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "node_modules/@total-typescript/ts-reset/index.d.ts":
          "interface Array<T> { filter(predicate: (value: T) => unknown): T[] } interface ReadonlyArray<T> { filter(predicate: (value: T) => unknown): T[]; includes(value: T): boolean }\n",
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'import "@total-typescript/ts-reset"; export async function run(ctx, removed, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: remapSelection(sessionViewOf(row).selection, removed) }).where(id); }',
      }),
      why: "actual loaded array field remaps remain preserving with merged filter and includes library declarations",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "node_modules/@total-typescript/ts-reset/index.d.ts":
          "interface Array<T> { filter(predicate: (value: T) => unknown): T[] } interface ReadonlyArray<T> { filter(predicate: (value: T) => unknown): T[] } interface Set<T> { has(value: T): boolean } interface ReadonlySet<T> { has(value: T): boolean }\n",
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'import "@total-typescript/ts-reset"; function liveRemap(selection: import("../../../../../contracts/src/refinery/index.ts").Selection, removed: readonly number[]) { const indexes = selection.greetingIndexes; if (indexes === undefined) return selection; const gone = new Set(removed); return { ...selection, greetingIndexes: indexes.filter((index) => !gone.has(index)).map((index) => index - removed.filter((drop) => drop < index).length) }; } export async function run(ctx, removed, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: liveRemap(sessionViewOf(row).selection, removed) }).where(id); }',
      }),
      why: "the actual filter/map and Set.has remap body preserves a genuinely loaded field under merged standard collection declarations",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "node_modules/@total-typescript/ts-reset/index.d.ts":
          "interface Promise<T> { catch<TResult = never>(rejected?: (reason: unknown) => TResult): Promise<T | TResult> }\n",
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          'import "@total-typescript/ts-reset"; export async function update(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: mergeSelection(sessionViewOf(row).selection, patch) }).where({ id }); }\n',
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: remapSelection(sessionViewOf(row).selection, removed) }).where({ id }); }\n",
      }),
      why: "augmented standard Promise wrappers preserve the actual Drizzle-loaded merge basis, not an arbitrary annotated row",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "node_modules/@total-typescript/ts-reset/index.d.ts": "export {}; declare global { interface Set<T> { has(value: T): boolean } }\n",
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          'import "@total-typescript/ts-reset"; export async function update(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: mergeSelection(sessionViewOf(row).selection, patch) }).where({ id }); }\n',
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: remapSelection(sessionViewOf(row).selection, removed) }).where({ id }); }\n",
      }),
      why: "the actual library Set keeps its trusted global identity when ts-reset adds a harmless interface augmentation beside it",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'function merge(current: import("../../../../../contracts/src/refinery/index.ts").Selection, patch: { fields?: import("../../../../../contracts/src/refinery/index.ts").Selection["fields"]; greetingIndexes?: number[] }) { const receiverAlias = patch; const guarded = receiverAlias["fields"]; const supplied = patch.fields; return { fields: guarded === undefined ? current.fields : supplied, greetingIndexes: patch.greetingIndexes ?? current.greetingIndexes }; } export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: merge(sessionViewOf(row).selection, patch) }).where(id); } export async function sibling(ctx, removed, id) { const { session } = await resolveApplyBasis(ctx, id); await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(id); }',
      }),
      why: "same-axis receiver/value aliases and bracket access resolve to the same actual incoming field and preserve omission",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'function preserve(current: import("../../../../../contracts/src/refinery/index.ts").Selection, patch: { fields?: import("../../../../../contracts/src/refinery/index.ts").Selection["fields"]; greetingIndexes?: number[] }) { return { ...current, fields: patch.fields ?? current.fields, greetingIndexes: patch.greetingIndexes ?? current.greetingIndexes }; } export async function run(ctx, patch, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: preserve(sessionViewOf(row).selection, patch) }).where(id); } export async function sibling(ctx, removed, id) { const { session } = await resolveApplyBasis(ctx, id); await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(id); }',
      }),
      why: "the ordered spread's effective fields each preserve their actual stored fallback when the client omits that axis",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "function preserve(current) { return { fields: [], greetingIndexes: [], ...current }; } export async function run(ctx, id) { const row = await loadOwnedSessionRow(ctx.db, id); await ctx.db.update(refinerySessions).set({ selection: preserve(sessionViewOf(row).selection) }).where(id); } export async function sibling(ctx, removed, id) { const { session } = await resolveApplyBasis(ctx, id); await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(id); }",
      }),
      why: "assignment order matters: the final actual stored spread restores every earlier overridden field",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          "export async function replace(db, row: typeof refinerySessions.$inferSelect, id) { const snapshot = row; await db.update(refinerySessions).set({ selection: snapshot.selection }).where(id); } export async function other(db, patch, id) { await db.update(refinerySessions).set({ selection: patch.selection }).where(id); }",
      }),
      why: "a typed root whole snapshot and another caller whole replacement do not straddle; an immutable alias does not claim a persisted origin",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; import type { Values } from "../../../contracts/src/macros.ts"; export const userSettings = sqliteTable("user_settings", { config: text("config", { mode: "json" }).$type<Values>() });',
        "packages/contracts/src/macros.ts":
          'import * as z from "zod"; const valueSchema = z.union([z.string().max(256), z.boolean(), z.array(z.string().max(256)).max(64)]); export const valuesSchema = z.record(z.string().max(128), z.record(z.string().max(128), valueSchema)); export type Values = z.output<typeof valuesSchema>;',
        "packages/server/src/domain/settings/persistence/proof.ts":
          'import { valuesSchema } from "../../../../../contracts/src/macros.ts"; export async function normalize(db, id) { const row = await readStored(db); await db.update(userSettings).set({ config: { ...valuesSchema.parse(row.config) } }).where(id); } export async function preserve(db, id) { const row = await readStored(db); await db.update(userSettings).set({ config: { ...row.config } }).where(id); }',
      }),
      why: "the actual nested macro-value record/union grammar validates every known pure branch and preserves the same stored column",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/contracts/src/settings/index.ts":
          'import type { Selection } from "../refinery/index.ts"; export const userSettingsConfig = defineVersionedConfig<Selection>({ schema: s, version: 1, lifts: {}, default: d });\n',
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; import type { Selection } from "../../../contracts/src/refinery/index.ts"; export const userSettings = sqliteTable("user_settings", { config: text("config", { mode: "json" }).$type<Selection>() });\n',
        "packages/server/src/domain/settings/persistence/heal.ts":
          'import { refinerySelectionSchema } from "../../../../../contracts/src/refinery/index.ts";\nconst parser = refinerySelectionSchema.catch(() => ({ fields: [] }));\nexport async function run(ctx, id) {\n  const row = await readStored(ctx.db);\n  requireIntactStoredConfig(userSettingsConfig.parseOutcome(row.config), "user_settings");\n  await ctx.db.update(userSettings).set({ config: { ...parser.parse(row.config) } }).where(id);\n}\n',
      }),
      why: "a historical-heal-fed versioned-config merge is admitted only after the actual existing dominance guard",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const refinerySessions = sqliteTable("refinery_sessions", { selection: text("selection", { mode: "json" }) });\n',
        "packages/server/src/domain/refinery/verbs/proof.ts":
          'function latest(legs: readonly import("../../../../../contracts/src/refinery/index.ts").Selection[]) { return { fields: legs.flatMap((leg) => leg.fields), greetingIndexes: [] }; } export async function a(ctx, legs, id) { const value = latest(legs); await ctx.db.update(refinerySessions).set({ selection: value }).where(id); } export async function b(ctx, input, id) { await ctx.db.update(refinerySessions).set({ selection: refinerySelectionSchema.parse(input.selection) }).where(id); }',
      }),
      why: "a complete reduction and a caller replacement are both whole: a local binding is not same-column preserving provenance",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst selection = text("selection", { mode: "json" });\nexport const refinerySessions = sqliteTable("refinery_sessions", { selection });\n',
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      }),
      why: "the SHORTHAND's green twin: one key-wise writer on the resolved column is not a straddle",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const refinerySessions = sqliteTable("refinery_sessions", {\n  selection: text("selection", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "function parsePatch(patch, current) {\n  const set = {};\n  set.selection = mergeSelection(current, refinerySelectionPatchSchema.parse(patch.selection));\n  return set;\n}\nexport async function run(ctx, patch, sessionId) {\n  const row = await loadOwnedSessionRow(ctx.db, sessionId);\n  await ctx.db.update(refinerySessions).set({ ...parsePatch(patch, sessionViewOf(row).selection) }).where(sessionId);\n}\n",
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      }),
      why: "THE FIX (163b93fa10) — the merge basis is passed in from a LOADED row, so the helper's `current` parameter carries the row taint and both writers are key-wise. This row is the gate's own regression pin against re-flagging the corrected shape",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", {\n  variableValues: text("variable_values", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/set.ts":
          "export async function setVars(ctx, values, chatId) {\n  await ctx.db.update(chats).set({ variableValues: values }).where(chatId);\n}\n",
        "packages/server/src/domain/chat/verbs/clear.ts":
          "export async function clearVars(ctx, chatId) {\n  await ctx.db.update(chats).set({ variableValues: null }).where(chatId);\n}\n",
      }),
      why: "the live `chats.variableValues` pair — a whole FLUSH and a CLEAR. Both replace, so there is nothing to clobber; the gate judges the STRADDLE, never the replace on its own",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/roster.ts":
          "export async function a(ctx, parsed, chatId) {\n  const chat = await loadChat(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: { ...chat.metadata, group: parsed } }).where(chatId);\n}\nexport async function b(ctx, chatId) {\n  const nextMetadata = await build(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: nextMetadata }).where(chatId);\n}\n",
      }),
      why: "the live `chats.metadata` family — seven writers, every one of them computed off a loaded row. Uniformly key-wise, so it never enters the straddle set",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/preset.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/preset/verbs/update.ts":
          "export async function upd(ctx, patch, id) {\n  await ctx.db.update(presets).set({ config: patch.config }).where(id);\n}\n",
      }),
      why: "DECLARED LIMIT — a SINGLE-writer column is never judged. A lone whole-replace is the normal, correct shape for a column only one verb owns; the defect needs a second writer to clobber",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/preset.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/preset/verbs/create.ts":
          "export async function make(ctx, input, id) {\n  const row = await loadPreset(ctx, id);\n  await ctx.db.insert(presets).values({ config: input.config });\n  await ctx.db.update(presets).set({ config: { ...row.config, seen: true } }).where(1);\n}\n",
      }),
      why: "DECLARED LIMIT — an `.insert().values()` is CREATION, not a patch: there is no stored value to clobber, so it never counts as a writer for the straddle test",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          "export async function clearTheme(ctx, id) {\n  await ctx.db.update(userSettings).set({ config: sql`json_set(\u0024{userSettings.config}, '$.theme', json('null'))` }).where(id);\n}\nexport async function writeAll(ctx, id) {\n  const row = await loadSettings(ctx, id);\n  await ctx.db.update(userSettings).set({ config: { ...row.config } }).where(id);\n}\n",
      }),
      why: "the live `userSettings.config` SQL-side merge. Conformance caught the first draft of this row: the taint test cannot see through SQL TEXT, so `json_set` read as a whole-replace and falsely straddled the sibling. The classifier now proves installed Drizzle SQL with json_set's FIRST argument bound to the SAME stored column; a property interpolation elsewhere cannot certify preservation",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  const row = await loadRow(db, ownerId);\n  if (row !== undefined) {\n    requireIntactStoredConfig(userSettingsConfig.parseOutcome(row.config), 'user_settings');\n  }\n  await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n}\n",
      }),
      why: "THE LIVE CORRECT SHAPE (`writeUserConfig`): the guard is nested inside an EARLIER statement — an ABSENT row is a legitimate first write with nothing to lose — and that still DOMINATES the write. A strict CFG dominance test would red this correct code, which is why the rule is 'the guard's own top-level statement precedes the write's'",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          "export async function clearSelectedThemeIds(db, ids, at) {\n  await db.update(userSettings).set({ config: sql`json_set(\u0024{userSettings.config}, '$.theme.selectedThemeId', json('null'))`, updatedAt: at }).where(inArray(sel, ids));\n}\n",
      }),
      why: "THE BRIEF'S OWN mustPass (theme-queries.ts:154): a key-wise `json_set` heal READS the stored value SQL-side and replaces nothing, so it is not a whole-replace writer and owes no guard. ARM B judges the REPLACE, never the merge",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function ensureUserSettings(db, ownerId, at) {\n  await db.insert(userSettings).values({ userId: ownerId, config: DEFAULT_USER_SETTINGS, updatedAt: at }).onConflictDoNothing();\n}\n",
      }),
      why: "DECLARED LIMIT, ARM B: a `.values()` insert with `onConflictDoNothing` is CREATION — it cannot overwrite an existing blob, so it owes no guard (the live `ensureUserSettings` seed). Only `onConflictDoUpdate`'s `set` object crosses into replace territory",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", {\n  extensions: text("extensions", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/server/src/domain/character/persistence/queries.ts":
          "export async function writeExtensions(db, id, extensions) {\n  await db.update(characters).set({ extensions }).where(eq(characters.id, id));\n}\n",
      }),
      why: "DECLARED LIMIT, ARM B: an ordinary json column is NOT a versioned-config column — `$type<Record<string, unknown>>` names no `defineVersionedConfig` owner, so its whole-replace writers owe nothing here. The obligation is DERIVED from the primitive, never from a path or a column-name list",
    },
    {
      mode: "types",
      files: jsonWriteProofFiles({
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n}\n",
      }),
      why: "THE ANCHOR GUARD, ARM B: no contracts package in this mini-project, so the owned-type derivation is legitimately EMPTY (§4.5) — the blindness tripwire stays silent and the same unguarded writer that reds the row above passes here. A `scope.kind` check could not tell these two apart",
    },
  ],
});
