// A Zod field in an id-named position cannot remain a raw string unless the exact occurrence is waived.
//
// FAMILY (`id-brand-flow`): shared readers, no private door. Zod identity is `reference-fact-call.ts`
// `resolveCallableOrigin` — the SAME reader `no-mint-via-cast` resolves its generator door with — and kit
// identity across the family is `id-brand.ts` (`createKitIdCallMatcher` for `no-mint-via-cast` /
// `no-fake-disabled-id`, `canonicalIdBrand` for `no-loose-id-cast` / `brand-in-name-position`).
// `schema-branding` is family `drizzle-schema`, not this one.
//
// THE PRIVATE WALK THIS REPLACED, and why it could not just be swapped. Until 2026-09-11 `isZodString` was a
// walk over the CONSUMER'S authored import specifier, so it read a door SPELLING rather than an identity:
// one `export { z } from "zod"` barrel anywhere in `packages/contracts/src/` would have turned this policy
// off for every file importing through it, silently and with no declared limit. The obvious swap to the
// shared reader KILLED the policy on the real tree instead (21 → 0 candidate hits in `packages/contracts`
// alone, beside 21 `stale ordinary waiver` alarms proving it used to bite): zod 4.4.3 `index.d.cts:1,3` is
// `import * as z from "./v4/classic/external.cjs";` then `export { z };`, and the shared reader refused that
// NAMESPACE-forwarding re-export. The refusal was narrowed at its own home in the same commit
// (`lib/reference-fact-module.ts#republishedImport`, whose spec carries the renaming counterfactuals), so the
// door now resolves `project ms=zod ex=z mp=[string]` and the swap is both safe and barrel-proof: 21 → 21,
// zero lost sites. The proof harness cannot see any of this — `ops/policy-conformance.ts` runs `types` rows
// on an in-memory project with NO `node_modules`, so a bare specifier lands `external-door` and the
// resolution path that refused is never exercised. `mustFlag[2]` is the barrel row; it reported 0 against the
// pre-fix module, which is its §4.7 planted-break receipt.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ModuleMemberOrigin } from "../contract/reference-fact.ts";
import { ID_BRAND_HOME } from "../lib/id-brand.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { resolveCallableOrigin } from "../lib/reference-fact-call.ts";
import { idCastProofModule } from "./_proof/id-brand.ts";

const MESSAGE = "an id-named Zod field is a raw string — use `typeIdSchema(ID_PREFIX.x)` or `brandedId<T>()` so the validated output preserves identity.";
/** THE FAIL-CLOSED THIRD ANSWER (#944, added #2041), textually DISJOINT from `MESSAGE` rather than a
 *  `${MESSAGE} …` suffix: the unreadable arm reports the same single finding under the same token as the
 *  zod verdict and differs ONLY in message, so a shared prefix leaves both arms unpinnable (guide §4.1).
 *
 *  Until #2041 `isZodString` answered an unresolved builder root with `false` — an id field whose schema the
 *  checker COULD NOT READ was silently admitted. The refusal now routes through the shared classifier, which
 *  is the whole distinction: a root that PROVABLY binds a local object's method, a parameter or a project
 *  declaration is a different builder and still passes (the `local same-named builder` mustPass row is
 *  exactly that shape and a blanket flip reds it). Measured on the live tree before the flip: 603 candidate
 *  `*Id:` call-rooted properties across the authored corpus — 510 resolved, 93 refusing as case (a), 0
 *  unreadable — so the flip costs zero live findings. */
const UNREADABLE =
  "an id-named field is built by a chain whose ROOT call the shared readers cannot place, so whether it is a raw Zod string CANNOT be established. Reported rather than admitted: a brand-preserving boundary an unreadable builder can walk through is not one.";

function memberReceiver(node: MorphNode): MorphNode | undefined {
  const callee = Node.isCallExpression(node) ? node.getExpression() : node;
  return Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee) ? callee.getExpression() : undefined;
}

function builderRoot(node: MorphNode): CallExpression | null {
  let current = node;
  while (Node.isCallExpression(current)) {
    const receiver = memberReceiver(current);
    if (!Node.isCallExpression(receiver)) {
      return current;
    }
    current = receiver;
  }
  return null;
}

/** The package the origin ultimately enters through: a re-export barrel is a door spelling, never a package. */
function moduleName(target: ModuleMemberOrigin): string {
  return target.canonical.kind === "external-door" ? target.canonical.moduleSpecifier : target.moduleSpecifier;
}

/** Zod's `string` builder, reached as the bare export (`import { string } from "zod"`) or off the `z` object
 *  under any binding spelling — alias, namespace, computed member, or a re-export barrel. */
function zodStringVerdict(root: CallExpression): "zod" | "other" | "unreadable" {
  const origin = resolveCallableOrigin(root);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, root.getExpression());
  }
  const target = origin.value.target;
  if (target.kind !== "module" || moduleName(target) !== "zod") {
    return "other";
  }
  const path = [target.exportedName, ...target.memberPath];
  const named = path.length === 1 ? path[0] === "string" : path.length === 2 && path[0] === "z" && path[1] === "string";
  return named ? "zod" : "other";
}

function idProperty(node: MorphNode): { readonly name: string; readonly nameNode: MorphNode; readonly initializer: MorphNode } | null {
  if (!Node.isPropertyAssignment(node)) {
    return null;
  }
  const nameNode = node.getNameNode();
  const initializer = node.getInitializer();
  const name = Node.isIdentifier(nameNode) || Node.isStringLiteral(nameNode) ? nameNode.getText().replaceAll(/["']/gu, "") : "";
  return name.endsWith("Id") && initializer !== undefined ? { name, nameNode, initializer } : null;
}

export const gate = defineGate({
  id: "no-raw-id",
  family: "id-brand-flow",
  authority: "ordinary",
  severity: "error",
  population: "@authored",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use the canonical kit id schema. For a foreign, polymorphic, or deliberately lenient id-shaped string, attach `@orb-waive no-raw-id(<field>): <reason + end condition>` to that exact property.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAssignment],
        visit: (node) => {
          const property = idProperty(node);
          const root = property === null ? null : builderRoot(property.initializer);
          if (property === null || root === null) {
            return;
          }
          const verdict = zodStringVerdict(root);
          if (verdict === "zod") {
            ctx.report.node(property.nameNode, { token: property.name, offset: 0 });
            return;
          }
          if (verdict === "unreadable") {
            ctx.report.node(property.nameNode, { token: property.name, offset: 0, message: UNREADABLE });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const schema = z.object({ userId: z.string() });\n' },
      expect: { count: 1, token: "userId" },
      why: "a raw id field loses its brand",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/x.ts":
          'import { z as schema } from "zod";\nexport const value = schema.object({ chatId: schema.string().nullable().optional() });\n',
      },
      expect: { count: 1, token: "chatId" },
      why: "Zod aliases and wrapper chains cannot hide the raw string root",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/zod-door.ts": 'export { z } from "zod";\n',
        "packages/contracts/src/x.ts": 'import { z } from "./zod-door";\nexport const schema = z.object({ ownerId: z.string() });\n',
      },
      expect: { count: 1, token: "ownerId" },
      why: "RED-FIRST (§4.7 planted break: this row reported 0 against the pre-conversion private import-specifier walk). The Zod door is an IDENTITY question, so one re-export barrel in contracts must not turn the policy off for every file importing through it",
    },
    {
      mode: "types",
      files: { "packages/contracts/src/opaque.ts": "declare const wire: any;\nexport const schema = { userId: wire.string().optional() };\n" },
      expect: { count: 1, token: "userId", messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), and until #2041 this policy FAILED OPEN here: the builder ROOT is a member read off an OPAQUE `any`-typed receiver, so its leaf binds no declaration at all and `classifyOriginRefusal` answers case (b) — an id boundary whose schema cannot be read is REPORTED rather than admitted. It is the exact complement of the `local same-named builder` mustPass row, which is why the refusal is SCOPED and not blanket: a local object's `string` method provably binds a property assignment and still passes, while no binding at all is no evidence. The `messageIncludes` is the whole row — the unreadable arm emits the SAME single finding under the SAME token as the zod verdict",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule("export function typeIdSchema(_prefix: string): unknown { return {}; }\n"),
        "packages/contracts/src/x.ts": 'import { typeIdSchema } from "../../kit/src/ids/index";\nexport const schema = { userId: typeIdSchema("user") };\n',
      },
      why: "the canonical validating schema carries branded output",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/x.ts": "const z = { string: () => ({}) };\nexport const schema = { userId: z.string() };\n",
      },
      why: "a local same-named builder is not Zod evidence",
    },
    {
      mode: "types",
      files: { "packages/contracts/src/x.ts": 'import { z } from "zod";\nexport const schema = z.object({ username: z.string() });\n' },
      why: "ordinary strings with no id position are untouched",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/x.ts":
          'import { z } from "zod";\nexport const schema = z.object({\n  // @orb-waive no-raw-id(requestId): an upstream correlation id; ends if it becomes an Orb entity.\n  requestId: z.string(),\n});\n',
      },
      why: "a foreign id-shaped string uses the one central positioned waiver",
    },
  ],
});
