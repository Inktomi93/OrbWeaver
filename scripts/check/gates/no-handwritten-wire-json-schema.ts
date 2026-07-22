// Gate: no-handwritten-wire-json-schema (core/Core-Path-Registry.md D79) — the T6 seal. After the
// structured-output UNIFICATION WAVE there is exactly ONE way to fill a wire `schema` field: project a zod
// schema through `@orb/kit/json-schema` `projectJsonSchema`. A hand-authored JSON-Schema literal
// (`schema: { type: "object", ... }`) passed to a `responseFormat`/wire `schema` field is the retired debt —
// RED. The projected value is a CALL (`schema: projectJsonSchema(x)`) or a spread of an already-projected
// schema (`schema: { ...format.schema }`), neither of which carries a literal `type: "object"` member, so the
// live translators + migrated consumers stay green; only a reintroduced hand-authored literal bites.
import type { Identifier, ObjectLiteralExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

/** Strip `as`/`satisfies`/parenthesized wraps so the reader isn't blinded to the underlying literal. */
function unwrap(node: Node | undefined): Node | undefined {
  let n = node;
  while (n !== undefined && (Node.isAsExpression(n) || Node.isSatisfiesExpression(n) || Node.isParenthesizedExpression(n))) {
    n = n.getExpression();
  }
  return n;
}

/** Resolve a MODULE-LOCAL `const NAME = <initializer>` in the same file to its unwrapped initializer — the
 *  identifier-indirect debt shape (`const S = { type: "object", … }; … schema: S`, exactly how all three
 *  retired sites spelled it). An IMPORTED identifier has no local declaration here → undefined (LEGAL: a
 *  `projectJsonSchema(x)` result const resolves to a CallExpression, not an object literal, and a shared
 *  import isn't this gate's concern). One level of indirection is the documented shape; deeper re-aliasing
 *  is not the debt. Wraps on the const's initializer are stripped by `unwrap`. */
function localConstInitializer(id: Identifier): Node | undefined {
  const name = id.getText();
  const decls = id.getSourceFile().getVariableDeclarations();
  const decl = decls.find((d) => d.getName() === name);
  return decl === undefined ? undefined : unwrap(decl.getInitializer());
}

/** True when `value` is a hand-authored wire-schema literal — either inline, or the identifier-indirect
 *  form resolved to a module-local const carrying `type: "object"`. */
function isHandwrittenWireSchema(value: Node | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  if (Node.isObjectLiteralExpression(value)) {
    return isJsonSchemaObjectLiteral(value);
  }
  if (Node.isIdentifier(value)) {
    const resolved = localConstInitializer(value);
    return resolved !== undefined && Node.isObjectLiteralExpression(resolved) && isJsonSchemaObjectLiteral(resolved);
  }
  return false;
}

/** True when the object literal carries a `type: "object"` member — the tell of a hand-authored JSON Schema. */
function isJsonSchemaObjectLiteral(obj: ObjectLiteralExpression): boolean {
  for (const prop of obj.getProperties()) {
    if (!Node.isPropertyAssignment(prop) || prop.getName() !== "type") {
      continue;
    }
    const value = unwrap(prop.getInitializer());
    if (value !== undefined && Node.isStringLiteral(value) && value.getLiteralText() === "object") {
      return true;
    }
  }
  return false;
}

export const gate: GateDescriptor = {
  name: "no-handwritten-wire-json-schema",
  docRow: "core/Core-Path-Registry.md D79",
  status: "active",
  scopeSafety: "incremental-safe", // per-file: a `schema:` literal is judged entirely within its own file
  message:
    "a hand-authored JSON-Schema literal is passed to a wire `schema` field — after the D79 unification wave the ONE source of a wire schema is `projectJsonSchema` (zod → JSON Schema). Core-Path-Registry.md D79.",
  fix: 'declare a zod payload schema and project it: `schema: projectJsonSchema(payloadSchema)` — never a hand-authored `{ type: "object", ... }` literal.',
  // The wire/model-facing schemas live in server/contracts/kit; tests legitimately build wire shapes for
  // assertions, and the gate corpus's own EXAMPLE strings are fixtures — exclude all three.
  scanRoot: (p) =>
    (p.startsWith("packages/server/src/") || p.startsWith("packages/contracts/src/") || p.startsWith("packages/kit/src/")) &&
    !p.includes(".test.") &&
    !p.includes(".test-d.") &&
    !p.startsWith("scripts/"),
  kinds: [SyntaxKind.PropertyAssignment],
  visit: (node, _sf, ctx) => {
    if (!Node.isPropertyAssignment(node) || node.getName() !== "schema") {
      return;
    }
    if (isHandwrittenWireSchema(unwrap(node.getInitializer()))) {
      ctx.report(node, { token: "schema", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'export const rf = { name: "x", schema: { type: "object", properties: {} } };\n',
      at: "packages/server/src/domain/x/verbs/y.ts",
      expect: { messageIncludes: "hand-authored JSON-Schema literal" },
      why: 'a hand-authored `schema: { type: "object" }` literal on a ResponseFormat — the retired debt (D79)',
    },
    {
      files: 'export const rf = { name: "x", schema: { type: "object", properties: {} } as const };\n',
      at: "packages/contracts/src/z.ts",
      expect: { messageIncludes: "hand-authored JSON-Schema literal" },
      why: "the same literal behind an `as const` wrap — the reader unwraps it, no silent GREEN",
    },
    {
      files: 'const S = { type: "object", properties: {} };\nexport const rf = { name: "x", schema: S };\n',
      at: "packages/server/src/domain/x/verbs/y.ts",
      expect: { messageIncludes: "hand-authored JSON-Schema literal" },
      why: "the identifier-indirect shape — a module-local const passed by reference, EXACTLY how all three retired sites spelled it; resolving the local decl closes the silent-GREEN gap (D79)",
    },
    {
      files: 'const S = { type: "object", properties: {} } as const;\nexport const rf = { name: "x", schema: S };\n',
      at: "packages/contracts/src/z.ts",
      expect: { messageIncludes: "hand-authored JSON-Schema literal" },
      why: "identifier-indirect with an `as const` wrap on the CONST's initializer — unwrapped after resolution, still bites",
    },
  ],
  mustPass: [
    {
      files: 'export const rf = { name: "x", schema: projectJsonSchema(payloadSchema) };\n',
      at: "packages/server/src/domain/x/verbs/y.ts",
      why: "the ONE sanctioned form — the schema is projected from a zod schema, not hand-authored",
    },
    {
      files: "export const body = { json_schema: { name: format.name, schema: { ...format.schema } } };\n",
      at: "packages/server/src/infra/providers/backends/kit/wire.ts",
      why: 'a translator spreading an already-projected schema — no literal `type: "object"` member, passes',
    },
    {
      files: 'const S = projectJsonSchema(payloadSchema);\nexport const rf = { name: "x", schema: S };\n',
      at: "packages/server/src/domain/x/verbs/y.ts",
      why: "a projected schema held in a local const passed by reference — the const resolves to a CALL, not a literal; the sanctioned form survives the indirect-resolution arm",
    },
    {
      files: 'import { SHARED_SCHEMA } from "./shared.ts";\nexport const rf = { name: "x", schema: SHARED_SCHEMA };\n',
      at: "packages/server/src/domain/x/verbs/y.ts",
      why: "an IMPORTED identifier — no module-local declaration to resolve; imports are LEGAL (not this gate's concern), so it must not bite",
    },
  ],
};
