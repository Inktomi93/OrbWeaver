// Native projection only: canonical complete schema extraction and table-reference algorithms own meaning.
import type { Node } from "ts-morph";
import { resolveDrizzleTableRefs } from "./drizzle-table-ref.ts";
import { resolveStableExpression } from "./reference-fact.ts";
import type { DrizzleTableEvidence, SchemaIdentityModel, SchemaIdentityQuery, SchemaIdentityTable } from "./schema-identity-contract.ts";
import type { SchemaFact, SchemaQueryOptions, SchemaTable } from "./schema-model-contract.ts";
import { createSchemaQuery, unavailableSchemaReference } from "./schema-query.ts";
import { tableFromReference } from "./schema-resolve.ts";
import { schemaDeclarationKey } from "./schema-value.ts";

function tableIdentity(table: SchemaTable): SchemaIdentityTable {
  return { identity: table.identity, declaration: table.declaration, call: table.call, sqlName: table.sqlName };
}

/** Full FK, index, default and JSON extraction must succeed before the type-free identity projection can be ready. */
export function readSchemaIdentities(options: SchemaQueryOptions): SchemaFact<SchemaIdentityModel> {
  const schema = createSchemaQuery(options).schema();
  return schema.status === "ready" ? { ...schema, value: { tables: schema.value.tables.map(tableIdentity) } } : schema;
}

/** Re-enter the canonical table-reference algorithm with explicitly projected native table values. */
export function schemaIdentityQuery<Table>(
  schema: SchemaFact<SchemaIdentityModel<Table>>,
  declarations: ReadonlyMap<string, Table>,
): SchemaIdentityQuery<Table> {
  return {
    schema: () => schema,
    declarations: new Set(declarations.keys()),
    table: (node) => (schema.status === "ready" ? tableFromReference(node, declarations) : unavailableSchemaReference(schema, node)),
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
