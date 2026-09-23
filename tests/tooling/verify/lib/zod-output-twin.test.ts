import type { Expression } from "ts-morph";
import { Node, Project } from "ts-morph";
import { readContextualZodOutputTwin } from "../../../../tooling/src/verify/lib/zod-output-twin.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ZOD_PROOF_MODULE = `
export interface ZodType<Output = unknown, Input = unknown> {
  readonly _output: Output;
  readonly _input: Input;
}
export declare function string(): ZodType<string>;
export declare function object<const Shape extends Readonly<Record<string, ZodType>>>(shape: Shape): ZodType<{ [Key in keyof Shape]: Shape[Key]["_output"] }>;
export declare function literal<const Value extends string>(value: Value): ZodType<Value>;
`;

/** The `.schema` property-access expression reading the CONTAINER's field (never `this.schema` inside the
 * container class's own constructor) — the reader's real input shape. */
function firstSchemaAccess(source: string, path = "/packages/kit/src/json-schema/lift.ts"): Expression {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/node_modules/zod/index.d.ts", ZOD_PROOF_MODULE);
  const file = project.createSourceFile(path, source);
  let found: Expression | undefined;
  file.forEachDescendant((node) => {
    if (found === undefined && Node.isPropertyAccessExpression(node) && node.getName() === "schema" && !Node.isThisExpression(node.getExpression())) {
      found = node;
    }
  });
  if (found === undefined) {
    throw new Error("no .schema access found in the proof source");
  }
  return found;
}

// The real lift.ts shape (#2d68e7b): the brand lives on the type alias's intersected literal, not on the
// carrier class itself, because a `declare` computed class field cannot survive Playwright's bundled Babel
// transform when a CT spec transitively imports this module.
const CANONICAL_SOURCE = `
import * as z from "zod";
declare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;
class RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }
type RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };
function boxGeneratedSchema<Schema extends z.ZodType>(schema: Schema): RuntimeGeneratedSchema<Schema> { return new RuntimeGeneratedSchemaBox(schema) as RuntimeGeneratedSchema<Schema>; }
const generated = boxGeneratedSchema(z.string());
const composed: readonly z.ZodType[] = [generated.schema];
`;

test("a .schema read through the intersected-brand container is exempt from contextual parity", () => {
  const access = firstSchemaAccess(CANONICAL_SOURCE);
  expect(readContextualZodOutputTwin(access)).toEqual({ kind: "none" });
});

test("a same-named shadow outside lift.ts cannot borrow the exemption from an intersected brand", () => {
  const shadowSource = `
import * as z from "zod";
declare const RUNTIME_GENERATED_SCHEMA_BRAND: unique symbol;
class RuntimeGeneratedSchemaBox<Schema extends z.ZodType = z.ZodType> { readonly schema: Schema; constructor(schema: Schema) { this.schema = schema; } }
type RuntimeGeneratedSchema<Schema extends z.ZodType = z.ZodType> = RuntimeGeneratedSchemaBox<Schema> & { readonly [RUNTIME_GENERATED_SCHEMA_BRAND]: true };
function fakeBox<Schema extends z.ZodType>(schema: Schema): RuntimeGeneratedSchema<Schema> { return new RuntimeGeneratedSchemaBox(schema) as RuntimeGeneratedSchema<Schema>; }
const counterfeit = fakeBox(z.string());
const composed: readonly z.ZodType[] = [counterfeit.schema];
`;
  const access = firstSchemaAccess(shadowSource, "/packages/contracts/src/x.ts");
  expect(readContextualZodOutputTwin(access).kind).not.toBe("none");
});

test("a bare member with no brand at all stays visible", () => {
  const bareSource = `
import * as z from "zod";
const holder: { readonly schema: z.ZodType<{ id: string }> } = { schema: z.object({ id: z.literal("x") }) };
const composed: readonly z.ZodType<{ id: string }>[] = [holder.schema];
`;
  const access = firstSchemaAccess(bareSource, "/packages/contracts/src/x.ts");
  expect(readContextualZodOutputTwin(access).kind).not.toBe("none");
});
