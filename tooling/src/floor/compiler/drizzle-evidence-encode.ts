// Span encoding is shared with invocation delivery; canonical producers have already supplied all meaning.
import type { Node, SourceFile } from "ts-morph";
import type { DrizzleCallEvidence } from "../code-facts/drizzle-evidence-contract.ts";
import type { InventoryDrizzleCallEvidence, InventoryDrizzleTableReference, InventorySchemaIdentityCatalog } from "../code-facts/drizzle-inventory-contract.ts";
import { assertSchemaIdentityCatalog } from "../code-facts/drizzle-inventory-contract.ts";
import type { DrizzleTableRef } from "../code-facts/drizzle-table-ref.ts";
import { wireReferenceFact } from "../code-facts/projection-reference-codec.ts";
import type { SchemaIdentityModel, SchemaIdentityTable } from "../code-facts/schema-identity-contract.ts";
import type { SchemaFact } from "../code-facts/schema-model-contract.ts";
import type { InventorySpan } from "../code-facts/semantic-inventory-contract.ts";
import { contentVersion } from "../code-facts/semantic-inventory-inputs.ts";

/** Encode the complete source roster and the explicitly type-free catalog, retaining every census/status field. */
export function encodeSchemaIdentityCatalog(
  sources: readonly SourceFile[],
  fact: SchemaFact<SchemaIdentityModel>,
  span: (node: Node) => InventorySpan,
  relativePath: (source: SourceFile) => string,
): InventorySchemaIdentityCatalog {
  const catalog: InventorySchemaIdentityCatalog = {
    sources: sources.map((source) => ({ node: span(source), path: relativePath(source), version: contentVersion(source.getFullText()) })),
    fact:
      fact.status === "ready"
        ? {
            ...fact,
            value: {
              tables: fact.value.tables.map((table) => ({
                ...table,
                declaration: span(table.declaration),
                call: span(table.call),
              })),
            },
          }
        : fact,
  };
  assertSchemaIdentityCatalog(catalog);
  return catalog;
}

function tableReference(ref: DrizzleTableRef, span: (node: Node) => InventorySpan): InventoryDrizzleTableReference {
  switch (ref.kind) {
    case "table":
      return { ...ref, declaration: span(ref.declaration) };
    case "subquery":
      return { ...ref, select: span(ref.select) };
    case "unresolved":
      return { ...ref, node: span(ref.node) };
    case "imported":
    case "sql-name":
    case "raw-sql":
      return ref;
  }
}

/** Table values are catalog identities; original member and effective argument spans remain independent. */
export function encodeDrizzleCallEvidence<Table extends Pick<SchemaIdentityTable, "identity">>(
  evidence: DrizzleCallEvidence<Table>,
  span: (node: Node) => InventorySpan,
): InventoryDrizzleCallEvidence {
  if (evidence.mode === "called-member") {
    return {
      mode: evidence.mode,
      member: wireReferenceFact(
        evidence.member,
        (member) => ({ name: member.name, nameNode: span(member.nameNode), declarations: member.declarations.map(span) }),
        span,
      ),
      table: evidence.table === null ? null : wireReferenceFact(evidence.table, (table) => table.identity.key, span),
    };
  }
  const tableEvidence = evidence.table;
  return {
    mode: evidence.mode,
    invocation: wireReferenceFact(
      evidence.invocation,
      (value) => ({
        invocation: value.invocation,
        target: {
          member: {
            ...value.target.member,
            access: span(value.target.member.access),
            receiver: span(value.target.member.receiver),
            nameNode: span(value.target.member.nameNode),
            declarations: value.target.member.declarations.map(span),
          },
        },
        callee: span(value.callee),
        captureDeclarations: value.captureDeclarations.map(span),
        arguments: wireReferenceFact(value.arguments, (nodes) => nodes.map(span), span),
      }),
      span,
    ),
    table:
      tableEvidence === null
        ? null
        : {
            node: span(tableEvidence.node),
            stability: tableEvidence.stability.map((entry) => ({ node: span(entry.node), fact: wireReferenceFact(entry.fact, span, span) })),
            references: tableEvidence.references.map((ref) => tableReference(ref, span)),
          },
  };
}
