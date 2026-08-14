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
// so a shape/name matcher would have passed the defect (a LYING PROOF, GATE-AUTHORING.md §5). The taint
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
// DECLARED LIMITS (each has a mustPass row): a column with ONE writer is never judged (there is nothing to
// straddle); an `.insert()`/`.values()` is creation, not a patch; a writer reached through more than one
// helper hop, or through a `db.run(sql\`json_set(...)\`)`, is not classified.
import type { CallExpression, FunctionDeclaration, ObjectLiteralExpression, SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract.ts";

/** `<tableVar>.<column>` → why a straddle is correct there, and what would end the exemption. Two-sided: a
 *  row whose column no longer straddles is RED. EMPTY — the founding straddle was fixed in `57fb8595b`, and
 *  the derivation finds no other on the tree today. */
const ALLOWLIST: ExemptionTable = {};

const MESSAGE =
  "WHOLE-RECORD REPLACE of a JSON column that ANOTHER writer merges key-wise — the replace silently undoes " +
  "the merge on the next write. The founding defect: refinery_sessions.selection, where applyFields remapped " +
  "greetingIndexes across a greeting removal while updateSession rebuilt the whole value from the client's " +
  "image (fixed in 57fb8595b; red-first at " +
  "tests/server/domain/refinery/verbs/update-session.int.test.ts). Neither writer is wrong alone; the " +
  "STRADDLE is.";

const FIX =
  "make the patch a DELTA and merge it key-wise onto the STORED value — the `mergeSelection` shape in " +
  "packages/server/src/domain/refinery/verbs/update-session.ts (absent = keep, null = clear, value = set), " +
  "with the merge basis read through the domain's ONE read seam. The rpg `patchSheet` / stats `mergeSheet` " +
  "helpers are the other precedents. If the replace is genuinely correct (every writer replaces), the OTHER " +
  "writer is the one to convert.";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry names a JSON column that no longer straddles (its writers agree now, or one of them was " +
  "deleted) — a standing exemption for a site that is gone is a loaded gun: delete the stale row in " +
  "json-column-write-parity.ts: ";

const BLIND_MESSAGE =
  'DERIVED NOTHING — no `text(..., { mode: "json" })` column was found in packages/db/src/schema/** on a ' +
  "tree that HAS a db schema. The column derivation is this gate's whole basis, so a green verdict here " +
  "would be a placebo (GATE-AUTHORING.md §4.6). Re-point the derivation at the schema's current spelling: " +
  "scripts/check/gates/json-column-write-parity.ts";

const GATE_SELF = "scripts/check/gates/json-column-write-parity.ts";
const SCHEMA_DIR = "/packages/db/src/schema/";
const DOMAIN_DIR = "/packages/server/src/domain/";
const JSON_MODE_RE = /mode:\s*"json"/u;

interface Writer {
  readonly node: TsNode;
  readonly wholeReplace: boolean;
}

/** Every drizzle table variable → the names of its `mode: "json"` columns. Derived from the schema package,
 *  never hand-listed. */
function jsonColumnsOf(init: TsNode): ReadonlySet<string> {
  const cols = new Set<string>();
  for (const pa of init.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (JSON_MODE_RE.test(pa.getInitializer()?.getText() ?? "")) {
      cols.add(pa.getName());
    }
  }
  return cols;
}

function deriveJsonColumns(files: readonly SourceFile[]): Map<string, ReadonlySet<string>> {
  const out = new Map<string, ReadonlySet<string>>();
  for (const sf of files.filter((f) => f.getFilePath().includes(SCHEMA_DIR))) {
    for (const decl of sf.getVariableDeclarations()) {
      const init = decl.getInitializer();
      const cols = init === undefined || !init.getText().startsWith("sqliteTable(") ? undefined : jsonColumnsOf(init);
      if (cols !== undefined && cols.size > 0) {
        out.set(decl.getName(), cols);
      }
    }
  }
  return out;
}

/** The table variable a `.set(` call updates — walk the fluent chain back to `.update(<table>)`. */
function updatedTable(setCallee: TsNode): string | undefined {
  let cur: TsNode = setCallee;
  let table: string | undefined;
  while (table === undefined && (Node.isCallExpression(cur) || Node.isPropertyAccessExpression(cur))) {
    if (Node.isCallExpression(cur)) {
      const callee = cur.getExpression();
      table = Node.isPropertyAccessExpression(callee) && callee.getName() === "update" ? (cur.getArguments()[0]?.getText() ?? "") : undefined;
      cur = callee;
    } else {
      cur = cur.getExpression();
    }
  }
  return table === "" ? undefined : table;
}

/** Identifier NODES read as VALUES in `node` — property NAMES (`x.selection`'s `selection`) and call
 *  CALLEES (`mergeSelection(…)`) are not value reads and are excluded, or every local helper would look
 *  like data. Nodes, not names: each is classified from its OWN declaration, never by a same-name sweep of
 *  the file (which would resolve a shadowed local to the wrong binding). */
function valueRoots(node: TsNode): TsNode[] {
  if (Node.isIdentifier(node)) {
    return [node];
  }
  const out: TsNode[] = [];
  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const parent = id.getParent();
    if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) {
      continue;
    }
    if (Node.isCallExpression(parent) && parent.getExpression() === id) {
      continue;
    }
    out.push(id);
  }
  return out;
}

/** Is this identifier a value READ FROM THE ROW — i.e. bound by a `const`/`let` INSIDE a function body (a
 *  load result, or something destructured out of one: `const { session } = await resolveApplyBasis(…)` is
 *  the live shape and a BindingElement, NOT a VariableDeclaration, is what a destructure resolves to).
 *  Imports, module consts, function declarations and PARAMETERS — including a destructured parameter
 *  binding (`({ values }: SetVariablesParams)`, the live `chats.variableValues` writer) — are caller-side
 *  or static and never make a write key-wise. */
function isRowDerived(id: TsNode): boolean {
  if (!Node.isIdentifier(id)) {
    return false;
  }
  for (const def of id.getDefinitionNodes()) {
    if (def.getFirstAncestorByKind(SyntaxKind.Parameter) !== undefined || Node.isParameterDeclaration(def)) {
      continue;
    }
    const varDecl = Node.isVariableDeclaration(def) ? def : def.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (varDecl !== undefined && varDecl.getFirstAncestorByKind(SyntaxKind.Block) !== undefined) {
      return true;
    }
  }
  return false;
}

/** Every JSON-column assignment reachable from a `.set()` argument, classified. `paramTaint` carries the
 *  ONE helper hop: when the argument spreads `helper(a, b)`, each of `helper`'s parameters inherits whether
 *  its call-site argument was row-derived, so an assignment inside the helper is key-wise only if it READS
 *  a tainted parameter. */
interface Sink {
  readonly cols: ReadonlySet<string>;
  readonly out: Writer[];
}

function collectFromObject(obj: ObjectLiteralExpression, sink: Sink, paramTaint: ReadonlyMap<string, boolean>, hop: number): void {
  for (const prop of obj.getProperties()) {
    if (Node.isSpreadAssignment(prop)) {
      collectWriters(prop.getExpression(), sink, paramTaint, hop);
    } else if (Node.isPropertyAssignment(prop) && sink.cols.has(prop.getName())) {
      const rhs = prop.getInitializer();
      sink.out.push({ node: prop, wholeReplace: rhs === undefined || !isKeyWise(rhs, paramTaint) });
    }
  }
}

function collectWriters(arg: TsNode | undefined, sink: Sink, paramTaint: ReadonlyMap<string, boolean>, hop: number): void {
  if (arg === undefined) {
    return;
  }
  if (Node.isParenthesizedExpression(arg)) {
    collectWriters(arg.getExpression(), sink, paramTaint, hop);
  } else if (Node.isConditionalExpression(arg)) {
    collectWriters(arg.getWhenTrue(), sink, paramTaint, hop);
    collectWriters(arg.getWhenFalse(), sink, paramTaint, hop);
  } else if (Node.isObjectLiteralExpression(arg)) {
    collectFromObject(arg, sink, paramTaint, hop);
  } else if (Node.isCallExpression(arg) && hop < 1) {
    descendHelper(arg, sink, hop);
  }
}

/** The helper's parameters, each carrying whether ITS call-site argument was row-derived. */
function paramTaintOf(def: FunctionDeclaration, args: readonly TsNode[]): ReadonlyMap<string, boolean> {
  const next = new Map<string, boolean>();
  def.getParameters().forEach((param, i) => {
    const actual = args[i];
    next.set(param.getName(), actual !== undefined && valueRoots(actual).some(isRowDerived));
  });
  return next;
}

/** The helper's accumulator shape (`const set: Partial<…> = {}; set.selection = …; return set;`) — the live
 *  `parsePatch` spelling. */
function collectFromAccumulator(def: FunctionDeclaration, sink: Sink, taint: ReadonlyMap<string, boolean>): void {
  for (const bin of def.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    const lhs = bin.getLeft();
    if (bin.getOperatorToken().getText() === "=" && Node.isPropertyAccessExpression(lhs) && sink.cols.has(lhs.getName())) {
      sink.out.push({ node: bin, wholeReplace: !isKeyWise(bin.getRight(), taint) });
    }
  }
}

/** One hop into a locally-declared helper the `.set()` argument spreads. The caller's `paramTaint` does
 *  NOT carry in: the helper opens a new scope, and its parameters are re-derived from THIS call's
 *  arguments (which is the whole point — only the params the assignment reads inherit the taint). */
function descendHelper(call: CallExpression, sink: Sink, hop: number): void {
  const callee = call.getExpression();
  if (!Node.isIdentifier(callee)) {
    return;
  }
  const args = call.getArguments();
  for (const def of callee.getDefinitionNodes()) {
    if (!Node.isFunctionDeclaration(def)) {
      continue;
    }
    const taint = paramTaintOf(def, args);
    collectFromAccumulator(def, sink, taint);
    for (const ret of def.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
      collectWriters(ret.getExpression(), sink, taint, hop + 1);
    }
  }
}

/** A drizzle `sql` tagged template that interpolates a COLUMN reference is reading the stored value
 *  SQL-side (`sql\`json_set(${userSettings.config}, …)\`` — the live theme-clear writer). The taint test
 *  cannot see through SQL text, so the column reference is what stands in for the read. */
function isSqlColumnMerge(rhs: TsNode): boolean {
  return (
    Node.isTaggedTemplateExpression(rhs) &&
    rhs.getTag().getText() === "sql" &&
    rhs.getTemplate().getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).length > 0
  );
}

/** Does this value expression depend on something read from the row? */
function isKeyWise(rhs: TsNode, paramTaint: ReadonlyMap<string, boolean>): boolean {
  return isSqlColumnMerge(rhs) || valueRoots(rhs).some((root) => paramTaint.get(root.getText()) === true || isRowDerived(root));
}

const EMPTY_TAINT: ReadonlyMap<string, boolean> = new Map();

/** The column a collected writer assigns — a `metadata: …` property, or a `set.metadata = …` accumulator
 *  assignment (whose LHS is the property access). */
function columnOf(w: Writer): string {
  if (Node.isPropertyAssignment(w.node)) {
    return w.node.getName();
  }
  const lhs = Node.isBinaryExpression(w.node) ? w.node.getLeft() : undefined;
  return Node.isPropertyAccessExpression(lhs) ? lhs.getName() : "";
}

/** The JSON-column-bearing table this call updates, if it is a `db.update(<table>).set(…)` at all. */
function jsonTableOf(
  call: CallExpression,
  jsonColumns: ReadonlyMap<string, ReadonlySet<string>>,
): { readonly table: string; readonly cols: ReadonlySet<string> } | undefined {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "set") {
    return;
  }
  const table = updatedTable(callee.getExpression());
  const cols = table === undefined ? undefined : jsonColumns.get(table);
  return table === undefined || cols === undefined ? undefined : { table, cols };
}

/** Every `<table>.<column>` a domain `.set()` writes → its classified writers. */
function collectByColumn(files: readonly SourceFile[], jsonColumns: ReadonlyMap<string, ReadonlySet<string>>): Map<string, Writer[]> {
  const byColumn = new Map<string, Writer[]>();
  for (const sf of files.filter((f) => f.getFilePath().includes(DOMAIN_DIR))) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const target = jsonTableOf(call, jsonColumns);
      if (target === undefined) {
        continue;
      }
      const found: Writer[] = [];
      collectWriters(call.getArguments()[0], { cols: target.cols, out: found }, EMPTY_TAINT, 0);
      for (const w of found) {
        const key = `${target.table}.${columnOf(w)}`;
        byColumn.set(key, [...(byColumn.get(key) ?? []), w]);
      }
    }
  }
  return byColumn;
}

export const gate: GateDescriptor = {
  name: "json-column-write-parity",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // the verdict is a comparison ACROSS a column's writers, which live in different files
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes("packages/db/src/schema/") || p.includes("packages/server/src/domain/"),

  run: (ctx) => {
    const files = ctx.project.getSourceFiles().filter((f) => f.getFilePath().includes(SCHEMA_DIR) || f.getFilePath().includes(DOMAIN_DIR));
    const jsonColumns = deriveJsonColumns(files);
    if (jsonColumns.size === 0) {
      if (files.some((f) => f.getFilePath().includes(SCHEMA_DIR))) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_MESSAGE });
      }
      return; // a synthetic mini-project with no schema at all is a legitimate zero (§4.5)
    }

    const byColumn = collectByColumn(files, jsonColumns);
    const seenAllowlisted = new Set<string>();
    for (const [key, writers] of byColumn) {
      const straddles = writers.some((w) => w.wholeReplace) && writers.some((w) => !w.wholeReplace);
      if (!straddles) {
        continue;
      }
      if (key in ALLOWLIST) {
        seenAllowlisted.add(key);
        continue;
      }
      for (const w of writers.filter((x) => x.wholeReplace)) {
        ctx.report(w.node);
      }
    }
    for (const key of Object.keys(ALLOWLIST)) {
      if (!seenAllowlisted.has(key)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `${STALE_ENTRY_MESSAGE_PREFIX}"${key}" — scripts/check/gates/json-column-write-parity.ts` });
      }
    }
  },

  mustFlag: [
    {
      files: {
        "packages/db/src/schema/refinery.ts":
          'export const refinerySessions = sqliteTable("refinery_sessions", {\n  id: text("id"),\n  selection: text("selection", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "function parsePatch(patch) {\n  const set = {};\n  set.selection = refinerySelectionSchema.parse(patch.selection);\n  return set;\n}\nexport async function run(ctx, patch, sessionId) {\n  await ctx.db.update(refinerySessions).set({ ...parsePatch(patch) }).where(sessionId);\n}\n",
        // The live shape, faithfully: `session` is DESTRUCTURED out of an awaited resolver, not handed in
        // as a parameter. Conformance caught an earlier draft of this row that took it as a param and
        // therefore proved the opposite of the defect — the LYING-PROOF class, GATE-AUTHORING.md §5.
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      expect: { count: 1 },
      why: "THE FOUNDING DEFECT verbatim (57fb8595b): the whole-replace lives one helper hop in and reads only `patch`, while the sibling verb merges key-wise off a LOADED session — the straddle that undid the greeting remap",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts": 'export const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/a.ts":
          "export async function a(ctx, parsed, chatId) {\n  const chat = await loadChat(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: { ...chat.metadata, group: parsed } }).where(chatId);\n}\n",
        "packages/server/src/domain/chat/verbs/b.ts":
          "export async function b(ctx, patch, chatId) {\n  await ctx.db.update(chats).set({ metadata: { ...patch.metadata } }).where(chatId);\n}\n",
      },
      expect: { count: 1 },
      why: "the `X: { ...patch.X }` spelling of the replace — a spread of the CALLER's image is still a whole record; the spread reads nothing stored",
    },
    {
      files: {
        "packages/db/src/schema/rpg.ts": 'export const rpgSheets = sqliteTable("rpg_sheets", {\n  sheet: text("sheet", { mode: "json" }),\n});\n',
        "packages/server/src/domain/rpg/verbs/set.ts":
          "export async function set(ctx, input, id) {\n  await ctx.db.update(rpgSheets).set({ sheet: input.sheet }).where(id);\n}\n",
        "packages/server/src/domain/rpg/verbs/patch.ts":
          "export async function patchIt(ctx, input, id) {\n  const row = await load(ctx, id);\n  await ctx.db.update(rpgSheets).set({ sheet: patchSheet(row.sheet, input.delta) }).where(id);\n}\n",
      },
      expect: { count: 1 },
      why: "the bare `X: input.X` replace beside the rpg `patchSheet` precedent — the taint test, not a name test, is what separates them",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/refinery.ts":
          'export const refinerySessions = sqliteTable("refinery_sessions", {\n  selection: text("selection", { mode: "json" }),\n});\n',
        "packages/server/src/domain/refinery/verbs/update-session.ts":
          "function parsePatch(patch, current) {\n  const set = {};\n  set.selection = mergeSelection(current, refinerySelectionPatchSchema.parse(patch.selection));\n  return set;\n}\nexport async function run(ctx, patch, sessionId) {\n  const row = await loadOwnedSessionRow(ctx.db, sessionId);\n  await ctx.db.update(refinerySessions).set({ ...parsePatch(patch, sessionViewOf(row).selection) }).where(sessionId);\n}\n",
        "packages/server/src/domain/refinery/verbs/apply-fields.ts":
          "export async function apply(ctx, removed, sessionId) {\n  const { session } = await resolveApplyBasis(ctx, sessionId);\n  await ctx.db.update(refinerySessions).set({ selection: remapSelection(session.selection, removed) }).where(sessionId);\n}\n",
      },
      why: "THE FIX (57fb8595b) — the merge basis is passed in from a LOADED row, so the helper's `current` parameter carries the row taint and both writers are key-wise. This row is the gate's own regression pin against re-flagging the corrected shape",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts": 'export const chats = sqliteTable("chats", {\n  variableValues: text("variable_values", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/set.ts":
          "export async function setVars(ctx, values, chatId) {\n  await ctx.db.update(chats).set({ variableValues: values }).where(chatId);\n}\n",
        "packages/server/src/domain/chat/verbs/clear.ts":
          "export async function clearVars(ctx, chatId) {\n  await ctx.db.update(chats).set({ variableValues: null }).where(chatId);\n}\n",
      },
      why: "the live `chats.variableValues` pair — a whole FLUSH and a CLEAR. Both replace, so there is nothing to clobber; the gate judges the STRADDLE, never the replace on its own",
    },
    {
      files: {
        "packages/db/src/schema/chat.ts": 'export const chats = sqliteTable("chats", {\n  metadata: text("metadata", { mode: "json" }),\n});\n',
        "packages/server/src/domain/chat/verbs/roster.ts":
          "export async function a(ctx, parsed, chatId) {\n  const chat = await loadChat(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: { ...chat.metadata, group: parsed } }).where(chatId);\n}\nexport async function b(ctx, chatId) {\n  const nextMetadata = await build(ctx, chatId);\n  await ctx.db.update(chats).set({ metadata: nextMetadata }).where(chatId);\n}\n",
      },
      why: "the live `chats.metadata` family — seven writers, every one of them computed off a loaded row. Uniformly key-wise, so it never enters the straddle set",
    },
    {
      files: {
        "packages/db/src/schema/preset.ts": 'export const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/preset/verbs/update.ts":
          "export async function upd(ctx, patch, id) {\n  await ctx.db.update(presets).set({ config: patch.config }).where(id);\n}\n",
      },
      why: "DECLARED LIMIT — a SINGLE-writer column is never judged. A lone whole-replace is the normal, correct shape for a column only one verb owns; the defect needs a second writer to clobber",
    },
    {
      files: {
        "packages/db/src/schema/preset.ts": 'export const presets = sqliteTable("presets", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/preset/verbs/create.ts":
          "export async function make(ctx, input, id) {\n  const row = await loadPreset(ctx, id);\n  await ctx.db.insert(presets).values({ config: input.config });\n  await ctx.db.update(presets).set({ config: { ...row.config, seen: true } }).where(1);\n}\n",
      },
      why: "DECLARED LIMIT — an `.insert().values()` is CREATION, not a patch: there is no stored value to clobber, so it never counts as a writer for the straddle test",
    },
    {
      files: {
        "packages/db/src/schema/settings.ts": 'export const userSettings = sqliteTable("user_settings", {\n  config: text("config", { mode: "json" }),\n});\n',
        "packages/server/src/domain/settings/persistence/theme-queries.ts":
          "export async function clearTheme(ctx, id) {\n  await ctx.db.update(userSettings).set({ config: sql`json_set(\u0024{userSettings.config}, '$.theme', json('null'))` }).where(id);\n}\nexport async function writeAll(ctx, id) {\n  const row = await loadSettings(ctx, id);\n  await ctx.db.update(userSettings).set({ config: { ...row.config } }).where(id);\n}\n",
      },
      why: "the live `userSettings.config` SQL-side merge. Conformance caught the first draft of this row: the taint test cannot see through SQL TEXT, so `json_set` read as a whole-replace and falsely straddled the sibling. The classifier now recognises a `sql` tagged template that interpolates a COLUMN reference as the read it is. DECLARED LIMIT — that is a SHAPE test, not SQL comprehension: a `sql` template that genuinely overwrites the column without reading it would be misread as key-wise",
    },
  ],
};
