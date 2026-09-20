// Policy: zod-modern-spellings (docs/history/reviews/stickler/2026-08-02-zod-leverage-audit.md §F2/F5/F7) —
// the anti-backslide ratchet for three superseded zod spellings whose remedies already landed on the tree.
// The gate exists so the old spelling cannot creep back through a copy-paste from an older file or an
// agent's zod-3 muscle memory.
//
//   ARM A — `.strict()` directly on a `z.object(…)` call → `z.strictObject(…)` [F2]. The five sites that
//     carried it did so for a written reason that is FALSE on 4.4.3: `$strict` is byte-identical to
//     `$strip` in the installed `core/schemas.d.ts`, so the claimed index-signature inflation does not
//     happen. DELIBERATELY NARROW — the receiver must be the `object(…)` call itself, because that is the
//     only shape with a mechanical remedy; `.strict()` on a schema VARIABLE has no `strictObject`
//     respelling at all, so flagging it would demand a fix that does not exist.
//   ARM B — an ALL-LITERAL `z.union([z.literal(a), z.literal(b), …])` → multi-value `z.literal([a, b, …])`
//     [F7]. Not cosmetic: the union form emits a NESTED `invalid_union` issue, the multi-value literal emits
//     ONE `invalid_value` naming every option — the difference between a refusal a human can act on and one
//     they cannot. Undiscriminated unions of non-literals are a different construct and are never touched.
//   ARM D — `z.enum(["true", "false"])` → the pinned `envBool` codec [F5]. The PARAMS are the point: a bare
//     `z.stringbool()` is case-INSENSITIVE and also accepts `1/0/yes/no/on/off`, so an unpinned drop-in
//     silently WIDENS a boot-refusal vocabulary. The arm bites the hand-rolled ENUM, never a bare codec.
//
// ARM C IS ITS OWN POLICY. The hand-flattened `.error.issues` read has reviewed-grant authority — its seven
// survivors are MODEL-facing `path: message` joins and structural write-guard re-emits, each a standing
// repository permission rather than an occurrence slip — and one descriptor carries one authority. It is
// `zod-error-issues-home`, same family.
//
// IDENTITY, NOT SPELLING: every arm resolves its callee through the shared module-origin reader to the
// `zod` door. The legacy reader compared the callee's TEXT against a hardcoded `z` namespace, so
// `import * as zod`, `import { union }`, an aliased `import { z as s }` and every computed member spelling
// were silently exempt, while a project object that happened to be spelled `z` would have matched.
//
// SUPPRESSION: the three arms report NODE-anchored on their own authored method token, so
// `@orb-waive zod-modern-spellings(strict|union|enum): <reason>` names its position exactly. One line can
// legitimately carry two arms — `z.object({k: z.union([z.literal("a"), z.literal("b")])}).strict()` is both
// A and B — and the tokens keep them apart. That claim is no longer prose: `mustPass[5]`, `[6]` and `[7]`
// are one positive identity arm PER TOKEN, each the matching `mustFlag` fixture plus its marker, and each
// goes red as `dead-position` the moment its arm stops anchoring on the authored method token. The same
// three tokens are named in `FIX`, because §5b.3 makes the spelling an ordinary policy's obligation and a
// header a person reading a finding never sees.
//
// EVERY NARROWING CARRIES A ROW THAT DIES WITHOUT IT (§4.1; each measured in both directions 2026-09-12):
// the `zod` door → `mustPass[8]`, the `@packages` population → `[9]`, ARM A's zero-arity test → `[10]`,
// ARM B's two-member minimum → `[11]`, ARM D's distinctness test → `[12]`, and `soleArrayArgument`'s
// sole-argument test → `[13]`. The ONE residual clean cut is the `candidateCall` name prefilter, which is
// MUTUALLY REDUNDANT with `isZodCall`'s own `terminal === method` test: the prefilter decides whether an
// origin is worth resolving and never whether the call is a zod call, so cutting it alone changes nothing.
//
// WIDENED 2026-09-20 (lane cb-population-truth, #2488): `@packages` → `@product` — the package is a heavy
// zod consumer (`registry/`, `capability/`, `contract/`), so all three superseded spellings were reachable in
// it and no policy was watching. MEASURED (`pnpm check:structure --check zod-modern-spellings`, whole tree):
// population 3,315 → 3,427, findings 0 → 0 — a SEAL, and exactly what an anti-backslide ratchet is for: its
// value is the copy-paste it refuses tomorrow, not the sites it finds today.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference, resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";

const ZOD_DOOR = "zod";
const OBJECT = "object";
const STRICT = "strict";
const UNION = "union";
const LITERAL = "literal";
const ENUM = "enum";
const BOOL_STRINGS: ReadonlySet<string> = new Set(["true", "false"]);
const BOOL_ENUM_ARITY = 2;
const MIN_LITERAL_UNION_MEMBERS = 2;

const MESSAGE =
  "a superseded zod spelling — the 4.4.3 leverage audit ruled each of these and its remedy already landed " +
  "(docs/history/reviews/stickler/2026-08-02-zod-leverage-audit.md). `strict`: `.strict()` on a `z.object(…)` " +
  "is legacy-compat (F2 — the documented reason to avoid `z.strictObject` claimed it inflates the inferred " +
  "type with an index-signature tag; that is FALSE on 4.4.3, where `$strict` is byte-identical to `$strip`). " +
  "`union`: an all-literal `z.union` emits a nested `invalid_union` where multi-value `z.literal([…])` emits " +
  "one option-naming `invalid_value` (F7) — same accepted set, same inferred type, an actionable refusal. " +
  '`enum`: a `z.enum(["true","false"])` hand-rolls `z.stringbool` (F5), and the PARAMS are the point since ' +
  "a bare `z.stringbool()` is case-INSENSITIVE and also accepts `1/0/yes/no/on/off`, silently widening a " +
  "knob whose old vocabulary was a LOUD boot refusal. Every one is semantics-preserving.";
const FIX =
  "respell it: `z.object({…}).strict()` → `z.strictObject({…})`; `z.union([z.literal(a), z.literal(b)])` → " +
  "`z.literal([a, b])`; an env boolean → the pinned `envBool` codec in packages/server/src/foundation/env/index.ts. " +
  "A deliberate keep is waived with `// @orb-waive zod-modern-spellings(<position>): <reason>` on a line above " +
  "the offending statement, where <position> is the AUTHORED METHOD NAME this arm reports and nothing else — " +
  "`strict`, `union` or `enum`, bare and unquoted, never `z.union`, never `literal` (the union's members are " +
  "not findings) and never the whole call. One line can carry two arms, and the two markers differ only in " +
  "that token.";

/** The member a candidate call names, with the node the finding anchors on — prefilter only. */
interface CandidateCall {
  readonly name: string;
  readonly nameNode: MorphNode;
}

function candidateCall(node: MorphNode): CandidateCall | undefined {
  if (!Node.isCallExpression(node)) {
    return;
  }
  const callee = node.getExpression();
  if (Node.isIdentifier(callee)) {
    return { name: callee.getText(), nameNode: callee };
  }
  const member = readMemberReference(callee);
  return member.kind === "resolved" ? { name: member.value.name, nameNode: member.value.nameNode } : undefined;
}

/** Is this call `<zod>.<method>(…)` — the export resolved through the `zod` door, in any spelling? */
function isZodCall(node: MorphNode, method: string): boolean {
  const candidate = candidateCall(node);
  if (candidate?.name !== method || !Node.isCallExpression(node)) {
    return false;
  }
  const origin = resolveModuleMemberOrigin(node.getExpression());
  if (origin.kind === "unresolved") {
    return false;
  }
  const { moduleSpecifier, exportedName, memberPath, canonical } = origin.value;
  const terminal = memberPath.at(-1) ?? exportedName;
  const doors = new Set<string>([moduleSpecifier, ...(canonical.kind === "external-door" ? [canonical.moduleSpecifier] : [])]);
  return terminal === method && doors.has(ZOD_DOOR);
}

/** The sole argument of a call, when it is an array literal. */
function soleArrayArgument(node: MorphNode): readonly MorphNode[] | undefined {
  if (!Node.isCallExpression(node)) {
    return;
  }
  const args = node.getArguments();
  const first = args[0];
  return args.length === 1 && first !== undefined && Node.isArrayLiteralExpression(first) ? first.getElements() : undefined;
}

/** ARM A: `z.object({…}).strict()` — the receiver must be the object call itself (see the header). */
function isStrictOnZodObject(node: MorphNode): boolean {
  if (!Node.isCallExpression(node) || node.getArguments().length > 0) {
    return false;
  }
  const callee = node.getExpression();
  const member = readMemberReference(callee);
  return member.kind === "resolved" && member.value.name === STRICT && isZodCall(member.value.receiver, OBJECT);
}

/** ARM B: `z.union([z.literal(…), z.literal(…), …])` — EVERY member a zod literal, at least two of them. */
function isAllLiteralUnion(node: MorphNode): boolean {
  if (!isZodCall(node, UNION)) {
    return false;
  }
  const members = soleArrayArgument(node);
  return members !== undefined && members.length >= MIN_LITERAL_UNION_MEMBERS && members.every((member) => isZodCall(member, LITERAL));
}

/** ARM D: `z.enum(["true", "false"])` in either order — the hand-rolled env boolean codec. */
function isBooleanStringEnum(node: MorphNode): boolean {
  if (!isZodCall(node, ENUM)) {
    return false;
  }
  const members = soleArrayArgument(node);
  if (members === undefined || members.length !== BOOL_ENUM_ARITY) {
    return false;
  }
  const texts = members.flatMap((member) => (Node.isStringLiteral(member) ? [member.getLiteralText()] : []));
  return texts.length === BOOL_ENUM_ARITY && texts.every((text) => BOOL_STRINGS.has(text)) && texts[0] !== texts[1];
}

/** The arm this call violates and the node the finding anchors on — the token is the authored method name,
 *  which is what an `@orb-waive` position names. */
function supersededArm(node: MorphNode): CandidateCall | undefined {
  const candidate = candidateCall(node);
  if (candidate === undefined) {
    return;
  }
  if (candidate.name === STRICT) {
    return isStrictOnZodObject(node) ? candidate : undefined;
  }
  if (candidate.name === UNION) {
    return isAllLiteralUnion(node) ? candidate : undefined;
  }
  return candidate.name === ENUM && isBooleanStringEnum(node) ? candidate : undefined;
}

export const gate = defineGate({
  id: "zod-modern-spellings",
  family: "zod-modern-spellings",
  authority: "ordinary",
  severity: "error",
  // `packages/**` only, exactly as legacy scanned: `scripts/` and `tests/` are OUT because dev tooling is
  // KISS by doctrine and a test may plant an old spelling deliberately as a fixture.
  population: "@product",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node): void => {
          const arm = supersededArm(node);
          if (arm !== undefined) {
            ctx.report.node(arm.nameNode, {
              token: arm.name,
              offset: Math.max(arm.nameNode.getText().indexOf(arm.name), 0),
              message: MESSAGE,
              fix: FIX,
            });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
        "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const s = z.object({}).strict();\n',
      },
      expect: { count: 1, token: STRICT },
      why: "ARM A's founding shape — `.strict()` directly on a `z.object(…)` call, the one shape with a mechanical `z.strictObject` remedy",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodObject {\n  strict(): ZodObject;\n}\nexport declare const z: {\n  object: (shape: unknown) => ZodObject;\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
        "packages/contracts/src/x.ts": 'import * as zod from "zod";\nexport const s = zod.z["object"]({}).strict();\n',
      },
      expect: { count: 1, token: STRICT },
      why: "THE NAMESPACE + COMPUTED-LITERAL respelling of the same receiver: the legacy reader compared the receiver's text to the literal `z`, so this was exempt by spelling alone",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
        "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const s = z.union([z.literal("a"), z.literal("b")]);\n',
      },
      expect: { count: 1, token: UNION },
      why: "ARM B's founding shape — an ALL-LITERAL union, whose refusal names no option",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
        "packages/contracts/src/x.ts": 'import { z as s } from "zod";\nexport const schema = s.union([s.literal("a"), s.literal("b")]);\n',
      },
      expect: { count: 1, token: UNION },
      why: "THE ALIAS RED on both the union AND its members — every arm must resolve through the door, and a text compare against `z.literal` saw none of these",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
        "packages/server/src/foundation/env/x.ts": 'import { z } from "zod";\nexport const flag = z.enum(["true", "false"]);\n',
      },
      expect: { count: 1, token: ENUM },
      why: "ARM D's founding shape — the hand-rolled env boolean the pinned `envBool` codec replaced",
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
          'import { z } from "zod";\n' +
          "// @orb-waive zod-modern-spellings(strict): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export const s = z.object({}).strict();\n",
      },
      why: "ARM A's POSITION, proving the header's suppression claim: the report anchors on the authored METHOD token, so ARM A is waived as `strict` — not as `object` and not as the whole chain. The fixture is mustFlag[0] (:190) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
        "packages/contracts/src/x.ts":
          'import { z } from "zod";\n' +
          "// @orb-waive zod-modern-spellings(union): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          'export const s = z.union([z.literal("a"), z.literal("b")]);\n',
      },
      why: "ARM B's POSITION: the same policy id with a DIFFERENT position token, which is what lets one line carrying two arms keep them apart. `literal` is not a position here — the members are not findings. The fixture is mustFlag[2] (:210) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export declare const z: {\n  union: (arms: readonly unknown[]) => unknown;\n  literal: (value: unknown) => unknown;\n  enum: (values: readonly string[]) => unknown;\n};\n",
        "packages/server/src/foundation/env/x.ts":
          'import { z } from "zod";\n' +
          "// @orb-waive zod-modern-spellings(enum): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          'export const flag = z.enum(["true", "false"]);\n',
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
      why: "THE DOOR TEST, which the header's whole identity claim rests on and which nothing used to exercise: a project module that exports `union` and `literal` produces a call the candidate prefilter accepts and the ORIGIN reader resolves — to `packages/contracts/src/shapes.ts`, not to the `zod` door. Cut `doors.has(ZOD_DOOR)` and this row reds. The existing counterfactual (`mustPass[4]`) uses a LOCAL object, which the origin reader refuses outright; this one RESOLVES and is still not zod, which is the harder half",
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
  ],
});
