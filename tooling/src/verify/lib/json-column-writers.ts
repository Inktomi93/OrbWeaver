// ARM A OF THE JSON-COLUMN WRITE FACT — every drizzle `.set()` writer of a `mode:"json"` column in the
// domain corpus, classified WHOLE-REPLACE vs KEY-WISE by whether the written value depends on a value read
// from the row (one helper hop, a `sql` json_set merge, the accumulator spelling). Split out of
// `json-column-write-fact.ts` at the size cap (2026-09-18); ARM B (guard dominance) and the fact stay there
// and reuse `collectWriters`. One-way: this module imports nothing from it.
import type { CallExpression, FunctionDeclaration, ObjectLiteralExpression, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

/** The producer scope both arms judge: a write outside the domain tier is wiring, never a writer. */
export const DOMAIN_DIR = "/packages/server/src/domain/";

export interface JsonColumnWriter {
  readonly node: TsNode;
  readonly wholeReplace: boolean;
}

/** The table variable a `.set(` call updates — walk the fluent chain back to `.update(<table>)` (or, for an
 *  upsert's `onConflictDoUpdate`, back to `.insert(<table>)`). */
export function updatedTable(setCallee: TsNode, chainVerb = "update"): string | undefined {
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
export interface Sink {
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

export function collectWriters(arg: TsNode | undefined, sink: Sink, paramTaint: ReadonlyMap<string, boolean>, hop: number): void {
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

export const EMPTY_TAINT: ReadonlyMap<string, boolean> = new Map();

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
