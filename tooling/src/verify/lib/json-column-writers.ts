// ARM A OF THE JSON-COLUMN WRITE FACT — every drizzle `.set()` writer of a `mode:"json"` column in the
// domain corpus, classified WHOLE-REPLACE vs KEY-WISE by actual same-column persisted origin and the
// bounded omission/spread/known-normalizer grammar (one set-helper hop and the accumulator spelling). Split out of
// `json-column-write-fact.ts` at the size cap (2026-09-18); ARM B (guard dominance) and the fact stay there
// and reuse `collectWriters`. One-way: this module imports nothing from it.

import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { CallExpression, Node as TsNode } from "ts-morph";
import { Node } from "ts-morph";
import type { DrizzleWriteRootVerb } from "../../floor/code-facts/drizzle-write-chain.ts";
import { readDrizzleWriteRoots } from "../../floor/code-facts/drizzle-write-chain.ts";
import { readDrizzleWriterSource } from "../../floor/code-facts/drizzle-writer-source.ts";
import type { DrizzleWriterMember, DrizzleWriterSource } from "../../floor/code-facts/drizzle-writer-source-contract.ts";
import type { SchemaProjectedModel, SchemaProjectedTable } from "../../floor/code-facts/schema-projection-contract.ts";
import { tableFromReference } from "../../floor/code-facts/schema-resolve.ts";
import { schemaDeclarationKey } from "../../floor/code-facts/schema-value.ts";
import type { JsonColumnOriginContext, JsonColumnWriterReaders } from "../contract/json-column-origin.ts";
import { proveJsonColumnMerge } from "./json-column-merge-proof.ts";
import { jsonColumnCallContext } from "./json-column-origin-context.ts";

/** The producer scope both arms judge: a write outside the domain tier is wiring, never a writer. */
export const DOMAIN_DIR = "/packages/server/src/domain/";

export interface JsonColumnWriter {
  readonly node: TsNode;
  readonly wholeReplace: boolean;
  readonly historicalHeal: boolean;
}

/** The bound schema table a fluent write targets; a namespace or alias retains declaration identity. */
export function updatedTable(setCallee: TsNode, schema: SchemaProjectedModel, chainVerb: DrizzleWriteRootVerb = "update"): string | undefined {
  const tables = new Map(schema.tables.map((candidate) => [schemaDeclarationKey(candidate.declaration), candidate]));
  return updatedTableWith(
    setCallee,
    {
      member: (node) => staticMemberAccess(node),
      roots: readDrizzleWriteRoots,
      source: readDrizzleWriterSource,
      table: (node) => tableFromReference(node, tables),
    },
    chainVerb,
  );
}

/** Shared writer traversal retains native table resolution rather than reconstructing declaration meaning. */
export function updatedTableWith(setCallee: TsNode, readers: JsonColumnWriterReaders, chainVerb: DrizzleWriteRootVerb = "update"): string | undefined {
  const targets = readers.roots(setCallee, chainVerb);
  if (targets.kind === "unresolved") {
    throw new Error(`json-column-writes: cannot establish write target: ${targets.detail}`);
  }
  let table: string | undefined;
  for (const target of targets.value) {
    const bound = readers.table(target.table);
    if (bound.kind === "resolved") {
      table = bound.value.identity.declarationName;
      break;
    }
  }
  return table;
}

/** A sink keeps its schema table identity; coincident JSON property names are not provenance. */
export interface Sink {
  readonly cols: ReadonlySet<string>;
  readonly out: JsonColumnWriter[];
  readonly table: SchemaProjectedTable;
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

function judgeWriterMembers(members: readonly DrizzleWriterMember[], sink: Sink, context: JsonColumnOriginContext, hop: number): void {
  for (const member of members) {
    if (member.kind === "spread") {
      judgeWriterSource(member.source, sink, context, hop);
    } else if (sink.cols.has(member.name)) {
      appendWriter(member.node, member.value, sink, context);
    }
  }
}

function judgeWriterSource(source: DrizzleWriterSource, sink: Sink, context: JsonColumnOriginContext, hop: number): void {
  if (source.kind === "object") {
    judgeWriterMembers(source.members, sink, context, hop);
  } else if (source.kind === "choice") {
    for (const value of source.values) {
      judgeWriterSource(value, sink, context, hop);
    }
  } else if (source.kind === "call" && hop < 1) {
    const next = jsonColumnCallContext(source.node, source.owner, context);
    judgeWriterMembers(source.assignments, sink, next, hop);
    for (const value of source.returns) {
      judgeWriterSource(value, sink, next, hop + 1);
    }
  } else if (source.kind === "unresolved" && hop < 1) {
    throw new Error(`json-column-writes: cannot prove set helper body: ${source.detail}`);
  }
}

/** The consumer retains its one-helper precision while all source/binding extraction has one floor home. */
export function collectWriters(arg: TsNode | undefined, sink: Sink, context: JsonColumnOriginContext, hop: number): void {
  judgeWriterSource((context.writerReaders?.source ?? readDrizzleWriterSource)(arg), sink, context, hop);
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
  context: JsonColumnOriginContext,
): { readonly table: string; readonly cols: ReadonlySet<string> } | undefined {
  const callee = context.schemaReaders.member(call.getExpression());
  if (callee?.name !== "set") {
    return;
  }
  const table = context.writerReaders === undefined ? updatedTable(callee.receiver, context.schema) : updatedTableWith(callee.receiver, context.writerReaders);
  const cols = table === undefined ? undefined : jsonColumns.get(table);
  return table === undefined || cols === undefined ? undefined : { table, cols };
}

/** Every `<table>.<column>` a domain `.set()` writes → its classified writers. Each native importing world supplies
 *  its own sealed questions while the writer population/order stays unchanged. */
export function collectJsonWritersByColumnWith(
  calls: readonly CallExpression[],
  jsonColumns: ReadonlyMap<string, ReadonlySet<string>>,
  contextFor: (call: CallExpression) => JsonColumnOriginContext,
): Map<string, JsonColumnWriter[]> {
  const byColumn = new Map<string, JsonColumnWriter[]>();
  for (const call of calls) {
    if (call.getSourceFile().getFilePath().includes(DOMAIN_DIR)) {
      const context = contextFor(call);
      const schema = context.schema;
      const target = jsonTableOf(call, jsonColumns, context);
      if (target === undefined) {
        continue;
      }
      const found: JsonColumnWriter[] = [];
      const table = schema.tables.find((candidate) => candidate.identity.declarationName === target.table);
      if (table === undefined) {
        throw new Error(`json-column-writes: writer table disappeared: ${target.table}`);
      }
      collectWriters(call.getArguments()[0], { cols: target.cols, out: found, table }, context, 0);
      for (const w of found) {
        const key = `${target.table}.${jsonWriterColumn(w)}`;
        byColumn.set(key, [...(byColumn.get(key) ?? []), w]);
      }
    }
  }
  return byColumn;
}
