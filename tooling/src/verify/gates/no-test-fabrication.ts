// Policy: no-test-fabrication (docs/law/Spine-Testing.md §10) — tests may not erase a contract with `X as any`,
// fabricate typed entities with `X as unknown as Y`, assert an object/array literal `as Y`, or assert a value
// `as Y` that the checker cannot prove (an `any`/`unknown` operand, or one not assignable to Y; the shared
// `floor/code-facts/assignability.ts` decides). Every spelling survives a receiving contract gaining or renaming a
// required field; use a typed factory, `satisfies`, a parse, or an explicit unknown/raw boundary instead.
//
// AUTHORITY: ordinary/error. The gate-owned `FABRICATION-OK` parser, stale table, and line-based findings are
// retired. A deliberate occurrence uses the central exact-position waiver. Double casts report the authored
// `unknown` keyword; literal and value casts report the asserted type's waivable leading slice. Both are exact node
// coordinates; a type with no usable prefix anchors on its assertion keyword. A collision in one carrier
// remains deliberately unwaivable through the central over-broad alarm. The 429 live legacy markers were re-attested to consumed cast nodes before source translation.
//
// FAMILY `no-test-fabrication` is a singleton over one cast classifier. POPULATION PORT: legacy
// `scanRoot: p.startsWith("tests/")` and final `{ in:["@authored"], under:["tests/**"] }` admit the same
// root test corpus; a production-source counterexample remains in mustPass. `selected-files` is honest: every
// verdict is local to one AsExpression and its checker types, and no finalizer or shared fact exists.
import type { AsExpression, TypeNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { AgreementContext, AssignabilityRefusalKind } from "../../floor/code-facts/assignability.ts";
import { readAssignabilityChecker, typeRelationAcross } from "../../floor/code-facts/assignability.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const NON_FABRICATING_CAST_TARGETS: ReadonlySet<string> = new Set(["const", "unknown"]);
const ANY_CAST_MSG =
  "`X as any` in a test erases the receiving contract, so contract drift cannot fail the fixture. Use a production-derived type/factory, or an exact waiver only when invalid runtime input is the subject (Spine-Testing.md §3).";
const DOUBLE_CAST_MSG =
  "`X as unknown as Y` double-cast in a test — fabricates a typed value that survives Y gaining/renaming a " +
  "required field. Use a typed factory or narrow the real value (Spine-Testing.md §4).";
const LITERAL_CAST_MSG = (typeText: string): string =>
  `object/array-literal \`as ${typeText}\` in a test — a hand-shaped literal asserted complete survives ` +
  `${typeText} growing a field. Use a typed factory or \`satisfies ${typeText}\` (Spine-Testing.md §4).`;
const VALUE_CAST_MSG = (typeText: string): string =>
  `value cast \`as ${typeText}\` in a test the checker cannot prove — the value is \`any\`/\`unknown\` or another type, ` +
  `so a contract change to ${typeText} never reaches it. Parse it through the production schema or reader, narrow it, ` +
  "or build it with a typed factory (Spine-Testing.md §10).";
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

function isLiteralOperand(node: AsExpression): boolean {
  const expression = unwrapExpression(node.getExpression());
  return Node.isObjectLiteralExpression(expression) || Node.isArrayLiteralExpression(expression);
}

function literalCastAnchor(node: AsExpression): TypeNode | undefined {
  const type = node.getTypeNode();
  if (!isLiteralOperand(node) || type === undefined) {
    return;
  }
  return NON_FABRICATING_CAST_TARGETS.has(type.getText()) ? undefined : type;
}

// A value cast fabricates when the checker cannot prove the value already has the asserted type: an `any` or
// `unknown` operand, or a type the target is not assignable from. An up-cast the checker proves is no claim.
function valueCastAnchor(node: AsExpression, context: AgreementContext): TypeNode | undefined {
  const type = node.getTypeNode();
  // `no-loose-id-cast` owns `as never` everywhere, tests included.
  if (type === undefined || type.isKind(SyntaxKind.NeverKeyword) || NON_FABRICATING_CAST_TARGETS.has(type.getText()) || isLiteralOperand(node)) {
    return;
  }
  const relation = typeRelationAcross(context, node.getExpression(), node, (left, right) => [left.getType(), right.getType()]);
  if (relation === undefined) {
    throw new Error("no-test-fabrication: the value cast has no comparable native types");
  }
  return relation.leftIsAny || !relation.leftToRight ? type : undefined;
}

function reportTyped(ctx: GatePolicyContext, node: AsExpression, type: TypeNode, message: string): void {
  const authored = type.getText();
  // A head cut before a parenthesis can end in a space, which a marker's position cannot carry back.
  const coordinate = waivableCoordinate(authored)?.trimEnd();
  const anchor = coordinate === undefined ? node.getFirstChildByKind(SyntaxKind.AsKeyword) : type;
  if (anchor === undefined) {
    throw new Error("fabricating cast has no authored assertion keyword");
  }
  ctx.report.node(anchor, { token: coordinate ?? "as", offset: 0, message, fix: FIX });
}

export const gate = defineGate({
  id: "no-test-fabrication",
  family: "no-test-fabrication",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored"], under: ["tests/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: DOUBLE_CAST_MSG,
  fix: FIX,
  create: (ctx) => {
    const assignability = readAssignabilityChecker(ctx.checker());
    if (assignability === undefined) {
      throw new Error(
        "no-test-fabrication: this TypeScript build exposes no `checker.isTypeAssignableTo`, so a value cast cannot be judged (tooling/src/floor/code-facts/assignability.ts)",
      );
    }
    const refuse = (kind: AssignabilityRefusalKind): never => {
      const reasons: Readonly<Record<AssignabilityRefusalKind, string>> = {
        "primitive-absent": "this native program exposes no checker.isTypeAssignableTo, so a value cast cannot be judged",
        "no-shared-program": "the value and asserted type share no native compiler program",
        "programs-disagree": "native compiler programs disagree about value cast assignability",
      };
      throw new Error(`no-test-fabrication: ${reasons[kind]}`);
    };
    const context = { checker: assignability, refuse };
    return {
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
            if (literal !== undefined) {
              reportTyped(ctx, node, literal, LITERAL_CAST_MSG(literal.getText()));
              return;
            }
            const value = valueCastAnchor(node, context);
            if (value !== undefined) {
              reportTyped(ctx, node, value, VALUE_CAST_MSG(value.getText()));
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "tests/tooling/any-identifier.test.ts": "declare const source: unknown;\nexport const value = source as any;\n" },
      expect: { count: 1, token: "any", messageIncludes: "as any" },
      why: "an identifier cast to any erases the source contract just as completely as a fabricated typed literal",
    },
    {
      mode: "types",
      files: { "tests/tooling/any-literal.test.ts": "export const value = { n: 1 } as any;\n" },
      expect: { count: 1, token: "any", messageIncludes: "as any" },
      why: "an object literal cast to any bypasses both inference and every downstream contract",
    },
    {
      mode: "types",
      files: { "tests/tooling/parenthesized-type.test.ts": "export const x = {} as (Widget);\nexport const f = {} as (() => void);\n" },
      expect: { count: 2, token: "as" },
      why: "parenthesized and function types have no waivable leading type slice; the authored assertion keyword still anchors both violations",
    },
    {
      mode: "types",
      files: { "tests/tooling/x.test.ts": "export const x = {} as unknown as { a: number };\n" },
      expect: { count: 1, token: "unknown", messageIncludes: "double-cast" },
      why: "an X-as-unknown-as-Y double cast in a test",
    },
    {
      mode: "types",
      files: { "tests/tooling/lit.test.ts": "export const b = { n: 1 } as Widget;\n" },
      expect: { count: 1, token: "Widget", messageIncludes: "literal" },
      why: "an object literal asserted complete as a concrete type",
    },
    {
      mode: "types",
      files: { "tests/tooling/arr.test.ts": "export const c = [1, 2] as Widget[];\n" },
      expect: { count: 1, token: "Widget[]", messageIncludes: "literal" },
      why: "an array literal asserted complete as a concrete array type",
    },
    {
      mode: "types",
      files: { "tests/tooling/paren.test.ts": "export const d = ({ n: 1 }) as Widget;\n" },
      expect: { count: 1, token: "Widget", messageIncludes: "literal" },
      why: "parentheses do not change an object literal into a typed value",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/snap/run-bundle.test.ts":
          "interface RunIndex {\n  readonly v: number;\n}\ndeclare const text: string;\nexport const index = JSON.parse(text) as RunIndex;\n",
      },
      expect: { count: 1, token: "RunIndex", messageIncludes: "value cast" },
      why: "AN `any` OPERAND: `JSON.parse` returns any, which the checker calls assignable to everything, so assignability alone would pass the founding shape. The operand's any-ness is the evidence",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/raw.test.ts": "interface Widget {\n  readonly n: number;\n}\ndeclare const raw: unknown;\nexport const value = raw as Widget;\n",
      },
      expect: { count: 1, token: "Widget", messageIncludes: "value cast" },
      why: "an `unknown` operand asserted into a shape: the value was never parsed",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/frame.test.ts":
          "interface SdkFrame {\n  readonly kind: string;\n  readonly seq: number;\n}\ndeclare const frame: { readonly kind: string };\nexport const value = frame as SdkFrame;\n",
      },
      expect: { count: 1, token: "SdkFrame", messageIncludes: "value cast" },
      why: "A DOWN-CAST: the operand lacks a field the target requires, so the assertion claims what the checker cannot prove",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "tests/tooling/upcast.test.ts":
          "interface Base {\n  readonly kind: string;\n}\ninterface Full extends Base {\n  readonly seq: number;\n}\ndeclare const full: Full;\nexport const value = full as Base;\n",
      },
      why: "AN UP-CAST THE CHECKER PROVES is no claim: the operand already has the target type, so a contract change still reaches it",
    },
    {
      mode: "types",
      files: { "tests/tooling/never.test.ts": "declare const value: string;\nexport const erased = value as never;\n" },
      why: "`as never` belongs to `no-loose-id-cast`, which judges it in tests too; this policy does not report it twice",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/waived-value.test.ts":
          "interface Widget {\n  readonly n: number;\n}\ndeclare const raw: unknown;\n// @orb-waive no-test-fabrication(Widget): deliberate invalid-input probe; ends when the reader accepts unknown.\nexport const value = raw as Widget;\n",
      },
      why: "the central positioned waiver licenses exactly one value cast, at the asserted type's leading slice",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/waived-global.test.ts":
          "declare const host: unknown;\n// @orb-waive no-test-fabrication(typeof globalThis & { __reset:): deliberate global hook read; ends when the hook is injected.\nexport const reset = (host as typeof globalThis & { __reset: () => void }).__reset;\n",
      },
      why: "A HEAD CUT BEFORE A PARENTHESIS ends without its trailing space, so a marker can name it; reporting `{ __reset: ` with the space left the finding permanently unwaivable",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/parenthesized-waiver.test.ts":
          "// @orb-waive no-test-fabrication(as): deliberate parenthesized target; ends with this fixture.\nexport const x = {} as (Widget);\n// @orb-waive no-test-fabrication(as): deliberate function target; ends with this fixture.\nexport const f = {} as (() => void);\n",
      },
      why: "the fallback assertion-keyword coordinate remains exactly waivable",
    },
    {
      mode: "types",
      files: { "tests/tooling/y.test.ts": "export const x = { a: 1 } satisfies { a: number };\n" },
      why: "satisfies re-checks the literal on every type change",
    },
    {
      mode: "types",
      files: { "tests/tooling/exempt.test.ts": "export const a = { n: 1 } as const;\nexport const b = { n: 1 } as unknown;\n" },
      why: "as const preserves inference and as unknown creates an explicit raw boundary without erasing the receiving contract",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/waived-any.test.ts":
          "declare const source: unknown;\n// @orb-waive no-test-fabrication(any): deliberate invalid-input probe; ends when the boundary accepts unknown directly.\nexport const value = source as any;\n",
      },
      why: "the central positioned waiver licenses exactly one deliberate any cast at a runtime validation boundary",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/waived-literal.test.ts":
          "// @orb-waive no-test-fabrication(Widget): deliberate invalid-input probe; ends when the parser accepts an untyped input.\nexport const b = { n: 1 } as Widget;\n",
      },
      why: "the central positioned waiver licenses exactly one literal fabrication occurrence",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/waived-double.test.ts":
          "// @orb-waive no-test-fabrication(unknown): deliberate invalid-input probe; ends when the boundary accepts unknown directly.\nexport const a = {} as unknown as Widget;\n",
      },
      why: "the central positioned waiver licenses exactly one double-cast occurrence",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/escape-chain.test.ts":
          "export const a = source\n  // @orb-waive no-test-fabrication(unknown): deliberate invalid-input probe; ends when map narrows its own input.\n  .map((value) => value as unknown as Widget);\n",
      },
      why: "a central marker before a chained call's dot token remains leading trivia for the reported cast",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/widget/x.ts": "export const a = {} as unknown as { n: number };\n",
        "tests/tooling/anchor.test.ts": "export const anchor = { n: 1 } satisfies { n: number };\n",
      },
      why: "a fabrication cast outside the root tests tree is outside this policy",
    },
  ],
});
