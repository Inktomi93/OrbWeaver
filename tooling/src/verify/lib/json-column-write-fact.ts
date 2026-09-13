// Shared JSON-column writer analysis. Gate policies consume this reader instead of discovering or walking the compiler project.
import type { Block, CallExpression, FunctionDeclaration, ObjectLiteralExpression, SourceFile, Statement, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { SchemaModel } from "../contract/schema-fact.ts";

const DOMAIN_DIR = "/packages/server/src/domain/";
const CONTRACTS_DIR = "/packages/contracts/src/";

// ── ARM B: the versioned-config dominance arm (#879) ───────────────────────────────────────────────────
const DEFINE_VERSIONED_CONFIG = "defineVersionedConfig";
const GUARD_CALLEE = "requireIntactStoredConfig";
const CONFLICT_UPDATE = "onConflictDoUpdate";
const CONFLICT_SET_KEY = "set";
/** The exemption-key name for a write with no enclosing function / no readable one. */
const TOP_LEVEL_SITE = "(top-level)";
const ANONYMOUS_SITE = "(anonymous)";
/** How much of an OPAQUE `.set(<expr>)` the finding quotes as its position token. */
const OPAQUE_TOKEN_CHARS = 40;
/** The real-tree anchor ARM B's stale sweep guards on (§4.5) — the db schema barrel, present on every real
 *  run and needed by no example here. */
export const JSON_SCHEMA_ANCHOR = "packages/db/src/schema/index.ts";
/** The resolved declaration type of a `defineVersionedConfig(...)` binding, when no explicit type argument
 *  was written (`promptConfigConfig` is the live inferred spelling). */
const VERSIONED_CONFIG_TYPE_RE = /VersionedConfig<([^>]+)>/u;

export const JSON_UNREADABLE_CONFIG_MESSAGE =
  "UNREADABLE `defineVersionedConfig(...)` declaration — the gate cannot resolve which TYPE this versioned " +
  "config owns (no explicit type argument, and the binding's declared type is not a `VersionedConfig<T>`). " +
  "Its columns therefore carry NO write guard obligation, silently. Write the type argument explicitly " +
  "(`defineVersionedConfig<PromptConfig>({ … })`) so the ownership is readable without the checker.";

export const JSON_VERSIONED_BLIND_MESSAGE =
  "DERIVED NOTHING — no `defineVersionedConfig(...)` call was found in packages/contracts/src on a tree that " +
  "HAS a contracts package. The owned-type set is ARM B's whole basis, so a green verdict for it would be a " +
  "placebo (GATE-AUTHORING.md §4.6). Re-point the derivation at the primitive's current spelling: " +
  "tooling/src/verify/gates/json-column-write-parity-health.ts";

export const JSON_STALE_GUARD_EXEMPT_PREFIX =
  "GUARD_EXEMPT entry names a writer that no longer needs the exemption (it grew the " +
  "`requireIntactStoredConfig` guard, stopped being a whole-replace writer of a versioned-config column, or " +
  "left the tree) — a standing exemption for a site that is gone is a loaded gun: delete the stale row in " +
  "json-column-write-parity.ts: ";

export interface JsonColumnWriter {
  readonly node: TsNode;
  readonly wholeReplace: boolean;
}

/** Every drizzle table variable → the names of its `mode: "json"` columns, and the SUBSET whose `$type<T>`
 *  names a versioned-config-owned type. Derived from the schema package, never hand-listed. */
export interface JsonColumnIndex {
  /** table variable → every `mode:"json"` column (ARM A's subject). */
  readonly all: Map<string, ReadonlySet<string>>;
  /** table variable → the versioned-config-owned subset (ARM B's subject). */
  readonly versioned: Map<string, ReadonlySet<string>>;
}

export function deriveJsonColumns(schema: SchemaModel, versionedTypes: ReadonlySet<string>): JsonColumnIndex {
  const all = new Map<string, ReadonlySet<string>>();
  const versioned = new Map<string, ReadonlySet<string>>();
  for (const table of schema.tables) {
    const json = table.columns.filter((column) => column.json !== null);
    if (json.length === 0) {
      continue;
    }
    all.set(table.identity.declarationName, new Set(json.map((column) => column.identity.propertyName)));
    const owned = json.filter((column) => {
      const declared = column.typeOverride?.node.getText().trim().split(".").at(-1);
      return declared !== undefined && versionedTypes.has(declared);
    });
    if (owned.length > 0) {
      versioned.set(table.identity.declarationName, new Set(owned.map((column) => column.identity.propertyName)));
    }
  }
  return { all, versioned };
}

/** The TYPE one `defineVersionedConfig(...)` owns — the EXPLICIT type argument, else the binding's resolved
 *  `VersionedConfig<T>` (the live inferred `promptConfigConfig` spelling). `undefined` = readable neither
 *  way, which this gate REPORTS rather than silently dropping the column obligation it carries. */
function ownedTypeOf(call: CallExpression): string | undefined {
  const explicit = call.getTypeArguments()[0]?.getText().trim();
  if (explicit !== undefined && explicit !== "") {
    return explicit;
  }
  const decl = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const inferred = decl === undefined ? undefined : VERSIONED_CONFIG_TYPE_RE.exec(decl.getType().getText(decl))?.[1];
  // A resolved type prints qualified (`import("…/preset").PromptConfig`); the DECLARED name is the tail.
  const name = inferred?.trim().split(".").at(-1);
  return name === undefined || name === "" || name.includes("(") ? undefined : name;
}

/** Every versioned-config declaration in `contracts`, split into the types it could read and the calls it
 *  could not (the #944 fail-closed half — a `continue` here would erase obligations silently). */
export function deriveVersionedTypes(candidates: readonly CallExpression[]): {
  readonly types: Set<string>;
  readonly unresolved: CallExpression[];
  readonly calls: number;
} {
  const types = new Set<string>();
  const unresolved: CallExpression[] = [];
  let calls = 0;
  for (const call of candidates) {
    if (call.getSourceFile().getFilePath().includes(CONTRACTS_DIR)) {
      if (call.getExpression().getText() !== DEFINE_VERSIONED_CONFIG) {
        continue;
      }
      calls += 1;
      const owned = ownedTypeOf(call);
      if (owned === undefined) {
        unresolved.push(call);
      } else {
        types.add(owned);
      }
    }
  }
  return { types, unresolved, calls };
}

/** The table variable a `.set(` call updates — walk the fluent chain back to `.update(<table>)` (or, for an
 *  upsert's `onConflictDoUpdate`, back to `.insert(<table>)`). */
function updatedTable(setCallee: TsNode, chainVerb = "update"): string | undefined {
  let cur: TsNode = setCallee;
  let table: string | undefined;
  while (table === undefined && (Node.isCallExpression(cur) || Node.isPropertyAccessExpression(cur))) {
    if (Node.isCallExpression(cur)) {
      const callee = cur.getExpression();
      table = Node.isPropertyAccessExpression(callee) && callee.getName() === chainVerb ? (cur.getArguments()[0]?.getText() ?? "") : undefined;
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
function isRowDerivedDecl(def: TsNode): boolean {
  if (def.getFirstAncestorByKind(SyntaxKind.Parameter) !== undefined || Node.isParameterDeclaration(def)) {
    return false;
  }
  const varDecl = Node.isVariableDeclaration(def) ? def : def.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return varDecl !== undefined && varDecl.getFirstAncestorByKind(SyntaxKind.Block) !== undefined;
}

function isRowDerived(id: TsNode): boolean {
  return Node.isIdentifier(id) && id.getDefinitionNodes().some(isRowDerivedDecl);
}

/** Every JSON-column assignment reachable from a `.set()` argument, classified. `paramTaint` carries the
 *  ONE helper hop: when the argument spreads `helper(a, b)`, each of `helper`'s parameters inherits whether
 *  its call-site argument was row-derived, so an assignment inside the helper is key-wise only if it READS
 *  a tainted parameter. */
interface Sink {
  readonly cols: ReadonlySet<string>;
  readonly out: JsonColumnWriter[];
}

function collectFromObject(obj: ObjectLiteralExpression, sink: Sink, paramTaint: ReadonlyMap<string, boolean>, hop: number): void {
  for (const prop of obj.getProperties()) {
    if (Node.isSpreadAssignment(prop)) {
      collectWriters(prop.getExpression(), sink, paramTaint, hop);
    } else if (Node.isPropertyAssignment(prop) && sink.cols.has(prop.getName())) {
      const rhs = prop.getInitializer();
      sink.out.push({ node: prop, wholeReplace: rhs === undefined || !isKeyWise(rhs, paramTaint) });
    } else if (Node.isShorthandPropertyAssignment(prop) && sink.cols.has(prop.getName())) {
      // `.set({ config, schemaVersion, updatedAt })` — the live `writeUserConfig` spelling, and a writer the
      // PropertyAssignment-only reader could not see at all. The value's binding is the shorthand's own
      // VALUE symbol (its name node resolves to the property, not to what it reads).
      const decls = prop.getValueSymbol()?.getDeclarations() ?? [];
      sink.out.push({ node: prop, wholeReplace: paramTaint.get(prop.getName()) !== true && !decls.some(isRowDerivedDecl) });
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
 *  SQL-side (a `sql` template around `json_set(${userSettings.config}, …)` — the live theme-clear
 *  writer). The taint test
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
export function jsonWriterColumn(w: JsonColumnWriter): string {
  if (Node.isPropertyAssignment(w.node) || Node.isShorthandPropertyAssignment(w.node)) {
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
export function collectJsonWritersByColumn(
  calls: readonly CallExpression[],
  jsonColumns: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, JsonColumnWriter[]> {
  const byColumn = new Map<string, JsonColumnWriter[]>();
  for (const call of calls) {
    if (call.getSourceFile().getFilePath().includes(DOMAIN_DIR)) {
      const target = jsonTableOf(call, jsonColumns);
      if (target === undefined) {
        continue;
      }
      const found: JsonColumnWriter[] = [];
      collectWriters(call.getArguments()[0], { cols: target.cols, out: found }, EMPTY_TAINT, 0);
      for (const w of found) {
        const key = `${target.table}.${jsonWriterColumn(w)}`;
        byColumn.set(key, [...(byColumn.get(key) ?? []), w]);
      }
    }
  }
  return byColumn;
}

// ── ARM B: the versioned-config dominance arm ──────────────────────────────────────────────────────────

/** One whole-replace write of a versioned-config column, and the exemption key that would forgive it. */
export interface JsonGuardTarget {
  readonly node: TsNode;
  readonly token: string;
  /** `<repo-relative file>#<enclosing function>` — the GUARD_EXEMPT key. */
  readonly key: string;
  readonly dominated: boolean;
  readonly opaque: boolean;
}

/** The enclosing function's BODY BLOCK and the name a reader would call it — the unit dominance is judged
 *  in. A write outside any function body has no place to put a guard and is never dominated. */
interface EnclosingFunction {
  readonly body: Block;
  readonly name: string;
}

function enclosingBody(node: TsNode): EnclosingFunction | undefined {
  let found: EnclosingFunction | undefined;
  for (const a of node.getAncestors()) {
    const body =
      Node.isFunctionDeclaration(a) || Node.isMethodDeclaration(a) || Node.isFunctionExpression(a) || Node.isArrowFunction(a) ? a.getBody() : undefined;
    if (body === undefined || !Node.isBlock(body)) {
      continue;
    }
    const named =
      Node.isFunctionDeclaration(a) || Node.isMethodDeclaration(a) ? a.getName() : a.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();
    found = { body, name: named === undefined || named === "" ? ANONYMOUS_SITE : named };
    break;
  }
  return found;
}

/** Which of `statements` this node sits under, by identity — the position dominance compares. */
function statementIndexIn(node: TsNode, statements: readonly Statement[]): number {
  for (let cur: TsNode | undefined = node; cur !== undefined; cur = cur.getParent()) {
    const at = statements.indexOf(cur as Statement);
    if (at >= 0) {
      return at;
    }
  }
  return -1;
}

/** DOMINANCE, not presence: some `requireIntactStoredConfig(...)` call's own top-level statement must
 *  PRECEDE the write's top-level statement in the same function body. A guard nested inside an EARLIER
 *  statement counts (`if (row !== undefined) { guard }` is the live correct shape — an absent row is a
 *  legitimate first write); a guard in the write's own statement, in a sibling branch, or after it, does not. */
function isDominatedByGuard(node: TsNode, body: Block): boolean {
  const statements = body.getStatements();
  const writeAt = statementIndexIn(node, statements);
  if (writeAt < 0) {
    return false;
  }
  return body.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    if (call.getExpression().getText() !== GUARD_CALLEE) {
      return false;
    }
    const guardAt = statementIndexIn(call, statements);
    return guardAt >= 0 && guardAt < writeAt;
  });
}

/** The unwrapped `.set(...)` / `onConflictDoUpdate({ set })` argument, for the OPAQUE test. */
function unwrapArg(arg: TsNode | undefined): TsNode | undefined {
  return arg !== undefined && Node.isParenthesizedExpression(arg) ? unwrapArg(arg.getExpression()) : arg;
}

/** Every whole-replace write of a versioned-config column reachable from one `set` object, plus the
 *  fail-closed OPAQUE verdict when the gate cannot read the object at all. */
function guardTargetsOf(setArg: TsNode | undefined, cols: ReadonlySet<string>, root: string): JsonGuardTarget[] {
  const arg = unwrapArg(setArg);
  if (arg === undefined) {
    return [];
  }
  const site = enclosingBody(arg);
  const key = `${arg.getSourceFile().getFilePath().replace(`${root}/`, "")}#${site === undefined ? TOP_LEVEL_SITE : site.name}`;
  const dominates = (n: TsNode): boolean => site !== undefined && isDominatedByGuard(n, site.body);
  if (!Node.isObjectLiteralExpression(arg)) {
    return [{ node: arg, token: arg.getText().slice(0, OPAQUE_TOKEN_CHARS), key, dominated: dominates(arg), opaque: true }];
  }
  const found: JsonColumnWriter[] = [];
  collectWriters(arg, { cols, out: found }, EMPTY_TAINT, 0);
  return found
    .filter((w) => w.wholeReplace && cols.has(jsonWriterColumn(w)))
    .map((w) => ({ node: w.node, token: jsonWriterColumn(w), key, dominated: dominates(w.node), opaque: false }));
}

/** The `set` object of an `onConflictDoUpdate({ target, set: { … } })` upsert — a whole-blob replace of an
 *  EXISTING row, so it owes the guard exactly as `.set()` does. */
function conflictSetObject(call: CallExpression): TsNode | undefined {
  const arg = unwrapArg(call.getArguments()[0]);
  const prop = arg !== undefined && Node.isObjectLiteralExpression(arg) ? arg.getProperty(CONFLICT_SET_KEY) : undefined;
  return Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** The write verb → the fluent chain verb that names its table. */
const WRITE_VERBS: ReadonlyMap<string, string> = new Map([
  ["set", "update"],
  [CONFLICT_UPDATE, "insert"],
]);

/** The `set` object of ONE write call, when that call writes a table owning a versioned-config column. */
function versionedSetArg(
  call: CallExpression,
  versionedColumns: ReadonlyMap<string, ReadonlySet<string>>,
): { readonly arg: TsNode | undefined; readonly cols: ReadonlySet<string> } | undefined {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) {
    return;
  }
  const chainVerb = WRITE_VERBS.get(callee.getName());
  const table = chainVerb === undefined ? undefined : updatedTable(callee.getExpression(), chainVerb);
  const cols = table === undefined ? undefined : versionedColumns.get(table);
  if (cols === undefined) {
    return;
  }
  return { arg: callee.getName() === CONFLICT_UPDATE ? conflictSetObject(call) : call.getArguments()[0], cols };
}

/** Every versioned-config write site in the domain corpus, classified. */
export function collectJsonGuardTargets(
  calls: readonly CallExpression[],
  versionedColumns: ReadonlyMap<string, ReadonlySet<string>>,
  root: string,
): JsonGuardTarget[] {
  const out: JsonGuardTarget[] = [];
  for (const call of calls) {
    if (call.getSourceFile().getFilePath().includes(DOMAIN_DIR)) {
      const target = versionedSetArg(call, versionedColumns);
      if (target !== undefined) {
        out.push(...guardTargetsOf(target.arg, target.cols, root));
      }
    }
  }
  return out;
}

export interface JsonColumnWriteAnalysis {
  readonly files: readonly SourceFile[];
  readonly versioned: ReturnType<typeof deriveVersionedTypes>;
  readonly columns: JsonColumnIndex;
  readonly writers: ReadonlyMap<string, readonly JsonColumnWriter[]>;
  readonly guardTargets: readonly JsonGuardTarget[];
}

export interface JsonColumnWriteFact {
  readonly analyze: (schema: SchemaModel) => JsonColumnWriteAnalysis;
}

/** One shared, invocation-local analysis of JSON columns and their writer shapes. */
export const jsonColumnWriteFact = defineFact({
  id: "json-column-writes",
  population: {
    in: ["@db", "@server", "@contracts"],
    under: ["packages/db/src/schema/**", "packages/server/src/domain/**", "packages/contracts/src/**"],
  },
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const calls: CallExpression[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (Node.isCallExpression(node)) {
              calls.push(node);
            }
          },
        },
      ],
      finish: (): JsonColumnWriteFact => {
        const first = ctx.files[0];
        if (first === undefined) {
          throw new Error("json-column-writes: effective source population is empty");
        }
        const rel = ctx.relativePath(first);
        const root = first
          .getSourceFile()
          .getFilePath()
          .replaceAll("\\", "/")
          .slice(0, -(rel.length + 1));
        ctx.receipt({ kind: "population", source: "json-column-write-sources", members: ctx.files.length });
        return Object.freeze({
          analyze: (schema: SchemaModel): JsonColumnWriteAnalysis => {
            const versioned = deriveVersionedTypes(calls);
            const columns = deriveJsonColumns(schema, versioned.types);
            const writers = collectJsonWritersByColumn(calls, columns.all);
            const guardTargets = collectJsonGuardTargets(calls, columns.versioned, root);
            return Object.freeze({ files: ctx.files, versioned, columns, writers, guardTargets });
          },
        });
      },
    };
  },
});
