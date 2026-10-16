// Consumer-owned normalizer validity/parity decisions are data; floor provenance never calls this reader.
import type { CallExpression, Node } from "ts-morph";
import { readCallClosure } from "../../floor/code-facts/call-returns.ts";
import type { DrizzleNormalization, DrizzleNormalizationMatch, DrizzleNormalizerSnapshot } from "../../floor/code-facts/drizzle-origin-contract.ts";
import { drizzleValueReaders } from "../../floor/code-facts/drizzle-value-origin.ts";
import type { SchemaProjectedColumn, SchemaProjectedModel } from "../../floor/code-facts/schema-projection-contract.ts";
import { resolved } from "../../floor/code-facts/type-member-origin-core.ts";
import { captureTypeSelections } from "../../floor/code-facts/type-projection.ts";
import { selectedTypeRelation } from "../../floor/code-facts/type-projection-contract.ts";
import type { JsonColumnOriginContext } from "../contract/json-column-origin.ts";
import type { SchemaModel } from "../contract/schema-fact.ts";
import { nativeJsonColumnSchemaReaders } from "./json-column-native-readers.ts";
import { readJsonColumnNormalizer } from "./json-column-normalizer.ts";
import type { jsonColumnObservedReaders } from "./json-column-observed-readers.ts";

function normalization(call: CallExpression, proof: DrizzleNormalization["proof"], schema: SchemaModel): DrizzleNormalization {
  const output = proof.schema.getType().getProperty("_output")?.getTypeAtLocation(proof.schema);
  const input = call.getArguments()[0] ?? call;
  const matches = new Map<import("../contract/schema-fact.ts").SchemaColumn, DrizzleNormalizationMatch>();
  for (const column of schema.tables.flatMap((table) => table.columns)) {
    const shape = column.typeOverride?.type;
    if (shape === undefined || column.json === null) {
      continue;
    }
    const sameShape = (expected: import("ts-morph").Type): boolean =>
      output !== undefined && output.isAssignableTo(expected) && expected.isAssignableTo(output);
    matches.set(column, {
      whole: sameShape(shape),
      fields: new Set(
        shape
          .getProperties()
          .filter((property) => sameShape(property.getTypeAtLocation(input)))
          .map((property) => property.getName()),
      ),
    });
  }
  return { proof, matches };
}

/** Prepare actual call facts once, retaining unrelated refusal data until a trace needs that call. */
export function createJsonColumnOriginContext(schema: SchemaModel, roots: readonly CallExpression[]): JsonColumnOriginContext {
  const normalizers = new Map<import("ts-morph").ts.CallExpression, DrizzleNormalizerSnapshot>();
  for (const call of readCallClosure(roots)) {
    const proof = readJsonColumnNormalizer(call);
    normalizers.set(call.compilerNode, {
      program: call.getSourceFile().getProject().getProgram().compilerObject,
      source: call.getSourceFile().compilerNode,
      fact:
        proof.kind === "unresolved"
          ? proof
          : resolved(proof.value === undefined ? undefined : normalization(call, proof.value, schema), call, proof.trace.declarations),
    });
  }
  const program = schema.tables[0]?.declaration.getProject().getProgram().compilerObject;
  return {
    schema,
    schemaReaders: nativeJsonColumnSchemaReaders,
    bindings: new Map(),
    active: new Set(),
    mergeActive: new Set(),
    normalizers,
    typeSelections: (plan) => captureTypeSelections(plan, program === undefined ? undefined : { value: schema, program }),
  };
}

/** Preserve consumer recursion state while rebinding a real callable's parameters. */
export function jsonColumnCallContext(call: CallExpression, owner: Node, context: JsonColumnOriginContext): JsonColumnOriginContext {
  return { ...context, bindings: drizzleValueReaders(context).bindings(call, owner, context.bindings) };
}

/** Pure consumer judgments use raw same-world Type relations and the original ordinary closure snapshot. */
export function createObservedJsonColumnOriginContext(
  schema: SchemaProjectedModel,
  delivered: ReturnType<typeof jsonColumnObservedReaders>,
): JsonColumnOriginContext {
  const closure = new Set(delivered.graph.closureCalls);
  return {
    schema,
    schemaReaders: delivered.schemaReaders,
    readers: delivered.originReaders,
    writerReaders: delivered.writerReaders,
    bindings: new Map(),
    active: new Set(),
    mergeActive: new Set(),
    normalizers: new Map(),
    typeSelections: delivered.typeSelections,
    readNormalizer: (call): import("../../floor/code-facts/reference-fact-contract.ts").ReferenceFact<DrizzleNormalization | undefined> => {
      delivered.graph.assertNode(call);
      if (!closure.has(call)) {
        throw new Error("json-column-writes: normalizer facts are missing or belong to another native snapshot");
      }
      const proof = readJsonColumnNormalizer(call, delivered.schemaReaders);
      return proof.kind === "unresolved"
        ? proof
        : {
            ...proof,
            value: proof.value === undefined ? undefined : observedNormalization(call, proof.value, schema, delivered),
          };
    },
  };
}

function observedNormalization(
  call: CallExpression,
  proof: DrizzleNormalization["proof"],
  schema: SchemaProjectedModel,
  delivered: ReturnType<typeof jsonColumnObservedReaders>,
): DrizzleNormalization {
  const input = call.getArguments()[0] ?? call;
  const matches = new Map<SchemaProjectedColumn, DrizzleNormalizationMatch>();
  for (const column of schema.tables.flatMap((table) => table.columns)) {
    if (column.typeOverride === null || column.json === null) {
      continue;
    }
    const shape = delivered.selected({ base: { kind: "schema-column", column: column.identity.key }, steps: [], displayAt: null });
    if (shape === null) {
      continue;
    }
    const sameShape = (steps: import("../../floor/code-facts/type-projection-contract.ts").NativeTypeSelector["steps"]): boolean => {
      const relation = selectedTypeRelation(
        delivered.typeSelections({
          selectors: [
            { base: { kind: "node", node: proof.schema }, steps: [{ kind: "property", name: "_output", at: proof.schema }], displayAt: null },
            { base: { kind: "schema-column", column: column.identity.key }, steps, displayAt: null },
          ],
          relations: [{ left: 0, right: 1 }],
        }),
        0,
      );
      return relation?.leftToRight === true && relation.rightToLeft;
    };
    matches.set(column, {
      whole: sameShape([]),
      fields: new Set(shape.vocabulary.properties.filter((name) => sameShape([{ kind: "property", name, at: input }]))),
    });
  }
  return { proof, matches };
}
