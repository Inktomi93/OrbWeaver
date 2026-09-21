// A canonical TypeID cannot cross a trust boundary through `brandedId<T>()`, which validates only nonempty
// text. The checker resolves T's canonical brand; the shared id-brand reader derives the TypeID-prefix
// vocabulary from `TypeIdOf<"…">` aliases in kit, so renamed imports, barrels and new entity aliases do not
// create a spelling-based blind spot. Prefixless `Branded<"…">` ids stay valid.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { canonicalTypeIdPrefix, createKitIdCallMatcher, deriveCanonicalTypeIdPrefixes, ID_BRAND_HOME } from "../lib/id-brand.ts";
import { idBrandProofModule } from "./_proof/id-brand.ts";

const MESSAGE =
  "a canonical TypeID crosses a trust boundary through brandedId<T>(), which validates only nonempty text and accepts malformed or wrong-prefix ids; use typeIdSchema(ID_PREFIX.x). (tooling/src/verify/gates/GATE-AUTHORING.md)";
const UNREADABLE =
  "a brandedId-spelled trust-boundary call enters through a door the shared readers cannot place, so whether it is the canonical non-validating helper CANNOT be established. Reported rather than admitted. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const BLIND =
  "the canonical TypeIdOf prefix vocabulary is empty, so the TypeID boundary policy CANNOT judge any helper call. Reported rather than treating an unreadable ids home as a clean tree. (tooling/src/verify/gates/GATE-AUTHORING.md)";

export const gate = defineGate({
  id: "typeid-prefix-boundary",
  family: "id-brand-flow",
  authority: "hard",
  severity: "error",
  population: "@product",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "replace brandedId<TypeId>() with typeIdSchema(ID_PREFIX.<canonical prefix>); retain brandedId only for prefixless brands.",
  create: (ctx) => {
    const prefixes = deriveCanonicalTypeIdPrefixes(ctx.files, ctx.relativePath);
    const isBrandedId = createKitIdCallMatcher("brandedId");
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const seam = isBrandedId(node);
            if (seam === "other") {
              return;
            }
            if (seam === "unreadable") {
              ctx.report.node(node.getExpression(), { message: UNREADABLE });
              return;
            }
            const target = node.getTypeArguments()[0];
            if (target === undefined || canonicalTypeIdPrefix(ctx.checker().getTypeAtLocation(target), target, ctx.checker(), prefixes) === null) {
              return;
            }
            ctx.report.node(node.getExpression());
          },
        },
      ],
      evaluate: () => {
        ctx.receipt({ kind: "population", source: "canonical-typeid-prefixes", members: prefixes.size });
        if (prefixes.size === 0) {
          ctx.report.file(ID_BRAND_HOME, { line: 1, token: "TypeIdOf", message: BLIND });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule(
          'export type ChatId = TypeIdOf<"chat">;\nexport function brandedId<T extends Branded<string>>(): T { throw new Error(); }\n',
        ),
        "packages/contracts/src/x.ts": 'import { brandedId, type ChatId } from "../../kit/src/ids/index";\nexport const chatId = brandedId<ChatId>();\n',
      },
      expect: { count: 1, token: "brandedId" },
      why: "a canonical TypeID alias cannot use the nonempty-only helper",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule(
          'export type ChatId = TypeIdOf<"chat">;\nexport function brandedId<T extends Branded<string>>(): T { throw new Error(); }\n',
        ),
        "packages/contracts/src/id-door.ts": 'export { brandedId, type ChatId as RoomId } from "../../kit/src/ids/index";\n',
        "packages/contracts/src/x.ts": 'import { brandedId as brand, type RoomId } from "./id-door";\nexport const chatId = brand<RoomId>();\n',
      },
      expect: { count: 1, token: "brand" },
      why: "checker-resolved aliases and a re-export barrel cannot hide either the helper or the TypeID target",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/contracts/src/x.ts":
          'import type { ChatId } from "../../kit/src/ids/index";\nimport { brandedId } from "./missing";\nexport const chatId = brandedId<ChatId>();\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "an unresolved brandedId door fails closed instead of silently acquitting a candidate spelling",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule(
          'export type ChatId = TypeIdOf<"chat">;\nexport type UserId = Branded<"UserId">;\nexport function brandedId<T extends Branded<string>>(): T { throw new Error(); }\n',
        ),
        "packages/contracts/src/x.ts": 'import { brandedId, type UserId } from "../../kit/src/ids/index";\nexport const userId = brandedId<UserId>();\n',
      },
      why: "a canonical prefixless brand remains on brandedId",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\nexport function typeIdSchema(_prefix: string): unknown { return {}; }\n'),
        "packages/contracts/src/x.ts": 'import { typeIdSchema } from "../../kit/src/ids/index";\nexport const chatId = typeIdSchema("chat");\n',
      },
      why: "the prefix-validating helper is the required TypeID boundary",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type ChatId = TypeIdOf<"chat">;\n'),
        "packages/contracts/src/x.ts":
          'import type { ChatId } from "../../kit/src/ids/index";\nfunction brandedId<T>(): T { throw new Error(); }\nexport const chatId = brandedId<ChatId>();\n',
      },
      why: "a local same-named helper is a different identity",
    },
  ],
});
