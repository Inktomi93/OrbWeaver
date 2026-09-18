// Gate: json-column-write-parity — a JSON column with BOTH a key-wise writer and a whole-record-replace
// writer is a silent clobber. FOUNDING DEFECT (`57fb8595b`, red-first at
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
// carry the caller's taint. A root is ROW-DERIVED iff it resolves to a variable declared INSIDE a function
// (the result of a load/compute); imports, module consts, function declarations, and parameters are not.
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
  "image (fixed in 57fb8595b; red-first at " +
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
      // #1035: the straddling JSON column is a SHORTHAND member; the inline `notes.body` column keeps the
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      // derivation non-empty so the red cannot come from the blindness arm.
      mode: "types",
      files: {
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst selection = text("selection", { mode: "json" });\nexport const refinerySessions = sqliteTable("refinery_sessions", { selection });\nexport const notes = sqliteTable("notes", {\n  body: text("body", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "export async function run(ctx, patch, sessionId) {\n  await ctx.db.update(refinerySessions).set({ selection: refinerySelectionSchema.parse(patch.selection) }).where(sessionId);\n}\n",
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      expect: { count: 1 },
      why: "THE #1035 SHORTHAND RED: a JSON column declared as a shorthand member still owes write parity — dropped, the straddle that undid the greeting remap would have been invisible",
    },
    {
      // #945: the straddling JSON column is IMPORTED, and a second INLINE json column keeps the derivation
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      // non-empty — so the red cannot come from the zero-result blindness arm instead of the real straddle.
      mode: "types",
      files: {
        "packages/db/src/schema/refinery-columns.ts":
          'import { text } from "drizzle-orm/sqlite-core";\nexport const sessionColumns = {\n  id: text("id"),\n  selection: text("selection", { mode: "json" }),\n};\n',
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nimport { sessionColumns } from "./refinery-columns";\nexport const refinerySessions = sqliteTable("refinery_sessions", sessionColumns);\nexport const notes = sqliteTable("notes", {\n  body: text("body", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "export async function run(ctx, patch, sessionId) {\n  await ctx.db.update(refinerySessions).set({ selection: refinerySelectionSchema.parse(patch.selection) }).where(sessionId);\n}\n",
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      expect: { count: 1 },
      why: "THE #945 IMPORTED-COLUMNS RED: a JSON column behind an imported columns object still owes write parity — and the inline `notes.body` column proves the red is the straddle, not the empty-derivation tripwire",
    },
    {
      mode: "types",
      grant: { subject: "refinerySessions.selection", operation: "json-column-straddle" },
      files: {
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const refinerySessions = sqliteTable("refinery_sessions", {\n  id: text("id"),\n  selection: text("selection", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "function parsePatch(patch) {\n  const set = {};\n  set.selection = refinerySelectionSchema.parse(patch.selection);\n  return set;\n}\nexport async function run(ctx, patch, sessionId) {\n  await ctx.db.update(refinerySessions).set({ ...parsePatch(patch) }).where(sessionId);\n}\n",
        // The live shape, faithfully: `session` is DESTRUCTURED out of an awaited resolver, not handed in
        // as a parameter. Conformance caught an earlier draft of this row that took it as a param and
        // therefore proved the opposite of the defect — the LYING-PROOF class, tooling/src/verify/gates/GATE-AUTHORING.md §5.
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      expect: { count: 1 },
      why: "THE FOUNDING DEFECT verbatim (57fb8595b): the whole-replace lives one helper hop in and reads only `patch`, while the sibling verb merges key-wise off a LOADED session — the straddle that undid the greeting remap",
    },
    {
      mode: "types",
      grant: { subject: "chats.metadata", operation: "json-column-straddle" },
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/a.ts":
          "export async function a(ctx, parsed, chatId) {\n  const chat = await loadChat(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: { ...chat.metadata, group: parsed } }).where(chatId);\n}\n",
        "packages/server/src/domain/chat/verbs/b.ts":
          "export async function b(ctx, patch, chatId) {\n  await ctx.db.update(chats).set({ metadata: { ...patch.metadata } }).where(chatId);\n}\n",
      },
      expect: { count: 1 },
      why: "the `X: { ...patch.X }` spelling of the replace — a spread of the CALLER's image is still a whole record; the spread reads nothing stored",
    },
    {
      mode: "types",
      grant: { subject: "rpgSheets.sheet", operation: "json-column-straddle" },
      files: {
        "packages/db/src/schema/rpg.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const rpgSheets = sqliteTable("rpg_sheets", {\n  sheet: text("sheet", { mode: "json" }),\n});\n',
        "packages/server/src/domain/rpg/verbs/set.ts":
          "export async function set(ctx, input, id) {\n  await ctx.db.update(rpgSheets).set({ sheet: input.sheet }).where(id);\n}\n",
        "packages/server/src/domain/rpg/verbs/patch.ts":
          "export async function patchIt(ctx, input, id) {\n  const row = await load(ctx, id);\n  await ctx.db.update(rpgSheets).set({ sheet: patchSheet(row.sheet, input.delta) }).where(id);\n}\n",
      },
      expect: { count: 1 },
      why: "the bare `X: input.X` replace beside the rpg `patchSheet` precedent — the taint test, not a name test, is what separates them",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/settings/persistence/queries.ts#writeUserConfig", operation: "versioned-config-replace" },
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n}\n",
      },
      expect: { count: 1, token: "config" },
      why: "THE #879 ARM-B RED, and the founding #471 shape: a whole-blob writer of a versioned-config column with NO requireIntactStoredConfig anywhere — the read seam degrades, so this write persists the stand-in. It also proves the SHORTHAND spelling (`set({ config, … })`) is seen at all: the PropertyAssignment-only reader could not see the live writer",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/settings/persistence/queries.ts#writeUserConfig", operation: "versioned-config-replace" },
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  const row = await loadRow(db, ownerId);\n  if (row === undefined) {\n    requireIntactStoredConfig(userSettingsConfig.parseOutcome(row.config), 'user_settings');\n  } else {\n    await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n  }\n}\n",
      },
      expect: { count: 1, token: "config" },
      why: "DOMINANCE, NOT PRESENCE: the guard is present in the SAME function and even in the same `if` — but in the SIBLING branch, so no execution reaching the write ever runs it. A presence test would pass this; that is the whole reason the arm is a dominance test",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/preset/persistence/writes.ts#writePresetRow", operation: "versioned-config-replace" },
      files: {
        "packages/contracts/src/preset/index.ts":
          "export const promptConfigConfig = defineVersionedConfig<PromptConfig>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/preset.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }).$type<PromptConfig>().notNull(),\n});\n',
        // Deliberately a SYNTHETIC path: an example landing on a real GUARD_EXEMPT key would be absolved by
        // the table and prove nothing (it did, on the first draft of this row, against the
        // `queries.ts#updatePresetRow` entry #1026 has since deleted).
        "packages/server/src/domain/preset/persistence/writes.ts":
          "export async function writePresetRow(db, id, patch) {\n  await db.update(presets).set(patch).where(eq(presets.id, id));\n}\n",
      },
      expect: { count: 1 },
      why: "FAIL-CLOSED (#944 posture): a `.set(<identifier>)` on a versioned-config-owning table is OPAQUE — the gate cannot read which columns it assigns — so it is JUDGED, never skipped. A silent skip is the audited escape verbatim, and `.set(patch)` is the live `updatePresetRow` shape (which since #1026 satisfies the arm with a dominating guard rather than an exemption row)",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/settings/persistence/queries.ts#seed", operation: "versioned-config-replace" },
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function seed(db, ownerId, config, at) {\n  await db.insert(userSettings).values({ userId: ownerId, config, updatedAt: at }).onConflictDoUpdate({ target: userSettings.userId, set: { config, updatedAt: at } });\n}\n",
      },
      expect: { count: 1, token: "config" },
      why: "the UPSERT spelling: `onConflictDoUpdate({ set: { config } })` replaces an EXISTING row's blob, so it owes the guard exactly as `.set()` does. A plain `.values()` insert stays creation (a mustPass row below keeps that limit)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst selection = text("selection", { mode: "json" });\nexport const refinerySessions = sqliteTable("refinery_sessions", { selection });\n',
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      why: "the SHORTHAND's green twin: one key-wise writer on the resolved column is not a straddle",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/refinery.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const refinerySessions = sqliteTable("refinery_sessions", {\n  selection: text("selection", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "function parsePatch(patch, current) {\n  const set = {};\n  set.selection = mergeSelection(current, refinerySelectionPatchSchema.parse(patch.selection));\n  return set;\n}\nexport async function run(ctx, patch, sessionId) {\n  const row = await loadOwnedSessionRow(ctx.db, sessionId);\n  await ctx.db.update(refinerySessions).set({ ...parsePatch(patch, sessionViewOf(row).selection) }).where(sessionId);\n}\n",
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      why: "THE FIX (57fb8595b) — the merge basis is passed in from a LOADED row, so the helper's `current` parameter carries the row taint and both writers are key-wise. This row is the gate's own regression pin against re-flagging the corrected shape",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", {\n  variableValues: text("variable_values", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/set.ts":
          "export async function setVars(ctx, values, chatId) {\n  await ctx.db.update(chats).set({ variableValues: values }).where(chatId);\n}\n",
        "packages/server/src/domain/chat/verbs/clear.ts":
          "export async function clearVars(ctx, chatId) {\n  await ctx.db.update(chats).set({ variableValues: null }).where(chatId);\n}\n",
      },
      why: "the live `chats.variableValues` pair — a whole FLUSH and a CLEAR. Both replace, so there is nothing to clobber; the gate judges the STRADDLE, never the replace on its own",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/roster.ts":
          "export async function a(ctx, parsed, chatId) {\n  const chat = await loadChat(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: { ...chat.metadata, group: parsed } }).where(chatId);\n}\nexport async function b(ctx, chatId) {\n  const nextMetadata = await build(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: nextMetadata }).where(chatId);\n}\n",
      },
      why: "the live `chats.metadata` family — seven writers, every one of them computed off a loaded row. Uniformly key-wise, so it never enters the straddle set",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/preset.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/preset/verbs/update.ts":
          "export async function upd(ctx, patch, id) {\n  await ctx.db.update(presets).set({ config: patch.config }).where(id);\n}\n",
      },
      why: "DECLARED LIMIT — a SINGLE-writer column is never judged. A lone whole-replace is the normal, correct shape for a column only one verb owns; the defect needs a second writer to clobber",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/preset.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/preset/verbs/create.ts":
          "export async function make(ctx, input, id) {\n  const row = await loadPreset(ctx, id);\n  await ctx.db.insert(presets).values({ config: input.config });\n  await ctx.db.update(presets).set({ config: { ...row.config, seen: true } }).where(1);\n}\n",
      },
      why: "DECLARED LIMIT — an `.insert().values()` is CREATION, not a patch: there is no stored value to clobber, so it never counts as a writer for the straddle test",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          "export async function clearTheme(ctx, id) {\n  await ctx.db.update(userSettings).set({ config: sql`json_set(\u0024{userSettings.config}, '$.theme', json('null'))` }).where(id);\n}\nexport async function writeAll(ctx, id) {\n  const row = await loadSettings(ctx, id);\n  await ctx.db.update(userSettings).set({ config: { ...row.config } }).where(id);\n}\n",
      },
      why: "the live `userSettings.config` SQL-side merge. Conformance caught the first draft of this row: the taint test cannot see through SQL TEXT, so `json_set` read as a whole-replace and falsely straddled the sibling. The classifier now recognises a `sql` tagged template that interpolates a COLUMN reference as the read it is. DECLARED LIMIT — that is a SHAPE test, not SQL comprehension: a `sql` template that genuinely overwrites the column without reading it would be misread as key-wise",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  const row = await loadRow(db, ownerId);\n  if (row !== undefined) {\n    requireIntactStoredConfig(userSettingsConfig.parseOutcome(row.config), 'user_settings');\n  }\n  await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n}\n",
      },
      why: "THE LIVE CORRECT SHAPE (`writeUserConfig`): the guard is nested inside an EARLIER statement — an ABSENT row is a legitimate first write with nothing to lose — and that still DOMINATES the write. A strict CFG dominance test would red this correct code, which is why the rule is 'the guard's own top-level statement precedes the write's'",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          "export async function clearSelectedThemeIds(db, ids, at) {\n  await db.update(userSettings).set({ config: sql`json_set(\u0024{userSettings.config}, '$.theme.selectedThemeId', json('null'))`, updatedAt: at }).where(inArray(sel, ids));\n}\n",
      },
      why: "THE BRIEF'S OWN mustPass (theme-queries.ts:154): a key-wise `json_set` heal READS the stored value SQL-side and replaces nothing, so it is not a whole-replace writer and owes no guard. ARM B judges the REPLACE, never the merge",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function ensureUserSettings(db, ownerId, at) {\n  await db.insert(userSettings).values({ userId: ownerId, config: DEFAULT_USER_SETTINGS, updatedAt: at }).onConflictDoNothing();\n}\n",
      },
      why: "DECLARED LIMIT, ARM B: a `.values()` insert with `onConflictDoNothing` is CREATION — it cannot overwrite an existing blob, so it owes no guard (the live `ensureUserSettings` seed). Only `onConflictDoUpdate`'s `set` object crosses into replace territory",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", {\n  extensions: text("extensions", { mode: "json" }).$type<Record<string, unknown>>(),\n});\n',
        "packages/contracts/src/settings/index.ts":
          "export const userSettingsConfig = defineVersionedConfig<UserSettings>({ schema: s, version: 1, lifts: {}, default: d });\n",
        "packages/server/src/domain/character/persistence/queries.ts":
          "export async function writeExtensions(db, id, extensions) {\n  await db.update(characters).set({ extensions }).where(eq(characters.id, id));\n}\n",
      },
      why: "DECLARED LIMIT, ARM B: an ordinary json column is NOT a versioned-config column — `$type<Record<string, unknown>>` names no `defineVersionedConfig` owner, so its whole-replace writers owe nothing here. The obligation is DERIVED from the primitive, never from a path or a column-name list",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }).$type<UserSettings>().notNull(),\n});\n',
        "packages/server/src/domain/settings/persistence/queries.ts":
          "export async function writeUserConfig(db, ownerId, config, at) {\n  await db.update(userSettings).set({ config, updatedAt: at }).where(eq(userSettings.userId, ownerId));\n}\n",
      },
      why: "THE ANCHOR GUARD, ARM B: no contracts package in this mini-project, so the owned-type derivation is legitimately EMPTY (§4.5) — the blindness tripwire stays silent and the same unguarded writer that reds the row above passes here. A `scope.kind` check could not tell these two apart",
    },
  ],
});
