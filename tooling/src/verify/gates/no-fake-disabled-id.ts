// An empty branded id is not a disabled-query sentinel; use a null/skipToken gate that cannot build a key.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { createKitIdCallMatcher, ID_BRAND_HOME } from "../lib/id-brand.ts";
import { readStaticAuthoredScalar } from "../lib/static-authored-value.ts";
import { idCastProofModule } from "./_proof/id-brand.ts";

const MESSAGE =
  "empty-string branded id creates a fake disabled sentinel that can reach the server if its guard drifts — use useGatedQuery/skipToken so no key exists.";

export const gate = defineGate({
  id: "no-fake-disabled-id",
  family: "id-brand-flow",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "represent absence as null and use `useGatedQuery` or `skipToken`; never manufacture an empty branded " +
    "id. A deliberate site is waived with `@orb-waive no-fake-disabled-id(<position>): <reason>` on the " +
    "line above, where <position> is the derived position — the first identifier, literal or keyword of the " +
    "reported expression.",
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
            if (argument === undefined) {
              return;
            }
            const value = readStaticAuthoredScalar(argument);
            if (value.kind === "resolved" && value.value === "") {
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
        "packages/client/src/x.ts": 'import { castId } from "../../kit/src/ids/index";\nexport const x = castId("");\n',
      },
      expect: { count: 1 },
      why: "a direct empty sentinel is forbidden",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/client/src/x.ts": 'import { castId as brand } from "../../kit/src/ids/index";\nconst empty = "";\nexport const x = brand(empty as string);\n',
      },
      expect: { count: 1 },
      why: "import aliases and static string aliases cannot hide the empty sentinel",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/client/src/x.ts": 'import { castId } from "../../kit/src/ids/index";\nexport const x = castId("chat_123");\n',
      },
      why: "a nonempty existing id is outside the fake-disabled rule",
    },
    {
      mode: "types",
      files: { "packages/client/src/x.ts": 'function castId(value: string): string { return value; }\nexport const x = castId("");\n' },
      why: "a local same-named function is not the canonical kit seam",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/client/src/x.ts":
          'import { castId } from "../../kit/src/ids/index";\n' +
          "// @orb-waive no-fake-disabled-id(castId): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          'export const x = castId("");\n',
      },
      why: "POSITIONAL IDENTITY: the report anchors on the CALLEE, whose derived position token is `castId`, so that is the only position an author can waive. The fixture is mustFlag[0] (:47) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
  ],
});
