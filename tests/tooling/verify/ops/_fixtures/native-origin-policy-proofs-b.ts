// Founding and nearest-legal policy inputs, retained verbatim when their descriptors move to native rules.
import type { GatePolicy } from "../../../../../tooling/src/verify/contract/policy.ts";
import { intlLookalikeProof, intlNestedProof } from "../../../../../tooling/src/verify/gates/_proof/intl.ts";

export const NATIVE_ORIGIN_POLICY_PROOFS_B: readonly Pick<GatePolicy, "id" | "mustFlag" | "mustPass">[] = [
  {
    id: "zod-modern-spellings",
    mustFlag: [
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
          "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const s = z.object({}).strict();\n',
        },
        expect: {
          count: 1,
          token: "strict",
        },
        why: "ARM A's founding shape — `.strict()` directly on a `z.object(…)` call, the one shape with a mechanical `z.strictObject` remedy",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
          "packages/contracts/src/x.ts": 'import * as zod from "zod";\nexport const s = zod.z["object"]({}).strict();\n',
        },
        expect: {
          count: 1,
          token: "strict",
        },
        why: "THE NAMESPACE + COMPUTED-LITERAL respelling of the same receiver: the legacy reader compared the receiver's text to the literal `z`, so this was exempt by spelling alone",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
          "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const s = z.union([z.literal("a"), z.literal("b")]);\n',
        },
        expect: {
          count: 1,
          token: "union",
        },
        why: "ARM B's founding shape — an ALL-LITERAL union, whose refusal names no option",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
          "packages/contracts/src/x.ts": 'import { z as s } from "zod";\nexport const schema = s.union([s.literal("a"), s.literal("b")]);\n',
        },
        expect: {
          count: 1,
          token: "union",
        },
        why: "THE ALIAS RED on both the union AND its members — every arm must resolve through the door, and a text compare against `z.literal` saw none of these",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
          "packages/server/src/foundation/env/x.ts": 'import { z } from "zod";\nexport const flag = z.enum(["true", "false"]);\n',
        },
        expect: {
          count: 1,
          token: "enum",
        },
        why: "ARM D's founding shape — the hand-rolled env boolean the pinned `envBool` codec replaced",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  strictObject: (shape: unknown) => ZodObject;\n};\n",
          "packages/contracts/src/anchor.ts": "export const anchor = 1;\n",
          "tests/tooling/x.test.ts": 'import { z } from "zod";\nexport const s = z.object({}).strict();\n',
        },
        expect: {
          count: 1,
          token: "strict",
        },
        why: "THE TEST-PATH ARM: the same superseded spelling in `tests/**` is judged, because a test is product evidence and a stale spelling there teaches the next author the old one. The `packages/contracts` anchor keeps the run off a `[population]` tool error when the test file is the only finding",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts": "export declare const z: {\n  strictObject: (shape: unknown) => unknown;\n};\n",
          "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const s = z.strictObject({});\n',
        },
        why: "the fix for ARM A — the modern spelling carries no `.strict()` at all",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n};\n",
          "packages/contracts/src/x.ts": 'import { z } from "zod";\nconst base = z.object({});\nexport const s = base.strict();\n',
        },
        why: "THE DECLARED NARROWING: `.strict()` on a schema VARIABLE has no `z.strictObject` respelling, so flagging it would demand a fix that does not exist. The receiver must be the object call itself",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  string: () => unknown;\n  number: () => unknown;\n};\n",
          "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const s = z.union([z.string(), z.number()]);\n',
        },
        why: "an undiscriminated union of NON-literals is a different construct with no multi-value literal respelling — the arm requires every member to be a zod literal",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts": "export declare const z: {\n  enum: (values: readonly string[]) => unknown;\n};\n",
          "packages/server/src/foundation/env/x.ts": 'import { z } from "zod";\nexport const mode = z.enum(["on", "off"]);\n',
        },
        why: "an enum of two NON-boolean strings is an ordinary vocabulary, not a hand-rolled `stringbool`",
      },
      {
        mode: "types",
        files: {
          "packages/contracts/src/local.ts":
            "const z = {\n  object(shape: unknown): { strict: () => unknown } {\n    return { strict: () => shape };\n  },\n};\nexport const s = z.object({}).strict();\n",
        },
        why: "THE COUNTERFACTUAL: a project object spelled `z` with an `object` method whose result has `.strict()`. The text the legacy reader compared is IDENTICAL; the origin is a local declaration, so it is a different identity",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
          "packages/contracts/src/x.ts":
            'import { z } from "zod";\n// @orb-waive zod-modern-spellings(strict): the proof\'s stand-in reason; ends when this fixture stops flagging.\nexport const s = z.object({}).strict();\n',
        },
        why: "ARM A's POSITION, proving the header's suppression claim: the report anchors on the authored METHOD token, so ARM A is waived as `strict` — not as `object` and not as the whole chain. The fixture is mustFlag[0] (:190) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
          "packages/contracts/src/x.ts":
            'import { z } from "zod";\n// @orb-waive zod-modern-spellings(union): the proof\'s stand-in reason; ends when this fixture stops flagging.\nexport const s = z.union([z.literal("a"), z.literal("b")]);\n',
        },
        why: "ARM B's POSITION: the same policy id with a DIFFERENT position token, which is what lets one line carrying two arms keep them apart. `literal` is not a position here — the members are not findings. The fixture is mustFlag[2] (:210) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
          "packages/server/src/foundation/env/x.ts":
            'import { z } from "zod";\n// @orb-waive zod-modern-spellings(enum): the proof\'s stand-in reason; ends when this fixture stops flagging.\nexport const flag = z.enum(["true", "false"]);\n',
        },
        why: "ARM D's POSITION, the third of the three tokens the header names — an env boolean is the one arm with a standing reason to be waived at a boot-refusal site. The fixture is mustFlag[4] (:230) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
      },
      {
        mode: "types",
        files: {
          "packages/contracts/src/shapes.ts":
            "export const union = (arms: readonly unknown[]): unknown => arms;\nexport const literal = (value: unknown): unknown => value;\n",
          "packages/contracts/src/x.ts": 'import { literal, union } from "./shapes.ts";\nexport const s = union([literal("a"), literal("b")]);\n',
        },
        why: "THE DOOR TEST, which the header's whole identity claim rests on and which nothing used to exercise: a project module that exports `union` and `literal` produces a call the candidate prefilter accepts and the ORIGIN reader resolves — to `packages/contracts/src/shapes.ts`, not to the `zod` door. Cut the door test in `lib/zod-origin.ts#isZodCall` and this row reds. The existing counterfactual (`mustPass[4]`) uses a LOCAL object, which the origin reader refuses outright; this one RESOLVES and is still not zod, which is the harder half",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[], params?: unknown) => unknown;\n};\n",
          "packages/contracts/src/anchor.ts": "export const anchor = 1;\n",
          "tooling/src/snap/ops/x.ts": 'import { z } from "zod";\nexport const s = z.union([z.literal("a"), z.literal("b")]);\n',
        },
        why: "THE POPULATION FENCE: ARM B's founding shape, moved to `@tooling`, produces nothing. `packages/**` is the judged corpus exactly as legacy scanned it — dev tooling is KISS by doctrine. The `@packages` anchor is load-bearing: a fixture holding only the tooling file admits zero paths and the run comes back a `[population]` TOOL ERROR rather than a finding. Widen `population` to `@authored` and this is the row that dies",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[], params?: unknown) => unknown;\n};\n",
          "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const s = z.object({}).strict("why");\n',
        },
        why: "ARM A's ARITY FENCE: `.strict()` is the zero-argument legacy-compat call `z.strictObject` replaces. A `.strict(<params>)` call is a different overload carrying an error message, and it has no argument-preserving respelling, so flagging it would demand a fix that does not exist. Cut `node.getArguments().length > 0` and this row reds",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[], params?: unknown) => unknown;\n};\n",
          "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const s = z.union([z.literal("a")]);\n',
        },
        why: "ARM B's MINIMUM: a ONE-member union is not the shape F7 is about — the nested `invalid_union` issue the arm exists to remove needs at least two options to nest, and a single-member union is a modelling accident with no multi-value literal to become. Cut `members.length >= MIN_LITERAL_UNION_MEMBERS` and this row reds",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[], params?: unknown) => unknown;\n};\n",
          "packages/server/src/foundation/env/x.ts": 'import { z } from "zod";\nexport const flag = z.enum(["true", "true"]);\n',
        },
        why: "ARM D's DISTINCTNESS TEST: two members, both boolean strings, but the SAME one twice. That is not a hand-rolled `stringbool` — it accepts one value — so `z.stringbool` is not its respelling. Cut `texts[0] !== texts[1]` and this row reds",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[], params?: unknown) => unknown;\n};\n",
          "packages/server/src/foundation/env/x.ts": 'import { z } from "zod";\nexport const flag = z.enum(["true", "false"], { error: "not a boolean" });\n',
        },
        why: "THE SOLE-ARGUMENT FENCE in `soleArrayArgument`: ARM D's founding shape plus a params object. A `z.enum` carrying custom error params is not a drop-in for the pinned `envBool` codec — the params are exactly what F5 says are the point — so the arm requires the array to be the call's ONLY argument. Cut `args.length === 1` and this row reds. It is the one fence shared by all three arms, since every arm reads its members through this helper",
      },
      {
        mode: "types",
        files: {
          "node_modules/zod/index.d.ts":
            "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  strictObject: (shape: unknown) => ZodObject;\n};\n",
          "packages/contracts/src/anchor.ts": "export const anchor = 1;\n",
          "tests/tooling/x.test.ts": 'import { z } from "zod";\nexport const s = z.strictObject({});\n',
        },
        why: "the pass control of the test-path arm: the modern `z.strictObject` spelling under `tests/**` is clean, so the arm flags the spelling and not the directory",
      },
    ],
  },
  {
    id: "no-raw-intl-time",
    mustFlag: [
      {
        mode: "types",
        files: {
          "packages/kit/src/time/index.ts": "export const createTimeLib = (): unknown => new Intl.DateTimeFormat('en-US');\n",
          "packages/client/src/comp.tsx": "export function Foo(): unknown {\n  return new Intl.DateTimeFormat('en-US');\n}\n",
        },
        expect: {
          count: 2,
        },
        why: "the founding `intl-formatter` shape in a feature, plus the kit time home's own construction — THE PERMISSION IS NOT A CARVE-OUT: the seam reds like any other file and is licensed by an exact grant row",
      },
      {
        mode: "types",
        files: {
          // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
          "packages/client/src/comp.tsx": "export function Foo(): string {\n  return new Date().toLocaleDateString();\n}\n",
        },
        expect: {
          count: 1,
          token: "toLocaleDateString",
        },
        why: "the founding `tolocale` shape — an un-memoized per-call formatter that drifts from every kit/time site",
      },
      {
        mode: "types",
        grant: {
          subject: "packages/client/src/alias.ts",
          operation: "intl-formatter",
        },
        files: {
          "packages/client/src/alias.ts": "const I = Intl;\nexport const f = (): unknown => new I.DateTimeFormat('en-US');\n",
        },
        expect: {
          count: 1,
        },
        why: "A CONST ALIAS of the ambient global is the same formatter one binding away; the legacy receiver-TEXT check (`getText() === \"Intl\"`) was offered `I` and answered 'not my subject'",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/computed.ts": 'export const f = (): unknown => new Intl["RelativeTimeFormat"]("en");\n',
        },
        expect: {
          count: 1,
        },
        why: "the COMPUTED-LITERAL member spelling of the same formatter (#1506), invisible to the legacy PropertyAccess-only arm",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/both.ts": "export function f(d: Date): string {\n  return d.toLocaleTimeString() + d.toLocaleDateString();\n}\n",
        },
        expect: {
          count: 1,
        },
        why: "GRANT GRANULARITY: two `.toLocale*` calls in one file are ONE `(subject, operation)` finding, because a row matching both would be OVER-BROAD and would license neither",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/cast-locale.ts": "export function f(d: Date): string {\n  return (d as { toLocaleString(): string }).toLocaleString();\n}\n",
        },
        expect: {
          count: 1,
          token: "toLocaleString",
        },
        why: "THE CAST DODGE on the tolocale arm: the cast declares `toLocaleString` in its own type literal, so the property-symbol reader answered 'a proven different identity' and the call PASSED while its uncast twin reported. The receiver is still a `Date`",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/cast-intl.ts":
            'const g = globalThis as { Intl: { DateTimeFormat: new (locale: string) => unknown } };\nexport const f = (): unknown => new g.Intl.DateTimeFormat("en");\n',
        },
        expect: {
          count: 1,
        },
        why: "THE CAST DODGE on the intl arm, through a const hop: the members declare inside the cast's type literal, but the chain's ROOT is the ambient global and that cannot be cast away",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/cast-intl-inline.ts":
            'export const f = (): unknown => new (globalThis as { Intl: { DateTimeFormat: new (locale: string) => unknown } }).Intl.DateTimeFormat("en");\n',
        },
        expect: {
          count: 1,
        },
        why: "the same dodge written inline, with no binding to follow — the chain reader strips the cast at every step",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/opaque-locale.ts":
            "declare function opaque(): any;\nexport function f(): string {\n  return opaque().toLocaleDateString();\n}\n",
        },
        expect: {
          count: 1,
          messageIncludes: "CANNOT be established",
        },
        why: "THE FAIL-CLOSED THIRD ANSWER (#944) on the tolocale arm, reached by no row before #2014: an OPAQUE receiver resolves no property symbol and declares nothing uncast either, so `classifyPackageMemberOrigin` refuses on both axes and case (b) REPORTS it. It is the exact complement of the `typeless-cast` mustPass row: a CAST is a proven different declaration and passes, NO type at all is no evidence and fails closed — and the pair only means something because this row pins the message the closed arm emits. The count alone cannot: the unreadable arm reports one finding, identically to the ordinary verdict",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: {
          "packages/kit/src/time/index.ts": "export declare function createTimeLib(): unknown;\n",
          "packages/client/src/ok.ts": 'import { createTimeLib } from "../../kit/src/time/index.ts";\nexport const f = (): unknown => createTimeLib();\n',
        },
        why: "the fix: the call site reads through the memoized kit seam and constructs nothing. The seam's DOOR is planted so the specifier really resolves — an unresolvable import would make this row pass by fail-closure instead of by identity",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/local.ts": "interface Money {\n  toLocaleString(): string;\n}\nexport const f = (m: Money): string => m.toLocaleString();\n",
        },
        why: "SAME METHOD NAME, PROJECT TYPE: an interface declaring its own `toLocaleString` is not the ECMAScript formatter — the legacy name-only arm red it, and only the declaring lib can say otherwise",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/shadow.ts": "const Intl = {\n  DateTimeFormat: class {},\n};\nexport const f = (): unknown => new Intl.DateTimeFormat();\n",
        },
        why: "A LOCAL BINDING named `Intl` proves a DIFFERENT identity (case (a) of the refusal classifier) — the legacy receiver-text check red exactly this",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/typeless-cast.ts":
            "export function f(raw: string): string {\n  return (JSON.parse(raw) as { toLocaleString(): string }).toLocaleString();\n}\n",
        },
        why: "THE DECLARED LIMIT of the cast axis: a value with NO real type behind the cast (`JSON.parse` returns `any`) carries no evidence that the call is the ECMAScript formatter — the uncast receiver declares nothing, so the finding would be a guess",
      },
      {
        mode: "types",
        files: {
          ...intlLookalikeProof(),
          "packages/client/src/other-global.ts": "export const f = (): unknown => new Formats.DateTimeFormat('en-US');\n",
        },
        why: 'THE GLOBAL-IDENTITY FENCE (`globalName === INTL`): a DIFFERENT trusted ambient global carrying a member named `DateTimeFormat` resolves to `globalName: "Formats"` with a one-long member path, so only the global NAME comparison rejects it — the depth clause beside it passes. Cut the name comparison and this row flags. The plant is `_proof/intl.ts`, whose header records why no counterexample can come from the shipped lib and which acceptance branch it takes',
      },
      {
        mode: "types",
        files: {
          ...intlNestedProof(),
          "packages/client/src/intl-nested.ts": "export const f = (): unknown => new Intl.legacy.DateTimeFormat('en-US');\n",
        },
        why: 'THE MEMBER-DEPTH FENCE (`memberPath.length === 1`): a formatter NAME nested one level deeper under the real `Intl` global resolves to `globalName: "Intl"` with a TWO-long member path, so only the depth test rejects it — the global-identity clause beside it passes. Cut the depth test and this row flags. `no-raw-matchmedia.ts:53-59` records ITS `memberPath.length === 0` sibling as unfalsifiable, and that reasoning is sound THERE and does not carry here: matchmedia\'s only counterexample must be read off an ALREADY-FLAGGING node (`matchMedia` is the api name itself), so reviewed-grant dedupe collapses it and the count is one either way. `Intl` is a NAMESPACE, so the counterexample reads through `Intl.legacy`, which flags nothing — there is nothing to dedupe onto, and the row is real',
      },
      {
        mode: "types",
        files: {
          "packages/client/src/number.ts": "export const f = (n: number): unknown => new Intl.NumberFormat('en-US').format(n);\n",
        },
        why: "`Intl.NumberFormat` is not a TIME formatter and is out of subject — number formatting has its own home (`@orb/kit/strings`), and this policy's vocabulary is exact",
      },
    ],
  },
  {
    id: "no-manual-autosave-flush",
    mustFlag: [
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n  void form.handleSubmit();\n}\n',
        },
        expect: {
          count: 1,
          token: "pushFieldValue",
        },
        why: "the founding shape — a void-wrapped handleSubmit beside pushFieldValue; the factory's store driver owns persistence now",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport const onRemove = async (form: FormApi): Promise<void> => {\n  await form.removeFieldValue("items", 0);\n  await form.handleSubmit();\n};\n',
        },
        expect: {
          count: 1,
        },
        why: "an awaited handleSubmit in an ARROW body beside removeFieldValue — awaited plus arrow-body must still be caught",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function onMove(form: FormApi): void {\n  form.moveFieldValues("items", 0, 1);\n  void (form).handleSubmit();\n}\n',
        },
        expect: {
          count: 1,
        },
        why: "a parenthesized receiver on handleSubmit beside moveFieldValues — the paren wrap must not hide the flush",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form["pushFieldValue"]("items", 1);\n  void form["handleSubmit"]();\n}\n',
        },
        expect: {
          count: 1,
        },
        why: "the COMPUTED-LITERAL spelling of BOTH calls — the legacy `getName()` collector was offered no PropertyAccess at all, so bracket syntax was a whole-body escape (#1506)",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\ndeclare const form: FormApi;\nform.pushFieldValue("items", 1);\nvoid form.handleSubmit();\nexport const done = 1;\n',
        },
        expect: {
          count: 1,
          token: "pushFieldValue",
        },
        why: "#1989/D4 — A MODULE-SCOPE PAIR: both calls sit at the top level of the file, outside any function. `enclosingBody` used to return `undefined` there and the visitor dropped the call silently — a live escape, not a missing pin. It now falls back to the source file, so the two calls group into one body exactly as they would inside a function",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\ndeclare function opaque(): any;\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n  void opaque().handleSubmit();\n}\n',
        },
        expect: {
          count: 1,
          token: "pushFieldValue",
          messageIncludes: "CANNOT be established",
        },
        why: "#1990/D1 — THE UNREADABLE ARM, PROVEN: `handleSubmit` is called on an opaque `any`-typed receiver, so its origin cannot be resolved to the form api or ruled out. Reported rather than passed (#944) — `unreadable = !(arrayOp.proven && submit.proven)` at :133 fires because the submit half is unproven",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n}\n',
        },
        why: "a structural array op alone — the driver persists it, no flush; legal (D78)",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function onSubmit(form: FormApi, e: { preventDefault: () => void }): void {\n  e.preventDefault();\n  void form.handleSubmit();\n}\n',
        },
        why: "an explicit submit handler with no array op — legal (saved-entity forms, retry affordances)",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n}\nexport function onSubmit(form: FormApi): void {\n  void form.handleSubmit();\n}\n',
        },
        why: "array op and handleSubmit in SEPARATE sibling functions — the per-function-body scope is real, they must NOT combine",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function outer(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n  const submitLater = (): void => {\n    void form.handleSubmit();\n  };\n  void submitLater;\n}\n',
        },
        why: "the handleSubmit lives in a NESTED function, not the outer body that holds the array op — grouping by INNERMOST enclosing function reproduces the legacy stop-at-nested rule exactly",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/features/x/lib/x.ts":
            'interface LocalList {\n  pushFieldValue(field: string, value: unknown): void;\n  handleSubmit(): void;\n}\nexport function onAdd(list: LocalList): void {\n  list.pushFieldValue("items", 1);\n  list.handleSubmit();\n}\n',
        },
        why: "SAME METHOD NAMES, LOCAL TYPE: a project object with both members is not the form api, and the legacy receiver-blind name check RED it",
      },
      {
        mode: "types",
        files: {
          "node_modules/vendor-lookalike/index.d.ts":
            "export declare class QueryClient {\n  cancelQueries(filters?: unknown): Promise<void>;\n  setQueryData(key: unknown, updater: unknown): unknown;\n  invalidateQueries(filters?: unknown): Promise<void>;\n  getQueryData(key: unknown): unknown;\n  removeQueries(filters?: unknown): void;\n  resetQueries(filters?: unknown): Promise<void>;\n}\nexport interface Options {\n  staleTime?: number | 'static';\n}\nexport declare function configure(options: Options): void;\nexport declare function useQueryClient(): QueryClient;\nexport declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  handleSubmit(): Promise<void>;\n}\nexport declare function useForm(options?: unknown): unknown;\nexport declare function createFormHook(options: unknown): { useAppForm: unknown };\nexport declare function createFormHookContexts(): { useFieldContext: <T>() => T };\nexport interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "vendor-lookalike";\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n  void form.handleSubmit();\n}\n',
        },
        why: "SAME METHOD NAMES, WRONG PACKAGE: a FormApi declared in node_modules/vendor-lookalike/index.d.ts is not TanStack Form's, and the doctrine's save driver is TanStack's",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  // @orb-waive no-manual-autosave-flush(pushFieldValue): the proof\'s stand-in reason; ends when this fixture stops flagging.\n  form.pushFieldValue("items", 1);\n  void form.handleSubmit();\n}\n',
        },
        why: "POSITIONAL IDENTITY: the verdict is about a PAIR of calls but the report anchors on the ARRAY-OP call site with that op's own name as the token (:134-138), so the waiver names `pushFieldValue` — a marker naming `handleSubmit` would be a dead position even though that call is half the offense. The fixture is mustFlag[0] (:151, count 1) plus the marker line inside the same function body, which is the carrier the finding sits in; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form.reset();\n  void form.handleSubmit();\n}\n',
        },
        why: "#1999 — THE MEMBER-NAME SET FENCE, PINNED: `ARRAY_OPS`/`SUBMIT` (:26-27) admit only the four structural array ops plus `handleSubmit`; `reset()` is a real FormApi member outside that set, so pairing it with `handleSubmit` in one body must pass untouched. Cutting `ARRAY_OPS.has(name) || name === SUBMIT` at :63 turns this red — `reset` would then be counted as the array-op half of the pair",
      },
      {
        mode: "types",
        files: {
          "node_modules/@tanstack/form-core/index.d.ts":
            "export declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  removeFieldValue(field: string, index: number): Promise<void>;\n  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;\n  moveFieldValues(field: string, from: number, to: number): Promise<void>;\n  handleSubmit(): Promise<void>;\n  reset(): void;\n}\n",
          "packages/client/src/features/x/lib/x.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n}\n',
          "packages/client/src/forms/editor/flush.ts":
            'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n  void form.handleSubmit();\n}\n',
        },
        why: "#1999 — THE `features/**` POPULATION FENCE, PINNED: the offending pair sits at `packages/client/src/forms/editor/flush.ts`, outside `population.under` (:93), and must pass untouched; `packages/client/src/features/x/lib/x.ts` (a legal array-op-alone shape, itself 0 findings) is the IN-POPULATION ANCHOR the row needs so an unfenced run admits at least one path instead of tool-erroring on an empty population (§4.1's population-falsifier rule). Cutting `under: ['packages/client/src/features/**']` turns the `forms/editor/flush.ts` half of this row red",
      },
    ],
  },
  {
    id: "no-chat-trpc-in-surface",
    mustFlag: [
      {
        mode: "types",
        files: {
          "node_modules/@trpc/tanstack-react-query/index.d.ts":
            "export interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface DecorateQueryProcedure {\n  queryOptions(): unknown;\n  queryKey(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n  getChat: DecorateQueryProcedure;\n}\nexport interface DatabankRouter {\n  create: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n  databank: DatabankRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/features/chat/surfaces/some-surface.tsx":
            'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function Surface(): unknown {\n  const trpc = useTRPC();\n  return trpc.chat.send.mutationOptions();\n}\n',
        },
        expect: {
          count: 1,
          token: "mutationOptions",
        },
        why: "the founding shape — a chat verb's mutationOptions written at a surface instead of in features/chat/hooks/",
      },
      {
        mode: "types",
        files: {
          "node_modules/@trpc/tanstack-react-query/index.d.ts":
            "export interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface DecorateQueryProcedure {\n  queryOptions(): unknown;\n  queryKey(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n  getChat: DecorateQueryProcedure;\n}\nexport interface DatabankRouter {\n  create: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n  databank: DatabankRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/features/chat/surfaces/some-surface.tsx":
            'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function Surface(): unknown {\n  const api = useTRPC();\n  return api.chat.send.mutationOptions();\n}\n',
        },
        expect: {
          count: 1,
        },
        why: "THE PROXY UNDER ANOTHER NAME: the legacy check required the root identifier to be spelled `trpc`, so renaming the binding was a one-character escape. The resolved proxy TYPE carries the identity instead",
      },
      {
        mode: "types",
        files: {
          "node_modules/@trpc/tanstack-react-query/index.d.ts":
            "export interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface DecorateQueryProcedure {\n  queryOptions(): unknown;\n  queryKey(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n  getChat: DecorateQueryProcedure;\n}\nexport interface DatabankRouter {\n  create: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n  databank: DatabankRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/features/chat/surfaces/some-surface.tsx":
            'import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";\nexport const options = (trpc: TRPCOptionsProxy): unknown => trpc.chat.send.mutationOptions();\n',
        },
        expect: {
          count: 1,
        },
        why: "THE CALLBACK PARAMETER shape the codebase actually uses (`options: (trpc) => trpc.x.y.mutationOptions()`): the proxy is a parameter, so it has no module origin at all and only its TYPE can identify it",
      },
      {
        mode: "types",
        files: {
          "node_modules/@trpc/tanstack-react-query/index.d.ts":
            "export interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface DecorateQueryProcedure {\n  queryOptions(): unknown;\n  queryKey(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n  getChat: DecorateQueryProcedure;\n}\nexport interface DatabankRouter {\n  create: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n  databank: DatabankRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/features/chat/surfaces/some-surface.tsx":
            'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function Surface(): unknown {\n  const trpc = useTRPC();\n  return trpc["chat"]["send"]["mutationOptions"]();\n}\n',
        },
        expect: {
          count: 1,
        },
        why: "the fully COMPUTED-LITERAL chain is the same reference — the shared member reader normalizes each hop, where the legacy three-hop PropertyAccess walk was offered nothing (#1506)",
      },
      {
        mode: "types",
        files: {
          "node_modules/@trpc/tanstack-react-query/index.d.ts":
            "export interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface DecorateQueryProcedure {\n  queryOptions(): unknown;\n  queryKey(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n  getChat: DecorateQueryProcedure;\n}\nexport interface DatabankRouter {\n  create: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n  databank: DatabankRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/features/chat/surfaces/local-root.tsx":
            'import type { DecorateMutationProcedure } from "@trpc/tanstack-react-query";\ndeclare const local: { chat: { send: DecorateMutationProcedure } };\nexport const go = (): unknown => local.chat.send.mutationOptions();\n',
        },
        expect: {
          count: 1,
          messageIncludes: "CANNOT be established",
        },
        why: "#1989/D2 — `isProxyRoot` (:61-64), PROVEN: `mutationOptions` is a proven trpc-declared member, but its CHAIN ROOT (`local`) is not the resolved `TRPCOptionsProxy`, so whether this is the chat router's verb CANNOT be established. Cutting `isProxyRoot` down to `identity.kind === 'resolved'` leaves this fixture at the SAME count with the ORDINARY message instead — a count-only row is blind to that, so this row also closes the unreadable arm (#1990/D1) for the same fixture",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: {
          "node_modules/@trpc/tanstack-react-query/index.d.ts":
            "export interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface DecorateQueryProcedure {\n  queryOptions(): unknown;\n  queryKey(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n  getChat: DecorateQueryProcedure;\n}\nexport interface DatabankRouter {\n  create: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n  databank: DatabankRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/features/chat/hooks/use-chat-verbs.ts":
            'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function useSend(): unknown {\n  return useTRPC().chat.send.mutationOptions();\n}\n',
          "packages/client/src/features/chat/surfaces/some-surface.tsx":
            'import { useSend } from "../hooks/use-chat-verbs.ts";\nexport function Surface(): unknown {\n  return useSend();\n}\n',
        },
        why: "SCOPE plus the sanctioned shape — the verb lives in hooks/ (outside the population) and the surface calls it",
      },
      {
        mode: "types",
        files: {
          "node_modules/@trpc/tanstack-react-query/index.d.ts":
            "export interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface DecorateQueryProcedure {\n  queryOptions(): unknown;\n  queryKey(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n  getChat: DecorateQueryProcedure;\n}\nexport interface DatabankRouter {\n  create: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n  databank: DatabankRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/features/databank/surfaces/some-surface.tsx":
            'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function Surface(): unknown {\n  return useTRPC().databank.create.mutationOptions();\n}\n',
        },
        why: "ANOTHER ROUTER is untouched — this law fences the chat verb home, and the segment is read off a chain already proven to be the tRPC proxy",
      },
      {
        mode: "types",
        files: {
          "packages/client/src/features/chat/surfaces/some-surface.tsx":
            "interface Verb {\n  mutationOptions(): unknown;\n}\ninterface LocalApi {\n  chat: { send: Verb };\n}\nexport const options = (api: LocalApi): unknown => api.chat.send.mutationOptions();\n",
        },
        why: "SAME SHAPE, LOCAL TYPE: an object literally spelled `x.chat.send.mutationOptions()` is not the tRPC proxy. The legacy walk accepted anything whose root identifier read `trpc`, which is the shadow the manifest recorded",
      },
      {
        mode: "types",
        files: {
          "node_modules/vendor-lookalike/index.d.ts":
            "export declare class QueryClient {\n  cancelQueries(filters?: unknown): Promise<void>;\n  setQueryData(key: unknown, updater: unknown): unknown;\n  invalidateQueries(filters?: unknown): Promise<void>;\n  getQueryData(key: unknown): unknown;\n  removeQueries(filters?: unknown): void;\n  resetQueries(filters?: unknown): Promise<void>;\n}\nexport interface Options {\n  staleTime?: number | 'static';\n}\nexport declare function configure(options: Options): void;\nexport declare function useQueryClient(): QueryClient;\nexport declare class FormApi {\n  pushFieldValue(field: string, value: unknown): void;\n  handleSubmit(): Promise<void>;\n}\nexport declare function useForm(options?: unknown): unknown;\nexport declare function createFormHook(options: unknown): { useAppForm: unknown };\nexport declare function createFormHookContexts(): { useFieldContext: <T>() => T };\nexport interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/features/chat/surfaces/some-surface.tsx":
            'import { useTRPC } from "vendor-lookalike";\nexport function Surface(): unknown {\n  return useTRPC().chat.send.mutationOptions();\n}\n',
        },
        why: "SAME CHAIN, WRONG PACKAGE: a proxy declared in node_modules/vendor-lookalike/index.d.ts — same type name, same router, same member — is not this app's tRPC surface, and only the declaring package separates them",
      },
      {
        mode: "types",
        files: {
          "node_modules/@trpc/tanstack-react-query/index.d.ts":
            "export interface DecorateMutationProcedure {\n  mutationOptions(): unknown;\n}\nexport interface DecorateQueryProcedure {\n  queryOptions(): unknown;\n  queryKey(): unknown;\n}\nexport interface ChatRouter {\n  send: DecorateMutationProcedure;\n  getChat: DecorateQueryProcedure;\n}\nexport interface DatabankRouter {\n  create: DecorateMutationProcedure;\n}\nexport type TRPCOptionsProxy = {\n  chat: ChatRouter;\n  databank: DatabankRouter;\n};\nexport declare function useTRPC(): TRPCOptionsProxy;\n",
          "packages/client/src/features/chat/surfaces/some-surface.tsx":
            'import { useTRPC } from "@trpc/tanstack-react-query";\nexport function Surface(): unknown {\n  const trpc = useTRPC();\n  // @orb-waive no-chat-trpc-in-surface(mutationOptions): the proof\'s stand-in reason; ends when this fixture stops flagging.\n  return trpc.chat.send.mutationOptions();\n}\n',
        },
        why: "POSITIONAL IDENTITY: the anchor is `{ token: MUTATION_OPTIONS, offset: node.getText().lastIndexOf(MUTATION_OPTIONS) }`, so an author waives the tRPC MEMBER (`mutationOptions`) at the end of the chain — never the proxy binding, the `chat` router segment, or the verb name. The fixture is mustFlag[0] (:111, count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
      },
    ],
  },
];
