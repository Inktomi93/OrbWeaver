// Policy: no-test-fabrication (core/Spine-Testing.md §5) — tests may not erase a contract with `X as any`,
// fabricate typed entities with `X as unknown as Y`, or assert an object/array literal `as Y`. Every
// spelling survives a receiving contract gaining or renaming a required field; use a typed factory,
// `satisfies`, or an explicit unknown/raw validation boundary instead.
//
// AUTHORITY: ordinary/error. The gate-owned `FABRICATION-OK` parser, stale table, and line-based findings are
// retired. A deliberate occurrence uses the central exact-position waiver. Double casts report the authored
// `unknown` keyword; literal casts report the asserted type's waivable leading slice. Both are exact node
// coordinates; a type with no usable prefix anchors on its assertion keyword. A collision in one carrier
// remains deliberately unwaivable through the central over-broad alarm. The 429 live legacy markers were re-attested to consumed cast nodes before source translation.
//
// FAMILY `no-test-fabrication` is a singleton over one cast classifier. POPULATION PORT: legacy
// `scanRoot: p.startsWith("tests/")` and final `{ in:["@authored"], under:["tests/**"] }` admit the same
// root test corpus; a production-source counterexample remains in mustPass. `selected-files` is honest: every
// verdict is local to one AsExpression and no finalizer or shared fact exists.
import type { AsExpression, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const NON_FABRICATING_CAST_TARGETS: ReadonlySet<string> = new Set(["const", "unknown"]);
const ANY_CAST_MSG =
  "`X as any` in a test erases the receiving contract, so contract drift cannot fail the fixture. Use a production-derived type/factory, or an exact waiver only when invalid runtime input is the subject (Spine-Testing.md §3).";
const DOUBLE_CAST_MSG =
  "`X as unknown as Y` double-cast in a test — fabricates a typed value that survives Y gaining/renaming a " +
  "required field (test-support-dry-punchlist.md W1h). Use a typed factory or narrow the real value.";
const LITERAL_CAST_MSG = (typeText: string): string =>
  `object/array-literal \`as ${typeText}\` in a test — a hand-shaped literal asserted complete survives ` +
  `${typeText} growing a field (test-support-dry-punchlist.md W1h). Use a typed factory or \`satisfies ${typeText}\`.`;
const FIX =
  "use a production-derived typed factory (makeY(overrides?)), `satisfies Y`, or an explicit unknown/raw boundary. " +
  "A deliberate invalid-input occurrence waives with `@orb-waive no-test-fabrication(<position>): <why + end condition>` " +
  "on the line above; any casts report `any`, double casts report `unknown`, and literal casts report the asserted type's authored leading slice.";

function anyCastAnchor(node: AsExpression): TypeNode | undefined {
  const type = node.getTypeNode();
  return type?.getKind() === SyntaxKind.AnyKeyword ? type : undefined;
}

function doubleCastAnchor(node: AsExpression): TypeNode | undefined {
  const inner = node.getExpression();
  return Node.isAsExpression(inner) && inner.getTypeNode()?.getKind() === SyntaxKind.UnknownKeyword ? inner.getTypeNode() : undefined;
}

function literalCastAnchor(node: AsExpression): TypeNode | undefined {
  const expression = unwrapExpression(node.getExpression());
  const type = node.getTypeNode();
  if (!(Node.isObjectLiteralExpression(expression) || Node.isArrayLiteralExpression(expression)) || type === undefined) {
    return;
  }
  return NON_FABRICATING_CAST_TARGETS.has(type.getText()) ? undefined : type;
}

export const gate = defineGate({
  id: "no-test-fabrication",
  family: "no-test-fabrication",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored"], under: ["tests/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: DOUBLE_CAST_MSG,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.AsExpression],
        visit: (node) => {
          if (!Node.isAsExpression(node)) {
            return;
          }
          const any = anyCastAnchor(node);
          if (any !== undefined) {
            ctx.report.node(any, { token: "any", offset: 0, message: ANY_CAST_MSG, fix: FIX });
            return;
          }
          const double = doubleCastAnchor(node);
          if (double !== undefined) {
            ctx.report.node(double, { token: "unknown", offset: 0, message: DOUBLE_CAST_MSG, fix: FIX });
            return;
          }
          const literal = literalCastAnchor(node);
          if (literal === undefined) {
            return;
          }
          const authored = literal.getText();
          const coordinate = waivableCoordinate(authored);
          const anchor = coordinate === undefined ? node.getFirstChildByKind(SyntaxKind.AsKeyword) : literal;
          if (anchor === undefined) {
            throw new Error("literal fabrication has no authored assertion keyword");
          }
          ctx.report.node(anchor, {
            token: coordinate ?? "as",
            offset: 0,
            message: LITERAL_CAST_MSG(authored),
            fix: FIX,
          });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "tests/tooling/any-identifier.test.ts": "declare const source: unknown;\nexport const value = source as any;\n" },
      expect: { count: 1, token: "any", messageIncludes: "as any" },
      why: "an identifier cast to any erases the source contract just as completely as a fabricated typed literal",
    },
    {
      mode: "source",
      files: { "tests/tooling/any-literal.test.ts": "export const value = { n: 1 } as any;\n" },
      expect: { count: 1, token: "any", messageIncludes: "as any" },
      why: "an object literal cast to any bypasses both inference and every downstream contract",
    },
    {
      mode: "source",
      files: { "tests/tooling/parenthesized-type.test.ts": "export const x = {} as (Widget);\nexport const f = {} as (() => void);\n" },
      expect: { count: 2, token: "as" },
      why: "parenthesized and function types have no waivable leading type slice; the authored assertion keyword still anchors both violations",
    },
    {
      mode: "source",
      files: { "tests/tooling/x.test.ts": "export const x = {} as unknown as { a: number };\n" },
      expect: { count: 1, token: "unknown", messageIncludes: "double-cast" },
      why: "an X-as-unknown-as-Y double cast in a test",
    },
    {
      mode: "source",
      files: { "tests/tooling/lit.test.ts": "export const b = { n: 1 } as Widget;\n" },
      expect: { count: 1, token: "Widget", messageIncludes: "literal" },
      why: "an object literal asserted complete as a concrete type",
    },
    {
      mode: "source",
      files: { "tests/tooling/arr.test.ts": "export const c = [1, 2] as Widget[];\n" },
      expect: { count: 1, token: "Widget[]", messageIncludes: "literal" },
      why: "an array literal asserted complete as a concrete array type",
    },
    {
      mode: "source",
      files: { "tests/tooling/paren.test.ts": "export const d = ({ n: 1 }) as Widget;\n" },
      expect: { count: 1, token: "Widget", messageIncludes: "literal" },
      why: "parentheses do not change an object literal into a typed value",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/tooling/parenthesized-waiver.test.ts":
          "// @orb-waive no-test-fabrication(as): deliberate parenthesized target; ends with this fixture.\nexport const x = {} as (Widget);\n// @orb-waive no-test-fabrication(as): deliberate function target; ends with this fixture.\nexport const f = {} as (() => void);\n",
      },
      why: "the fallback assertion-keyword coordinate remains exactly waivable",
    },
    {
      mode: "source",
      files: { "tests/tooling/y.test.ts": "export const x = { a: 1 } satisfies { a: number };\n" },
      why: "satisfies re-checks the literal on every type change",
    },
    {
      mode: "source",
      files: { "tests/tooling/exempt.test.ts": "export const a = { n: 1 } as const;\nexport const b = { n: 1 } as unknown;\n" },
      why: "as const preserves inference and as unknown creates an explicit raw boundary without erasing the receiving contract",
    },
    {
      mode: "source",
      files: {
        "tests/tooling/waived-any.test.ts":
          "declare const source: unknown;\n// @orb-waive no-test-fabrication(any): deliberate invalid-input probe; ends when the boundary accepts unknown directly.\nexport const value = source as any;\n",
      },
      why: "the central positioned waiver licenses exactly one deliberate any cast at a runtime validation boundary",
    },
    {
      mode: "source",
      files: {
        "tests/tooling/waived-literal.test.ts":
          "// @orb-waive no-test-fabrication(Widget): deliberate invalid-input probe; ends when the parser accepts an untyped input.\nexport const b = { n: 1 } as Widget;\n",
      },
      why: "the central positioned waiver licenses exactly one literal fabrication occurrence",
    },
    {
      mode: "source",
      files: {
        "tests/tooling/waived-double.test.ts":
          "// @orb-waive no-test-fabrication(unknown): deliberate invalid-input probe; ends when the boundary accepts unknown directly.\nexport const a = {} as unknown as Widget;\n",
      },
      why: "the central positioned waiver licenses exactly one double-cast occurrence",
    },
    {
      mode: "source",
      files: {
        "tests/tooling/escape-chain.test.ts":
          "export const a = source\n  // @orb-waive no-test-fabrication(unknown): deliberate invalid-input probe; ends when map narrows its own input.\n  .map((value) => value as unknown as Widget);\n",
      },
      why: "a central marker before a chained call's dot token remains leading trivia for the reported cast",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/widget/x.ts": "export const a = {} as unknown as { n: number };\n",
        "tests/tooling/anchor.test.ts": "export const anchor = { n: 1 } satisfies { n: number };\n",
      },
      why: "a fabrication cast outside the root tests tree is outside this policy",
    },
  ],
});
