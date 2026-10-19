// Original fabrication catch/pass corpus retained for the native successor.
import type { GatePolicy } from "../../../../../tooling/src/verify/contract/policy.ts";

export const FABRICATION_PROOFS = {
  mustFlag: [
    {
      mode: "types",
      files: {
        "tests/tooling/any-identifier.test.ts": "declare const source: unknown;\nexport const value = source as any;\n",
      },
      expect: {
        count: 1,
        token: "any",
        messageIncludes: "as any",
      },
      why: "an identifier cast to any erases the source contract just as completely as a fabricated typed literal",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/any-literal.test.ts": "export const value = { n: 1 } as any;\n",
      },
      expect: {
        count: 1,
        token: "any",
        messageIncludes: "as any",
      },
      why: "an object literal cast to any bypasses both inference and every downstream contract",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/parenthesized-type.test.ts": "export const x = {} as (Widget);\nexport const f = {} as (() => void);\n",
      },
      expect: {
        count: 2,
        token: "as",
      },
      why: "parenthesized and function types have no waivable leading type slice; the authored assertion keyword still anchors both violations",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/x.test.ts": "export const x = {} as unknown as { a: number };\n",
      },
      expect: {
        count: 1,
        token: "unknown",
        messageIncludes: "double-cast",
      },
      why: "an X-as-unknown-as-Y double cast in a test",
    },
    {
      mode: "types",
      files: {
        "tests/support/node/x.ts": "export const x = {} as unknown as { a: number };\n",
      },
      expect: {
        count: 1,
        token: "unknown",
        messageIncludes: "double-cast",
      },
      why: "shared product builders must construct real values rather than using the tooling value-cast boundary",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/lit.test.ts": "export const b = { n: 1 } as Widget;\n",
      },
      expect: {
        count: 1,
        token: "Widget",
        messageIncludes: "literal",
      },
      why: "an object literal asserted complete as a concrete type",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/arr.test.ts": "export const c = [1, 2] as Widget[];\n",
      },
      expect: {
        count: 1,
        token: "Widget[]",
        messageIncludes: "literal",
      },
      why: "an array literal asserted complete as a concrete array type",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/paren.test.ts": "export const d = ({ n: 1 }) as Widget;\n",
      },
      expect: {
        count: 1,
        token: "Widget",
        messageIncludes: "literal",
      },
      why: "parentheses do not change an object literal into a typed value",
    },
    {
      mode: "types",
      files: {
        "tests/client/snap/run-bundle.test.ts":
          "interface RunIndex {\n  readonly v: number;\n}\ndeclare const text: string;\nexport const index = JSON.parse(text) as RunIndex;\n",
      },
      expect: {
        count: 1,
        token: "RunIndex",
        messageIncludes: "value cast",
      },
      why: "AN `any` OPERAND: `JSON.parse` returns any, which the checker calls assignable to everything, so assignability alone would pass the founding shape. The operand's any-ness is the evidence",
    },
    {
      mode: "types",
      files: {
        "tests/support/node/raw.ts": "interface Widget {\n  readonly n: number;\n}\ndeclare const raw: unknown;\nexport const value = raw as Widget;\n",
      },
      expect: {
        count: 1,
        token: "Widget",
        messageIncludes: "value cast",
      },
      why: "an `unknown` operand asserted into a shape: the value was never parsed",
    },
    {
      mode: "types",
      files: {
        "tests/client/frame.test.ts":
          "interface SdkFrame {\n  readonly kind: string;\n  readonly seq: number;\n}\ndeclare const frame: { readonly kind: string };\nexport const value = frame as SdkFrame;\n",
      },
      expect: {
        count: 1,
        token: "SdkFrame",
        messageIncludes: "value cast",
      },
      why: "A DOWN-CAST: the operand lacks a field the target requires, so the assertion claims what the checker cannot prove",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "tests/tooling/artifact.test.ts":
          "interface Artifact { readonly n: number }\ndeclare const raw: unknown;\nexport const value = raw as Artifact;\nexport const parsed = JSON.parse('{}') as Artifact;\n",
      },
      why: "D325 leaves tooling artifact value casts to the author without exempting any, literal or double casts",
    },
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
      files: {
        "tests/tooling/never.test.ts": "declare const value: string;\nexport const erased = value as never;\n",
      },
      why: "`as never` belongs to the native `orb/no-loose-id-cast` rule, which judges it in tests too; this policy does not report it twice",
    },
    {
      mode: "types",
      files: {
        "tests/support/node/waived-value.ts":
          "interface Widget {\n  readonly n: number;\n}\ndeclare const raw: unknown;\n// @orb-waive no-test-fabrication(Widget): deliberate invalid-input probe; ends when the reader accepts unknown.\nexport const value = raw as Widget;\n",
      },
      why: "the central positioned waiver licenses exactly one value cast, at the asserted type's leading slice",
    },
    {
      mode: "types",
      files: {
        "tests/client/waived-global.test.ts":
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
      files: {
        "tests/tooling/y.test.ts": "export const x = { a: 1 } satisfies { a: number };\n",
      },
      why: "satisfies re-checks the literal on every type change",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/exempt.test.ts": "export const a = { n: 1 } as const;\nexport const b = { n: 1 } as unknown;\n",
      },
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
} satisfies Pick<GatePolicy, "mustFlag" | "mustPass">;
