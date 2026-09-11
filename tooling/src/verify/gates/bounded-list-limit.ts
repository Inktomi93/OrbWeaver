// Tier-4-Transport.md (#45/#46): a paged/list tRPC input must never accept an UNBOUNDED `limit`. A zod
// number chain with no `.max(…)` feeds an unbounded SQL `.limit()` — the 872-chat fetch bomb — while a
// `.max()` at the trust boundary turns an over-ask into a BAD_REQUEST. The chain ROOT is proven through the
// shared module-origin reader (`z`/`z.coerce`/a namespace/a direct `number` import all resolve to zod's
// `number`; a local object named `z` does not), and the field VALUE resolves through the shared binding
// reader, so a schema held in a const or imported by name is judged rather than skipped. Limits: mustPass.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference, readStaticString, resolveModuleMemberOrigin, resolveStableExpression } from "../lib/reference-fact.ts";
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
  "`character.list` precedent) — e.g. `z.number().int().min(1).max(MY_LIST_MAX_LIMIT).optional()`.";

/** Legacy `scanRoot` admitted the tRPC router tree plus all of `packages/contracts/src` — the two wire-schema
 *  homes. The two roots plus these `under` globs admit exactly that set. */
const WIRE_SCHEMA_POPULATION = {
  in: ["@server", "@contracts"],
  under: ["packages/server/src/transport/trpc/routers/**", "packages/contracts/src/**"],
  ext: ["ts", "tsx"],
} as const;

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
          if (!Node.isPropertyAssignment(node) || propertyName(node) !== LIMIT_KEY) {
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
      why: 'THE IDENTITY COUNTERFACTUAL — a LOCAL object named `z` with a `number` builder, unbounded, in a router file. The legacy `recvText === "z"` comparison accused it; deleting the zod-origin check turns this row red',
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
