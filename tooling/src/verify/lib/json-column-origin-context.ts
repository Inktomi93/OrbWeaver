// Consumer-owned normalizer validity/parity decisions are data; floor provenance never calls this reader.
import type { CallExpression, Node } from "ts-morph";
import { readCallBindings, readCallClosure } from "../../floor/code-facts/call-returns.ts";
import type { DrizzleNormalization, DrizzleNormalizationMatch, DrizzleNormalizerSnapshot } from "../../floor/code-facts/drizzle-origin-contract.ts";
import { resolved } from "../../floor/code-facts/type-member-origin-core.ts";
import type { JsonColumnOriginContext } from "../contract/json-column-origin.ts";
import type { SchemaModel } from "../contract/schema-fact.ts";
import { readJsonColumnNormalizer } from "./json-column-normalizer.ts";

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
  return { schema, bindings: new Map(), active: new Set(), mergeActive: new Set(), normalizers };
}

/** Preserve consumer recursion state while rebinding a real callable's parameters. */
export function jsonColumnCallContext(call: CallExpression, owner: Node, context: JsonColumnOriginContext): JsonColumnOriginContext {
  return { ...context, bindings: readCallBindings(call, owner, context.bindings) };
}
