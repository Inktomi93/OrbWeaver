// Existing inventory replay owns admission; this decoder restores only captured syntax and scalar facts.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { DrizzleCallEvidence } from "./drizzle-evidence-contract.ts";
import type {
  InventoryDrizzleCallEvidence,
  InventoryDrizzleTableEvidence,
  InventoryDrizzleTableReference,
  InventoryDrizzleValueSourceEvidence,
  InventorySchemaIdentityCatalog,
} from "./drizzle-inventory-contract.ts";
import { assertSchemaIdentityCatalog } from "./drizzle-inventory-contract.ts";
import type { DrizzleValueSourceEvidence } from "./drizzle-query-contract.ts";
import type { DrizzleTableRef } from "./drizzle-table-ref.ts";
import { replayReferenceFact } from "./projection-reference-codec.ts";
import type { DrizzleTableEvidence, SchemaIdentityModel, SchemaIdentityTable } from "./schema-identity-contract.ts";
import type { SchemaColumnIdentity, SchemaFact } from "./schema-model-contract.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";
import { contentVersion } from "./semantic-inventory-inputs.ts";

/** The full captured roster must replay exactly even when a consumer asks only table identities. */
export function replaySchemaIdentityCatalog(wire: InventorySchemaIdentityCatalog, replay: (span: InventorySpan) => MorphNode): SchemaFact<SchemaIdentityModel> {
  assertSchemaIdentityCatalog(wire);
  for (const source of wire.sources) {
    const node = replay(source.node);
    if (!Node.isSourceFile(node) || node.wasForgotten() || contentVersion(node.getFullText()) !== source.version) {
      throw new SemanticInventoryError("native schema identity source is missing or stale");
    }
  }
  const fact = wire.fact;
  return fact.status === "ready"
    ? {
        ...fact,
        value: {
          tables: fact.value.tables.map((table) => {
            const declaration = replay(table.declaration);
            const call = replay(table.call);
            if (!Node.isVariableDeclaration(declaration) || declaration.getName() !== table.identity.declarationName || !Node.isCallExpression(call)) {
              throw new SemanticInventoryError("native schema identity declaration or call span is foreign");
            }
            return { ...table, declaration, call };
          }),
        },
      }
    : fact;
}

function tableReference(ref: InventoryDrizzleTableReference, replay: (span: InventorySpan) => MorphNode): DrizzleTableRef {
  switch (ref.kind) {
    case "table": {
      const declaration = replay(ref.declaration);
      if (!Node.isVariableDeclaration(declaration)) {
        throw new SemanticInventoryError("native Drizzle table declaration is foreign");
      }
      return { ...ref, declaration };
    }
    case "subquery":
      return { ...ref, select: replay(ref.select) };
    case "unresolved":
      return { ...ref, node: replay(ref.node) };
    case "imported":
    case "sql-name":
    case "raw-sql":
      return ref;
  }
}

function sameSpan(left: InventorySpan, right: InventorySpan): boolean {
  return left.file === right.file && left.start === right.start && left.end === right.end && left.kind === right.kind;
}

function assertInstanceArgument(wire: Extract<InventoryDrizzleCallEvidence, { mode: "instance" }>, catalogReady: boolean): void {
  const fact = wire.invocation;
  const argument =
    fact.kind === "resolved" && fact.value.invocation === "call" && fact.value.arguments.kind === "resolved" ? fact.value.arguments.value[0] : undefined;
  if (catalogReady && argument !== undefined) {
    const first = wire.table?.stability[0];
    if (wire.table === null || first === undefined || !sameSpan(argument, wire.table.node) || !sameSpan(first.node, wire.table.node)) {
      throw new SemanticInventoryError("native Drizzle effective argument evidence is incomplete");
    }
  } else if (wire.table !== null) {
    throw new SemanticInventoryError("native Drizzle argument evidence has no executed argument");
  }
}

/** Original method identity cannot be reconstructed from a wrapper's selected signature. */
export function replayDrizzleCallEvidence(
  wire: InventoryDrizzleCallEvidence,
  catalog: SchemaFact<SchemaIdentityModel>,
  replay: (span: InventorySpan) => MorphNode,
  input: { readonly node: MorphNode; readonly columns?: readonly SchemaColumnIdentity[] | undefined },
): DrizzleCallEvidence {
  const { node: call, columns } = input;
  if (wire.mode === "column") {
    if (!Node.isExpression(call) || columns === undefined) {
      throw new SemanticInventoryError("native Drizzle column replay lacks its expression or complete catalog");
    }
    const byKey = new Map(columns.map((column) => [column.key, column]));
    return {
      mode: wire.mode,
      column: replayReferenceFact(
        wire.column,
        (key) => {
          const column = byKey.get(key);
          if (column === undefined) {
            throw new SemanticInventoryError("native Drizzle column value has no captured catalog identity");
          }
          return column;
        },
        replay,
      ),
    };
  }
  if (!Node.isCallExpression(call)) {
    throw new SemanticInventoryError("native Drizzle call replay is not a CallExpression");
  }
  if (wire.mode === "called-member") {
    if ((wire.table === null) !== (call.getArguments()[0] === undefined)) {
      throw new SemanticInventoryError("native Drizzle direct argument evidence is incomplete");
    }
    const tables = new Map((catalog.status === "ready" ? catalog.value.tables : []).map((table) => [table.identity.key, table]));
    const tableOf = (key: string): SchemaIdentityTable => {
      const value = tables.get(key);
      if (value === undefined) {
        throw new SemanticInventoryError("native Drizzle table value has no captured catalog identity");
      }
      return value;
    };
    return {
      mode: wire.mode,
      member: replayReferenceFact(
        wire.member,
        (member) => ({ ...member, nameNode: replay(member.nameNode), declarations: member.declarations.map(replay) }),
        replay,
      ),
      table: wire.table === null ? null : replayReferenceFact(wire.table, tableOf, replay),
    };
  }
  assertInstanceArgument(wire, catalog.status === "ready");
  const tableEvidence = wire.table;
  return {
    mode: wire.mode,
    invocation: replayReferenceFact(
      wire.invocation,
      (value) => ({
        invocation: value.invocation,
        target: {
          member: {
            ...value.target.member,
            access: replay(value.target.member.access),
            receiver: replay(value.target.member.receiver),
            nameNode: replay(value.target.member.nameNode),
            declarations: value.target.member.declarations.map(replay),
          },
        },
        callee: replay(value.callee),
        captureDeclarations: value.captureDeclarations.map(replay),
        arguments: replayReferenceFact(value.arguments, (nodes) => nodes.map(replay), replay),
      }),
      replay,
    ),
    table: tableEvidence === null ? null : replayDrizzleTableEvidence(tableEvidence, replay),
  };
}

/** Effective argument and value-source delivery retain one table-reference decoder. */
export function replayDrizzleTableEvidence(wire: InventoryDrizzleTableEvidence, replay: (span: InventorySpan) => MorphNode): DrizzleTableEvidence {
  return {
    node: replay(wire.node),
    stability: wire.stability.map((entry) => ({ node: replay(entry.node), fact: replayReferenceFact(entry.fact, replay, replay) })),
    references: wire.references.map((ref) => tableReference(ref, replay)),
  };
}

/** Missing or foreign source attachment rows are refused before this span-only decoder. */
export function replayDrizzleValueSourceEvidence(
  wire: InventoryDrizzleValueSourceEvidence,
  replay: (span: InventorySpan) => MorphNode,
): DrizzleValueSourceEvidence {
  return {
    source: replayReferenceFact(
      wire.source,
      (value) => ({
        members: value.members.map((member) => ({
          ...member,
          receiver: replay(member.receiver),
          nameNode: replay(member.nameNode),
          access: replay(member.access),
        })),
        subselects: value.subselects.map(replay),
      }),
      replay,
    ),
    tables: wire.tables.map((table) => replayDrizzleTableEvidence(table, replay)),
  };
}
