// castId brands an existing id; it never turns a randomness generator into an id mint.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ModuleMemberOrigin } from "../contract/reference-fact.ts";
import { createKitIdCallMatcher, ID_BRAND_HOME } from "../lib/id-brand.ts";
import { resolveCallableOrigin } from "../lib/reference-fact-call.ts";
import { idCastProofModule } from "./_proof/id-brand.ts";

const MESSAGE = "castId wraps a fresh-id generator — use `mintTypeId(ID_PREFIX.x)` for TypeIDs or `newId<T>()` for deliberately prefixless brands.";
const MODULE_GENERATORS: Readonly<Record<string, ReadonlySet<string>>> = {
  "node:crypto": new Set(["randomUUID"]),
  crypto: new Set(["randomUUID"]),
  nanoid: new Set(["nanoid"]),
  uuid: new Set(["v4"]),
  "@paralleldrive/cuid2": new Set(["createId"]),
};

function moduleName(target: ModuleMemberOrigin): string {
  return target.canonical.kind === "external-door" ? target.canonical.moduleSpecifier : target.moduleSpecifier;
}

function isFreshIdGenerator(node: Node): boolean {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const origin = resolveCallableOrigin(node);
  if (origin.kind === "unresolved") {
    return false;
  }
  const target = origin.value.target;
  if (target.kind === "global") {
    return target.globalName === "crypto" && target.memberPath.join(".") === "randomUUID";
  }
  return target.memberPath.length === 0 && MODULE_GENERATORS[moduleName(target)]?.has(target.exportedName) === true;
}

export const gate = defineGate({
  id: "no-mint-via-cast",
  family: "id-brand-flow",
  authority: "hard",
  severity: "error",
  population: "@packages",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "replace generator laundering with the canonical kit mint for the intended id class.",
  create: (ctx) => {
    const isCastId = createKitIdCallMatcher("castId");
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (!(Node.isCallExpression(node) && isCastId(node))) {
              return;
            }
            const argument = node.getArguments()[0];
            if (argument !== undefined && isFreshIdGenerator(argument)) {
              ctx.report.node(node.getExpression());
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts":
          'import { randomUUID as uuid } from "node:crypto";\nimport { castId as brand } from "../../kit/src/ids/index";\nexport const x = brand(uuid());\n',
      },
      expect: { count: 1 },
      why: "aliases cannot hide the canonical cast seam or Node randomUUID",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts": 'import { nanoid } from "nanoid";\nimport { castId } from "../../kit/src/ids/index";\nexport const x = castId(nanoid());\n',
      },
      expect: { count: 1 },
      why: "nanoid output must use the canonical prefixless mint instead of cast laundering",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts": 'import { castId } from "../../kit/src/ids/index";\ndeclare const row: { id: string };\nexport const x = castId(row.id);\n',
      },
      why: "branding an id read from an untyped seam is the helper's intended use",
    },
    {
      mode: "types",
      files: { "packages/server/src/x.ts": "function castId(value: string): string { return value; }\nexport const x = castId(crypto.randomUUID());\n" },
      why: "a local same-named function is not the kit cast seam",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "tests/server/x.test.ts":
          'import { nanoid } from "nanoid";\nimport { castId } from "../../../packages/kit/src/ids/index";\nexport const x = castId(nanoid());\n',
      },
      why: "tests are outside this production mint policy",
    },
  ],
});
