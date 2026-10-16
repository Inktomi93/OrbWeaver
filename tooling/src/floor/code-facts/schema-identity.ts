// Native projection only: canonical complete schema extraction and table-reference algorithms own meaning.
import type { Node } from "ts-morph";
import { readDrizzleValueSources } from "./drizzle-query.ts";
import type { DrizzleValueSourceEvidence } from "./drizzle-query-contract.ts";
import { resolveDrizzleTableRefs } from "./drizzle-table-ref.ts";
import { resolveStableExpression } from "./reference-fact.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { DrizzleTableEvidence, SchemaIdentityModel, SchemaIdentityQuery, SchemaIdentityTable } from "./schema-identity-contract.ts";
import type { SchemaColumnIdentity, SchemaFact, SchemaQueryOptions, SchemaTable } from "./schema-model-contract.ts";
import { createSchemaQuery, unavailableSchemaReference } from "./schema-query.ts";
import { columnFromReference, tableFromReference } from "./schema-resolve.ts";
import { schemaDeclarationKey } from "./schema-value.ts";

function tableIdentity(table: SchemaIdentityTable): SchemaIdentityTable {
  return { identity: table.identity, declaration: table.declaration, call: table.call, sqlName: table.sqlName };
}

/** Full FK, index, default and JSON extraction must succeed before the type-free identity projection can be ready. */
export function readSchemaIdentities(options: SchemaQueryOptions): SchemaFact<SchemaIdentityModel> {
  return projectSchemaIdentities(createSchemaQuery(options).schema());
}

/** Identity and full-data demand can share one complete native extraction. */
export function projectSchemaIdentities(schema: SchemaFact<SchemaIdentityModel>): SchemaFact<SchemaIdentityModel> {
  return schema.status === "ready" ? { ...schema, value: { tables: schema.value.tables.map(tableIdentity) } } : schema;
}

/** Re-enter the canonical table-reference algorithm with explicitly projected native table values. */
export function schemaIdentityQuery<Table extends Pick<SchemaTable, "identity">>(
  schema: SchemaFact<SchemaIdentityModel<Table>>,
  declarations: ReadonlyMap<string, Table>,
  columns?: ReadonlyMap<string, SchemaColumnIdentity>,
): SchemaIdentityQuery<Table> {
  return {
    schema: () => schema,
    declarations: new Set(declarations.keys()),
    table: (node) => (schema.status === "ready" ? tableFromReference(node, declarations) : unavailableSchemaReference(schema, node)),
    column: (node): ReferenceFact<SchemaColumnIdentity> => {
      if (columns === undefined) {
        throw new Error("native Drizzle column catalog was not requested");
      }
      return schema.status === "ready" ? columnFromReference(node, declarations, columns) : unavailableSchemaReference(schema, node);
    },
  };
}

/** Capture facts, not the consumer's stability refusal or ownership verdict. */
export function readDrizzleTableEvidence(node: Node, declarations: ReadonlySet<string>): DrizzleTableEvidence {
  const stability: DrizzleTableEvidence["stability"][number][] = [{ node, fact: resolveStableExpression(node) }];
  const references = resolveDrizzleTableRefs(node, (declaration) => {
    const name = declaration.getNameNode();
    stability.push({ node: name, fact: resolveStableExpression(name) });
    return declarations.has(schemaDeclarationKey(declaration));
  });
  return { node, stability, references };
}

/** Receiver table references preserve canonical value-source refusal and explicit empty source sets. */
export function readDrizzleValueSourceEvidence(node: Node, declarations: ReadonlySet<string>): DrizzleValueSourceEvidence {
  const source = readDrizzleValueSources(node);
  const receivers = source.kind === "unresolved" ? [] : [...new Set(source.value.members.map((member) => member.receiver))];
  return { source, tables: receivers.map((receiver) => readDrizzleTableEvidence(receiver, declarations)) };
}
