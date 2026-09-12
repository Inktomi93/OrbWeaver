// An empty branded id is not a disabled-query sentinel; use a null/skipToken gate that cannot build a key.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { createKitIdCallMatcher, ID_BRAND_HOME } from "../lib/id-brand.ts";
import { readStaticAuthoredScalar } from "../lib/static-authored-value.ts";
import { idCastProofModule } from "./_proof/id-brand.ts";

const MESSAGE =
  "empty-string branded id creates a fake disabled sentinel that can reach the server if its guard drifts — use useGatedQuery/skipToken so no key exists.";

/** THE FAIL-CLOSED THIRD ANSWER (#944, added #2041), textually DISJOINT from `MESSAGE` rather than a
 *  `${MESSAGE} …` suffix: the unreadable arm reports the same single finding on the same callee as the
 *  sentinel verdict and differs ONLY in message, so a shared prefix leaves both arms unpinnable (§4.1).
 *
 *  The refusal is the SEAM's, not the argument's, and the asymmetry is deliberate. An argument the static
 *  reader cannot fold is the helper's ORDINARY use — `castId(row.id)` is most of the corpus — so widening
 *  there would accuse the whole population. A `castId` SPELLING whose door cannot be read is a different
 *  question: the shared matcher used to answer it `false`, and a sentinel behind an unreadable door walked
 *  through. Only a PROVEN non-module binding (the `local same-named function` mustPass row) still passes. */
const UNREADABLE =
  "a cast seam spelled like the canonical kit `castId` enters through a door the shared readers cannot place, so whether this manufactures a branded disabled sentinel CANNOT be established. Reported rather than admitted: the spelling alone is not the identity.";

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
            const seam = Node.isCallExpression(node) ? isCastId(node) : "other";
            if (seam === "other" || !Node.isCallExpression(node)) {
              return;
            }
            if (seam === "unreadable") {
              ctx.report.node(node.getExpression(), { message: UNREADABLE });
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
    {
      mode: "types",
      files: { "packages/client/src/x.ts": 'import { castId } from "./nowhere.ts";\nexport const x = castId("");\n' },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), reached by no declared row before #2041 because the SHARED `createKitIdCallMatcher` answered a boolean and collapsed an unresolved origin into `false`: the import door names `castId` but resolves to nothing, so the specifier is still a module-alias declaration, `bindsProvenNonModuleDeclaration` is false and the refusal fails closed. It is the exact complement of the `local same-named function` mustPass row — a local declaration is proven foreign and passes, an unreachable door is no evidence and reports. The `messageIncludes` is the whole row: the unreadable arm emits the SAME single finding on the same callee as the sentinel verdict",
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
