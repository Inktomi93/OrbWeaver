// Tier-4-Transport.md (#45/#46): a paged/list tRPC input must never accept an UNBOUNDED `limit`. A zod
// number chain with no `.max(…)` feeds an unbounded SQL `.limit()` — the 872-chat fetch bomb — while a
// `.max()` at the trust boundary turns an over-ask into a BAD_REQUEST. The chain ROOT is proven through the
// shared module-origin reader (`z`/`z.coerce`/a namespace/a direct `number` import all resolve to zod's
// `number`; a local object named `z` does not), and the field VALUE resolves through the shared binding
// reader, so a schema held in a const or imported by name is judged rather than skipped. Limits: mustPass.
//
// FAMILY `bounded-list-limit` — a declared SINGLETON, because no other policy judges a BUILDER CHAIN. Its
// verdict walks a zod chain hop by hop asking whether a `.max()` appears anywhere before the factory root;
// that walk is this module's own and nothing else in the corpus wants it. The shared machinery it consumes
// is `_shared/reference-fact.ts` (`resolveModuleMemberOrigin` for the chain root, `readMemberReference` per hop,
// `resolveStableExpression` for a named schema), `lib/sealed-origin.ts`'s `originModuleSpecifier`, and
// `lib/property-assignment-name.ts` for the field key — consuming four shared readers is not a family
// (guide §2, §7 item 4), so it declares itself rather than inventing one around "wire schemas".
//
// POPULATION PORT: byte-identical, legacy at `0d83d99f1^`. That descriptor's `scanRoot` was
// `p.startsWith("packages/server/src/transport/trpc/routers/") || p.startsWith("packages/contracts/src/")`;
// the final expression beside `WIRE_SCHEMA_POPULATION` admits exactly that set, and its `under` half is
// pinned by a mustPass row placing the same unbounded field one directory outside it.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `bounded-list-limit` descriptor at ef22519578607c76a03196f343fb025520c796a5, the parent of the conversion
// `0d83d99f1` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,186 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 132 and final `population` admits 132. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/contracts/src/assets/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference, resolveModuleMemberOrigin, resolveStableExpression } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { propertyAssignmentName } from "../lib/property-assignment-name.ts";
import { originModuleSpecifier } from "../lib/sealed-origin.ts";

const ZOD_MODULE = "zod";
const NUMBER_FACTORY = "number";
const MAX_OPERATION = "max";
const LIMIT_KEY = "limit";

const MESSAGE =
  "an unbounded `limit` in a list/paged tRPC input (Tier-4-Transport.md — the #45/#46 ceiling): a zod number " +
  "chain with no `.max(…)` feeds an unbounded SQL `.limit()` (the chat.listChats-scale fetch bomb). Add " +
  "`.max(<PER_DOMAIN_CONST>)` so an over-bound ask is a BAD_REQUEST, never a whole-catalog read.";

const FIX =
  "bound the field with `.max(<CONST>)` from a per-domain contract constant (the `CHARACTER_LIST_MAX_LIMIT` / " +
  "`character.list` precedent) — e.g. `z.number().int().min(1).max(MY_LIST_MAX_LIMIT).optional()`. A " +
  "deliberate site is waived with `@orb-waive bounded-list-limit(<position>): <reason>` on the line above, " +
  "where <position> is the literal `limit` — the unbounded field's own property key.";

/** Legacy `scanRoot` admitted the tRPC router tree plus all of `packages/contracts/src` — the two wire-schema
 *  homes. The two roots plus these `under` globs admit exactly that set. */
const WIRE_SCHEMA_POPULATION = {
  in: ["@server", "@contracts"],
  under: ["packages/server/src/transport/trpc/routers/**", "packages/contracts/src/**"],
} as const;

/** Is this callee zod's `number` factory, in any spelling? `z.number`, `z.coerce.number`, a namespace
 *  member and a direct `import { number } from "zod"` all resolve to the same module path ending in
 *  `number`; a local object named `z` resolves to no zod origin at all. */
function isZodNumberFactory(callee: MorphNode): boolean {
  const origin = resolveModuleMemberOrigin(callee);
  if (origin.kind !== "resolved" || originModuleSpecifier(origin.value) !== ZOD_MODULE) {
    return false;
  }
  const path = [origin.value.exportedName, ...origin.value.memberPath];
  return path.at(-1) === NUMBER_FACTORY;
}

/** The EXPRESSION a binding NAMES, even when its value is runtime-computed. `resolveStableExpression`
 *  refuses a call as a dynamic terminal, which is right for a VALUE and wrong for a BUILDER CHAIN — a zod
 *  schema is always a call. The refusal carries the node it walked TO, so a schema held in a const or
 *  imported by name still yields its chain while a genuinely unknowable value stays unresolved. */
function namedExpression(node: MorphNode): MorphNode {
  const stable = resolveStableExpression(node);
  if (stable.kind === "resolved") {
    return stable.value;
  }
  return stable.reason === "dynamic" ? stable.node : node;
}

interface ChainVerdict {
  readonly isZodNumber: boolean;
  readonly hasMax: boolean;
}

/** Walk the builder chain from its outermost call down to its root, recording whether a `.max(…)` appears
 *  anywhere and whether the root is zod's number factory. Each hop's member is read through the shared
 *  reader, so `z.number()["max"](10)` is the same chain as the dotted spelling. */
function zodNumberChain(initializer: MorphNode): ChainVerdict {
  let current = namedExpression(initializer);
  let hasMax = false;
  while (Node.isCallExpression(current)) {
    const callee = current.getExpression();
    const member = readMemberReference(callee);
    if (member.kind !== "resolved") {
      return { isZodNumber: isZodNumberFactory(callee), hasMax };
    }
    if (member.value.name === MAX_OPERATION) {
      hasMax = true;
    }
    const terminal = namedExpression(member.value.receiver);
    if (!Node.isCallExpression(terminal)) {
      return { isZodNumber: isZodNumberFactory(callee), hasMax };
    }
    current = terminal;
  }
  return { isZodNumber: false, hasMax };
}

export const gate = defineGate({
  id: "bounded-list-limit",
  family: "bounded-list-limit",
  authority: "ordinary",
  severity: "error",
  population: WIRE_SCHEMA_POPULATION,
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
          if (!Node.isPropertyAssignment(node) || propertyAssignmentName(node) !== LIMIT_KEY) {
            return;
          }
          const initializer = node.getInitializer();
          if (initializer === undefined) {
            return;
          }
          const chain = zodNumberChain(initializer);
          if (chain.isZodNumber && !chain.hasMax) {
            const nameNode = node.getNameNode();
            ctx.report.node(nameNode, { token: LIMIT_KEY, offset: nameNode.getText().indexOf(LIMIT_KEY) });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  min(value: number): NumberSchema;\n  max(value: number): NumberSchema;\n  positive(): NumberSchema;\n  optional(): NumberSchema;\n}\nexport declare function number(): NumberSchema;\nexport declare const z: { number: () => NumberSchema; coerce: { number: () => NumberSchema }; object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/probe.ts": 'import { z } from "zod";\nexport const s = z.object({ limit: z.number().int().optional() });\n',
      },
      expect: { count: 1, token: "limit" },
      why: "the founding #45 shape — an inline `limit: z.number().int().optional()` with no `.max()` in a router input",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  positive(): NumberSchema;\n  optional(): NumberSchema;\n  max(value: number): NumberSchema;\n}\nexport declare const z: { number: () => NumberSchema; coerce: { number: () => NumberSchema }; object: (shape: unknown) => unknown };\n",
        "packages/contracts/src/probe/index.ts": 'import { z } from "zod";\nexport const s = z.object({ limit: z.coerce.number().int().optional() });\n',
      },
      expect: { count: 1, token: "limit" },
      why: "`z.coerce.number()` is the same unbounded factory one member deeper — the legacy reader compared the receiver TEXT against `z` and `z.coerce`, which two renames would have retired",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  optional(): NumberSchema;\n  max(value: number): NumberSchema;\n}\nexport declare function number(): NumberSchema;\nexport declare const z: { number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/contracts/src/probe/namespace.ts": 'import * as zod from "zod";\nexport const s = zod.z.object({ limit: zod.number().int() });\n',
      },
      expect: { count: 1, token: "limit" },
      why: 'A NAMESPACE IMPORT of zod\'s own `number` export is the same factory — the legacy `recvText === "z"` comparison was offered `zod` and answered no',
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  positive(): NumberSchema;\n  optional(): NumberSchema;\n  max(value: number): NumberSchema;\n}\nexport declare const z: { number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/contracts/src/probe/shared.ts": 'import { z } from "zod";\nexport const pageLimit = z.number().int().positive().optional();\n',
        "packages/contracts/src/probe/imported.ts":
          'import { z } from "zod";\nimport { pageLimit } from "./shared.ts";\nexport const s = z.object({ limit: pageLimit });\n',
      },
      expect: { count: 1, token: "limit" },
      why: "AN IMPORTED named schema is still this boundary's page size — the legacy reader resolved only a SAME-FILE const and declared an imported one out of scope, which is one extraction away from every unbounded limit",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  optional(): NumberSchema;\n  max(value: number): NumberSchema;\n}\nexport declare const z: { number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/computed.ts": 'import { z } from "zod";\nexport const s = z.object({ ["limit"]: z.number().int() });\n',
      },
      expect: { count: 1, token: "limit" },
      why: 'a COMPUTED key names the same field — `getName()` answered `["limit"]` and the legacy comparison said no',
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  min(value: number): NumberSchema;\n  max(value: number): NumberSchema;\n  optional(): NumberSchema;\n}\nexport declare const z: { number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/bounded.ts":
          'import { z } from "zod";\nconst LIST_MAX = 100;\nexport const s = z.object({ limit: z.number().int().min(1).max(LIST_MAX).optional() });\n',
      },
      why: "the bounded shape — `.max(LIST_MAX)` anywhere in the chain, the character.list precedent the whole corpus follows",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  min(value: number): NumberSchema;\n  max(value: number): NumberSchema;\n}\nexport declare const z: { number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/contracts/src/probe/recurse.ts": 'import { z } from "zod";\nexport const toolRecurseLimitSchema = z.number().int().min(1).max(20);\n',
        "packages/server/src/transport/trpc/routers/recurse.ts":
          'import { z } from "zod";\nimport { toolRecurseLimitSchema } from "../../../../../contracts/src/probe/recurse.ts";\nexport const s = z.object({ limit: toolRecurseLimitSchema });\n',
      },
      why: "the live `chat.ts` shape — a NAMED schema that is a recursion cap, not a page size, and carries its own `.max(20)`. Following the import is what lets the policy SEE its bound instead of guessing about it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/routers/local-z.ts":
          "const z = { number: () => ({ int: () => ({ optional: () => ({}) }) }), object: (shape: unknown): unknown => shape };\nexport const s = z.object({ limit: z.number().int().optional() });\n",
      },
      why: 'THE RESOLUTION COUNTERFACTUAL — a LOCAL object named `z` with a `number` builder, unbounded, in a router file. The legacy `recvText === "z"` comparison accused it. It falsifies the `origin.kind !== "resolved"` half ALONE: a local object resolves to no module origin at all, so the two comparisons behind it never run. The MODULE and exported-NAME halves are pinned by the two RESOLVING rows below (w9 D2, #2046)',
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  max(value: number): NumberSchema;\n  optional(): NumberSchema;\n}\nexport declare const z: { number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/vendor-zod.ts":
          "interface VendorNumberSchema {\n  int(): VendorNumberSchema;\n  optional(): VendorNumberSchema;\n}\nexport declare const z: { number: () => VendorNumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/vendored.ts":
          'import { z } from "./vendor-zod.ts";\nexport const s = z.object({ limit: z.number().int().optional() });\n',
      },
      why: "THE MODULE COUNTERFACTUAL, AND IT RESOLVES — a sibling project module exporting its own `z` with a `number` factory, unbounded, with real zod present in the same project. The origin resolves cleanly and the exported-NAME tail IS `number`; only `originModuleSpecifier(…) !== ZOD_MODULE` rejects it. A LOCAL object never resolves, so the row above cannot reach this comparison (w9 D2, #2046)",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface StringSchema {\n  trim(): StringSchema;\n  optional(): StringSchema;\n}\ninterface NumberSchema {\n  int(): NumberSchema;\n  max(value: number): NumberSchema;\n}\nexport declare const z: { string: () => StringSchema; number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/string-limit.ts":
          'import { z } from "zod";\nexport const s = z.object({ limit: z.string().trim().optional() });\n',
      },
      why: "THE EXPORTED-NAME COUNTERFACTUAL — a genuine zod chain on the `limit` field whose ROOT FACTORY is `string`, not `number`. The module origin IS zod and there is no `.max()`, so only `path.at(-1) === NUMBER_FACTORY` acquits it. A string field has no unbounded-page-size bomb: the subject is the numeric page size (w9 F2, #2046)",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  max(value: number): NumberSchema;\n  optional(): NumberSchema;\n}\nexport declare const z: { number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/server/src/domain/chat/lib/page.ts": 'import { z } from "zod";\nexport const s = z.object({ limit: z.number().int().optional() });\n',
        "packages/server/src/transport/trpc/routers/anchor.ts": 'import { z } from "zod";\nexport const s = z.object({ limit: z.number().int().max(50) });\n',
      },
      why: "THE POPULATION FENCE — the SAME unbounded shape inside `@server` but OUTSIDE the two wire-schema homes. `limit` is an ordinary field name in a domain helper; the #45/#46 ceiling is a TRUST-BOUNDARY rule, so the subject is the tRPC router tree and `packages/contracts/src`, not every numeric field on the server. Widening `under` to all of `packages/server/src/**` reds this row (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  max(value: number): NumberSchema;\n}\nexport declare const z: { number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/dynamic-key.ts":
          'import { z } from "zod";\ndeclare const limit: string;\nexport const s = z.object({ [limit]: z.number().int() });\n',
      },
      why: "THE COMPUTED-KEY REFUSAL of the shared `propertyAssignmentName` reader, proven ONCE for all four consumers (§5b.7, w9 D6, #2046) — a computed key whose expression has no static value authors no knowable field name, and the binding here is SPELLED `limit`. The naive repair is to fall back on the key expression's TEXT; that text is the identifier's spelling, not the key it evaluates to, so this row reds the moment the refusal is replaced by `nameNode.getExpression().getText()`. The four modules that carried this helper privately reached its refusal branch with zero rows between them",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  positive(): NumberSchema;\n  max(value: number): NumberSchema;\n}\nexport declare const z: { number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/topn.ts": 'import { z } from "zod";\nexport const s = z.object({ topN: z.number().int().positive() });\n',
      },
      why: "DECLARED LIMIT — a `topN`-named field carries the same bomb class, but this policy is `limit`-scoped by design (the top-N fields are bounded by hand in `search.*`). Widening the field vocabulary is a separate, measured decision",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  optional(): NumberSchema;\n  max(value: number): NumberSchema;\n}\nexport declare const z: { number: () => NumberSchema; object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/other-field.ts":
          'import { z } from "zod";\nexport const s = z.object({ count: z.number().int().optional() });\n',
      },
      why: "a non-`limit` numeric field is not a list page size — the field name is the subject and stays so",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts": "export declare const z: { object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/dynamic.ts":
          'import { z } from "zod";\ndeclare const registry: { readonly limit: unknown };\nexport const s = z.object({ limit: registry.limit });\n',
      },
      why: "DECLARED LIMIT — a value the shared reader refuses (a member read, a call result) carries NO evidence that it is a zod number at all. This policy fails QUIET on an unknowable schema rather than accusing every dynamic composition; the schema fact's own precedent is the same",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.ts":
          "interface NumberSchema {\n  int(): NumberSchema;\n  min(value: number): NumberSchema;\n  max(value: number): NumberSchema;\n  positive(): NumberSchema;\n  optional(): NumberSchema;\n}\nexport declare function number(): NumberSchema;\nexport declare const z: { number: () => NumberSchema; coerce: { number: () => NumberSchema }; object: (shape: unknown) => unknown };\n",
        "packages/server/src/transport/trpc/routers/probe.ts":
          'import { z } from "zod";\n' +
          "// @orb-waive bounded-list-limit(limit): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export const s = z.object({ limit: z.number().int().optional() });\n",
      },
      why: "POSITIONAL IDENTITY: the report anchors on the property's NAME NODE with the field name as token (:133-134), so the position is the field `limit` — never the unbounded chain that earned the finding. It is the same token for the computed-key spelling (`[\"limit\"]`), which is why the offset is computed into the name node's own text. The fixture is mustFlag[0] (:148, count 1) plus the marker line; the marker binds through the enclosing statement carrier to that one occurrence, and it ends if that row changes",
    },
  ],
});
