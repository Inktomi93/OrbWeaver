// ARM A OF THE JSON-COLUMN WRITE FACT — every drizzle `.set()` writer of a `mode:"json"` column in the
// domain corpus, classified WHOLE-REPLACE vs KEY-WISE by actual same-column persisted origin and the
// bounded omission/spread/known-normalizer grammar (one set-helper hop and the accumulator spelling). Split out of
// `json-column-write-fact.ts` at the size cap (2026-09-18); ARM B (guard dominance) and the fact stay there
// and reuse `collectWriters`. One-way: this module imports nothing from it.
import type { CallExpression, FunctionDeclaration, ObjectLiteralExpression, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { JsonColumnOriginContext } from "../contract/json-column-origin.ts";
import type { SchemaModel, SchemaTable } from "../contract/schema-fact.ts";
import { readCallReturns } from "./authored-key-set.ts";
import { proveJsonColumnMerge } from "./json-column-merge-proof.ts";
import { jsonColumnCallContext } from "./json-column-value-origin.ts";
import { tableFromReference } from "./schema-fact-resolve.ts";
import { schemaDeclarationKey } from "./schema-fact-value.ts";
import { readMemberAccess } from "./symbol-reference.ts";

/** The producer scope both arms judge: a write outside the domain tier is wiring, never a writer. */
export const DOMAIN_DIR = "/packages/server/src/domain/";

export interface JsonColumnWriter {
  readonly node: TsNode;
  readonly wholeReplace: boolean;
  readonly historicalHeal: boolean;
}

/** The bound schema table a fluent write targets; a namespace or alias retains declaration identity. */
export function updatedTable(setCallee: TsNode, schema: SchemaModel, chainVerb = "update"): string | undefined {
  let cur: TsNode = setCallee;
  let table: string | undefined;
  while (table === undefined) {
    const call = Node.isCallExpression(cur) ? cur : undefined;
    const member = readMemberAccess(call?.getExpression() ?? cur);
    if (member === undefined) {
      break;
    }
    const argument = member.name === chainVerb ? call?.getArguments()[0] : undefined;
    if (argument !== undefined) {
      const bound = tableFromReference(argument, new Map(schema.tables.map((candidate) => [schemaDeclarationKey(candidate.declaration), candidate])));
      table = bound.kind === "resolved" ? bound.value.identity.declarationName : undefined;
    }
    cur = member.receiver;
  }
  return table;
}

/** A sink keeps its schema table identity; coincident JSON property names are not provenance. */
export interface Sink {
  readonly cols: ReadonlySet<string>;
  readonly out: JsonColumnWriter[];
  readonly table: SchemaTable;
}

function appendWriter(node: TsNode, rhs: TsNode | undefined, sink: Sink, context: JsonColumnOriginContext): void {
  const name = writerColumnName(node);
  const column = sink.table.columns.find((candidate) => candidate.identity.propertyName === name);
  if (column === undefined) {
    throw new Error(`json-column-writes: sink column disappeared: ${sink.table.identity.declarationName}.${name}`);
  }
  const proof = rhs === undefined ? { keywise: false, historicalHeal: false } : proveJsonColumnMerge(rhs, { table: sink.table, column }, context);
  sink.out.push({ node, wholeReplace: !proof.keywise, historicalHeal: proof.historicalHeal });
}

function collectFromObject(obj: ObjectLiteralExpression, sink: Sink, context: JsonColumnOriginContext, hop: number): void {
  for (const prop of obj.getProperties()) {
    if (Node.isSpreadAssignment(prop)) {
      collectWriters(prop.getExpression(), sink, context, hop);
    } else if (Node.isPropertyAssignment(prop) && sink.cols.has(prop.getName())) {
      appendWriter(prop, prop.getInitializer(), sink, context);
    } else if (Node.isShorthandPropertyAssignment(prop) && sink.cols.has(prop.getName())) {
      appendWriter(prop, prop.getNameNode(), sink, context);
    }
  }
}

/** Actual helper parameters inherit their call-site expression, not boolean 'any local' taint. */
export function collectWriters(arg: TsNode | undefined, sink: Sink, context: JsonColumnOriginContext, hop: number): void {
  if (arg === undefined) {
    return;
  }
  if (Node.isParenthesizedExpression(arg)) {
    collectWriters(arg.getExpression(), sink, context, hop);
  } else if (Node.isConditionalExpression(arg)) {
    collectWriters(arg.getWhenTrue(), sink, context, hop);
    collectWriters(arg.getWhenFalse(), sink, context, hop);
  } else if (Node.isObjectLiteralExpression(arg)) {
    collectFromObject(arg, sink, context, hop);
  } else if (Node.isCallExpression(arg) && hop < 1) {
    descendHelper(arg, sink, context, hop);
  }
}

/** The helper's accumulator shape (`const set: Partial<…> = {}; set.selection = …; return set;`) — the live
 *  `parsePatch` spelling. */
function collectFromAccumulator(def: FunctionDeclaration, sink: Sink, context: JsonColumnOriginContext): void {
  for (const bin of def.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    const lhs = bin.getLeft();
    if (bin.getOperatorToken().getText() === "=" && Node.isPropertyAccessExpression(lhs) && sink.cols.has(lhs.getName())) {
      appendWriter(bin, bin.getRight(), sink, context);
    }
  }
}

/** One set-helper hop, preserving exact lexical parameter bindings and the helper's own returns. */
function descendHelper(call: CallExpression, sink: Sink, context: JsonColumnOriginContext, hop: number): void {
  const returned = readCallReturns(call);
  if (returned.kind === "unresolved") {
    throw new Error(`json-column-writes: cannot prove set helper body: ${returned.detail}`);
  }
  const owner = returned.trace.origin;
  const next = jsonColumnCallContext(call, owner, context);
  if (Node.isFunctionDeclaration(owner)) {
    collectFromAccumulator(owner, sink, next);
  }
  for (const value of returned.value) {
    collectWriters(value, sink, next, hop + 1);
  }
}

/** The column a collected writer assigns — a `metadata: …` property, or a `set.metadata = …` accumulator
 *  assignment (whose LHS is the property access). */
function writerColumnName(node: TsNode): string {
  if (Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) {
    return node.getName();
  }
  const lhs = Node.isBinaryExpression(node) ? node.getLeft() : undefined;
  return Node.isPropertyAccessExpression(lhs) ? lhs.getName() : "";
}

export function jsonWriterColumn(writer: JsonColumnWriter): string {
  return writerColumnName(writer.node);
}

/** The JSON-column-bearing table this call updates, if it is a `db.update(<table>).set(…)` at all. */
function jsonTableOf(
  call: CallExpression,
  jsonColumns: ReadonlyMap<string, ReadonlySet<string>>,
  schema: SchemaModel,
): { readonly table: string; readonly cols: ReadonlySet<string> } | undefined {
  const callee = readMemberAccess(call.getExpression());
  if (callee?.name !== "set") {
    return;
  }
  const table = updatedTable(callee.receiver, schema);
  const cols = table === undefined ? undefined : jsonColumns.get(table);
  return table === undefined || cols === undefined ? undefined : { table, cols };
}

/** Every `<table>.<column>` a domain `.set()` writes → its classified writers. */
export function collectJsonWritersByColumn(
  calls: readonly CallExpression[],
  jsonColumns: ReadonlyMap<string, ReadonlySet<string>>,
  schema: SchemaModel,
): Map<string, JsonColumnWriter[]> {
  const byColumn = new Map<string, JsonColumnWriter[]>();
  for (const call of calls) {
    if (call.getSourceFile().getFilePath().includes(DOMAIN_DIR)) {
      const target = jsonTableOf(call, jsonColumns, schema);
      if (target === undefined) {
        continue;
      }
      const found: JsonColumnWriter[] = [];
      const table = schema.tables.find((candidate) => candidate.identity.declarationName === target.table);
      if (table === undefined) {
        throw new Error(`json-column-writes: writer table disappeared: ${target.table}`);
      }
      const context: JsonColumnOriginContext = { schema, bindings: new Map(), active: new Set(), mergeActive: new Set() };
      collectWriters(call.getArguments()[0], { cols: target.cols, out: found, table }, context, 0);
      for (const w of found) {
        const key = `${target.table}.${jsonWriterColumn(w)}`;
        byColumn.set(key, [...(byColumn.get(key) ?? []), w]);
      }
    }
  }
  return byColumn;
}
