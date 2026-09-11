// core/Core-Path-Registry.md D79 — the T6 seal. After the structured-output unification wave there is
// exactly ONE way to fill a wire `schema` field: project a zod schema through `@orb/kit/json-schema`
// `projectJsonSchema`. A hand-authored JSON-Schema literal is the retired debt. Both reads are shared: the
// field NAME through the member/static readers (so a computed `["schema"]` key is the same field) and the
// VALUE through the stable-binding resolver, which follows a const or an imported constant to the literal
// it names — the indirection the legacy same-file-only arm could not cross. Limits live in mustPass.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { inspectReferenceWrites, readStaticString, resolveStableExpression } from "../lib/reference-fact.ts";

const SCHEMA_KEY = "schema";
const TYPE_KEY = "type";
const OBJECT_TYPE = "object";

const MESSAGE =
  "a hand-authored JSON-Schema literal is passed to a wire `schema` field — after the D79 unification wave " +
  "the ONE source of a wire schema is `projectJsonSchema` (zod → JSON Schema). Core-Path-Registry.md D79.";

const FIX =
  'declare a zod payload schema and project it: `schema: projectJsonSchema(payloadSchema)` — never a hand-authored `{ type: "object", ... }` literal.';

/** Legacy `scanRoot` admitted `packages/{server,contracts,kit}/src` minus every `.test.` and `.test-d.`
 *  path (its `scripts/` clause was already unreachable under those three prefixes). */
const WIRE_HOME_POPULATION = { in: ["@server", "@contracts", "@kit"], notNamed: ["*.test.*", "*.test-d.*"] } as const;

/** The authored NAME of an object member, across identifier, string-literal and computed-literal keys. */
function propertyName(property: MorphNode): string | null {
  if (!Node.isPropertyAssignment(property)) {
    return null;
  }
  const nameNode = property.getNameNode();
  if (Node.isIdentifier(nameNode)) {
    return nameNode.getText();
  }
  if (Node.isStringLiteral(nameNode) || Node.isNoSubstitutionTemplateLiteral(nameNode)) {
    return nameNode.getLiteralText();
  }
  if (!Node.isComputedPropertyName(nameNode)) {
    return null;
  }
  const computed = readStaticString(nameNode.getExpression());
  return computed.kind === "resolved" ? computed.value : null;
}

/** The terminal expression a value names, following stable bindings through consts and imports. A value the
 *  shared reader refuses (a call, a member read) is returned unchanged, which is what keeps a projected
 *  `projectJsonSchema(...)` result out of the object-literal arm below.
 *
 *  A BINDING WHOSE MEMBERS ARE WRITTEN IS NOT FOLLOWED. `resolveStableExpression` resolves the binding to
 *  its initializer and says so explicitly: origin/value readers refuse member effects separately. A
 *  transpiler that seeds `const root = { type: "object", … }` and then ASSEMBLES it
 *  (`root["required"] = …`) has authored a skeleton, not a schema — its value is the assembly, which is
 *  exactly the shape D79 encourages. Following it anyway accused `contracts/src/refinery/schema-forge.ts`
 *  on the real tree. */
function terminalValue(node: MorphNode): MorphNode {
  if (Node.isIdentifier(node) && inspectReferenceWrites(node).kind === "unresolved") {
    return node;
  }
  const stable = resolveStableExpression(node);
  return stable.kind === "resolved" ? stable.value : node;
}

/** Does this object literal carry the `type: "object"` member that marks a hand-authored JSON Schema? Both
 *  halves go through the shared readers, so a computed key and a const-held `"object"` still count. */
function isJsonSchemaObjectLiteral(value: MorphNode): boolean {
  if (!Node.isObjectLiteralExpression(value)) {
    return false;
  }
  return value.getProperties().some((property) => {
    if (!Node.isPropertyAssignment(property) || propertyName(property) !== TYPE_KEY) {
      return false;
    }
    const initializer = property.getInitializer();
    if (initializer === undefined) {
      return false;
    }
    const literal = readStaticString(initializer);
    return literal.kind === "resolved" && literal.value === OBJECT_TYPE;
  });
}

export const gate = defineGate({
  id: "no-handwritten-wire-json-schema",
  family: "no-handwritten-wire-json-schema",
  authority: "ordinary",
  severity: "error",
  population: WIRE_HOME_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAssignment],
        visit: (node) => {
          if (!Node.isPropertyAssignment(node) || propertyName(node) !== SCHEMA_KEY) {
            return;
          }
          const initializer = node.getInitializer();
          if (initializer === undefined || !isJsonSchemaObjectLiteral(terminalValue(initializer))) {
            return;
          }
          const nameNode = node.getNameNode();
          ctx.report.node(nameNode, { token: SCHEMA_KEY, offset: nameNode.getText().indexOf(SCHEMA_KEY) });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/domain/x/verbs/y.ts": 'export const rf = { name: "x", schema: { type: "object", properties: {} } };\n' },
      expect: { count: 1, token: "schema" },
      why: 'the founding shape — a hand-authored `schema: { type: "object" }` literal on a ResponseFormat, the retired D79 debt',
    },
    {
      mode: "types",
      files: { "packages/contracts/src/z.ts": 'export const rf = { name: "x", schema: { type: "object", properties: {} } as const };\n' },
      expect: { count: 1, token: "schema" },
      why: "the same literal behind an `as const` wrap — the shared reader unwraps it, so the wrapper is no silent green",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/x/verbs/local.ts": 'const S = { type: "object", properties: {} };\nexport const rf = { name: "x", schema: S };\n' },
      expect: { count: 1, token: "schema" },
      why: "the identifier-indirect shape — a module-local const passed by reference, EXACTLY how all three retired sites spelled it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/verbs/shared.ts": 'export const SHARED_SCHEMA = { type: "object", properties: {} };\n',
        "packages/server/src/domain/x/verbs/imported.ts":
          'import { SHARED_SCHEMA } from "./shared.ts";\nexport const rf = { name: "x", schema: SHARED_SCHEMA };\n',
      },
      expect: { count: 1, token: "schema" },
      why: "AN IMPORTED hand-authored literal is the same retired debt, moved one file away. The legacy reader resolved only same-file consts and declared imports 'not this gate's concern', which made an extraction the escape hatch — a DELIBERATE widening, recorded here and measured on the real tree",
    },
    {
      mode: "types",
      files: { "packages/kit/src/x/computed.ts": 'export const rf = { name: "x", ["schema"]: { type: "object" } };\n' },
      expect: { count: 1, token: "schema" },
      why: "a COMPUTED key names the same wire field, and a computed `type` key would hide the tell just as well — both go through the shared name reader now",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/verbs/const-type.ts":
          'const OBJECT = "object";\nexport const rf = { name: "x", schema: { type: OBJECT, properties: {} } };\n',
      },
      expect: { count: 1, token: "schema" },
      why: "the `type` value held in a CONST — the legacy reader required a StringLiteral node at that exact position and answered no to a binding",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/forge.ts":
          'export function transpile(fields: readonly string[]): { readonly schema: Record<string, unknown> } {\n  const root: Record<string, unknown> = { type: "object", properties: {}, required: [] };\n  const properties = root["properties"] as Record<string, unknown>;\n  for (const field of fields) {\n    properties[field] = { type: "string" };\n  }\n  root["required"] = [...fields];\n  return { schema: root };\n}\n',
      },
      why: "A MEMBER-MUTATED BUILDER ROOT is not a hand-authored literal: the transpiler seeds a skeleton and then ASSEMBLES the schema from a design, which is the derive D79 encourages. `resolveStableExpression` resolves the binding and says explicitly that value readers must refuse member effects separately — omitting that guard accused `contracts/src/refinery/schema-forge.ts` on the real tree",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/verbs/projected.ts":
          'declare function projectJsonSchema(input: unknown): unknown;\ndeclare const payloadSchema: unknown;\nexport const rf = { name: "x", schema: projectJsonSchema(payloadSchema) };\n',
      },
      why: "the ONE sanctioned form — the schema is PROJECTED from a zod schema, and a call is not an object literal at any number of binding hops",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/backends/kit/wire.ts":
          "declare const format: { readonly name: string; readonly schema: Record<string, unknown> };\nexport const body = { json_schema: { name: format.name, schema: { ...format.schema } } };\n",
      },
      why: 'a translator SPREADING an already-projected schema carries no literal `type: "object"` member — the live wire-translation shape, and the reason the tell is the member rather than the shape of the object',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/verbs/projected-const.ts":
          'declare function projectJsonSchema(input: unknown): unknown;\ndeclare const payloadSchema: unknown;\nconst S = projectJsonSchema(payloadSchema);\nexport const rf = { name: "x", schema: S };\n',
      },
      why: "a projected schema held in a local const still resolves to a CALL, not a literal — the sanctioned form survives the indirection arm the widening above adds",
    },
    {
      mode: "types",
      files: { "packages/contracts/src/array-schema.ts": 'export const rf = { name: "x", schema: { type: "array", items: {} } };\n' },
      why: 'DECLARED LIMIT — the tell is `type: "object"`, the shape every retired site had. A non-object JSON-Schema literal is out of subject rather than silently in it',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/verbs/waived.ts":
          '// @orb-waive no-handwritten-wire-json-schema(schema): a fixed provider handshake shape that has no zod source to project from; ends when the provider contract is modelled.\nexport const rf = { name: "x", schema: { type: "object", properties: {} } };\n',
      },
      why: "the ONE central positioned waiver naming the exact reported field — malformed, stale and over-broad markers are proven CENTRALLY, never re-proved per policy",
    },
  ],
});
