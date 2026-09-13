// core/Core-Path-Registry.md D79 — the T6 seal. After the structured-output unification wave there is
// exactly ONE way to fill a wire `schema` field: project a zod schema through `@orb/kit/json-schema`
// `projectJsonSchema`. A hand-authored JSON-Schema literal is the retired debt. Both reads are shared: the
// field NAME through the member/static readers (so a computed `["schema"]` key is the same field) and the
// VALUE through the stable-binding resolver, which follows a const or an imported constant to the literal
// it names — the indirection the legacy same-file-only arm could not cross. Limits live in mustPass.
//
// FAMILY `no-handwritten-wire-json-schema` — a declared SINGLETON. D79's T6 seal is one rule about one wire
// field; no sibling policy asks what fills it. It consumes `lib/reference-fact.ts` (stable-binding
// resolution, member-write inspection, static strings) and `lib/property-assignment-name.ts` for both key
// tests, and sharing readers with three other modules is not a family (guide §2, §7 item 4).
//
// POPULATION PORT: byte-identical, legacy at `0d83d99f1^` — that `scanRoot` admitted
// `packages/{server,contracts,kit}/src` minus every `.test.`/`.test-d.` path (its `scripts/` clause was
// already unreachable under those three prefixes). The final `WIRE_HOME_POPULATION` is the same set, and its
// `notNamed` half is pinned by a mustPass row placing the founding literal in a co-located spec.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { propertyAssignmentName } from "../lib/property-assignment-name.ts";
import { inspectReferenceWrites, readStaticString, resolveStableExpression } from "../lib/reference-fact.ts";

const SCHEMA_KEY = "schema";
const TYPE_KEY = "type";
const OBJECT_TYPE = "object";

const MESSAGE =
  "a hand-authored JSON-Schema literal is passed to a wire `schema` field — after the D79 unification wave " +
  "the ONE source of a wire schema is `projectJsonSchema` (zod → JSON Schema). Core-Path-Registry.md D79.";

const FIX =
  "declare a zod payload schema and project it: `schema: projectJsonSchema(payloadSchema)` — never a " +
  'hand-authored `{ type: "object", ... }` literal. A deliberate site is waived with `@orb-waive ' +
  "no-handwritten-wire-json-schema(<position>): <reason>` on the line above, where <position> is the " +
  "literal `schema` — the object-literal property key.";

/** Legacy `scanRoot` admitted `packages/{server,contracts,kit}/src` minus every `.test.` and `.test-d.`
 *  path (its `scripts/` clause was already unreachable under those three prefixes). */
const WIRE_HOME_POPULATION = { in: ["@server", "@contracts", "@kit"], notNamed: ["*.test.*", "*.test-d.*"] } as const;

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
    if (!Node.isPropertyAssignment(property) || propertyAssignmentName(property) !== TYPE_KEY) {
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
          if (!Node.isPropertyAssignment(node) || propertyAssignmentName(node) !== SCHEMA_KEY) {
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
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/verbs/other-field.ts": 'export const rf = { name: "x", payload: { type: "object", properties: {} } };\n',
      },
      why: 'DECLARED LIMIT, and the receipt for the SCHEMA field name — the identical hand-authored JSON-Schema literal under a key that is NOT `schema`. D79 seals the WIRE `schema` field; an object literal with a `type: "object"` member elsewhere is an ordinary shape, not a structured-output contract. Widening the field name to any key reds this row (w9 :262, #2046)',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/verbs/other-tell.ts": 'export const rf = { name: "x", schema: { kind: "object", properties: {} } };\n',
      },
      why: 'DECLARED LIMIT, and the receipt for the `type` KEY — a `schema` object whose `"object"` value sits under `kind`, not `type`. The tell is `type: "object"` because that is the JSON-Schema keyword every retired site carried; a `kind` discriminant is a different vocabulary and this policy does not own it. Widening the tell key to any property reds this row (w9 :262, #2046)',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/verbs/anchor.ts":
          'declare function projectJsonSchema(input: unknown): unknown;\ndeclare const payloadSchema: unknown;\nexport const rf = { name: "x", schema: projectJsonSchema(payloadSchema) };\n',
        "packages/server/src/domain/x/verbs/forge.test.ts": 'export const rf = { name: "x", schema: { type: "object", properties: {} } };\n',
      },
      why: "THE POPULATION FENCE — the founding hand-authored literal in a `*.test.*` basename inside a wire home, beside an in-population anchor. A spec asserting what the projector PRODUCES must be free to spell the expected JSON Schema by hand; D79 is a rule about what the PRODUCTION wire path may author. Dropping the `*.test.*`/`*.test-d.*` exclusion reds this row (w9 :262, #2046)",
    },
  ],
});
