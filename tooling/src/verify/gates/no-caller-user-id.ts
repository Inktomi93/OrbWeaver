// Gate: no-caller-user-id (Core-Path-Registry.md D19 turn-identity). The caller is `Principal.userId`; a turn's
// RESPONSIBLE human is `triggeredBy` and the FUNDED identity is `runAsUserId`. The term `callerUserId`
// conflates caller with turn-identity (the neo bug class: the caller's id reaching `resolveCredential`/
// `loadUserSettings`). tsc cannot catch a NEWLY-INTRODUCED forbidden name, so this gate does — before the
// turn-running/engine chunks accrete. AST identifiers only: comments, quoted/computed keys, and string literals are exempt;
// every identifier position is judged, including property names, destructuring, and locally shadowed bindings.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const FORBIDDEN = "callerUserId";

const MESSAGE =
  "`callerUserId` is forbidden (D19): the caller is `Principal.userId`; use `triggeredBy` (the responsible human) / `runAsUserId` (the funded identity). Never route the caller's id into credential/settings resolution. See Spine-Identity-and-Auth.md (turn-identity: triggeredBy vs runAsUserId; D19).";
export const gate = defineGate({
  id: "no-caller-user-id",
  family: "no-caller-user-id",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@tooling", "@tests", "@scripts"],
    notUnder: ["tooling/src/verify/gates/**"],
  },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use `triggeredBy` (the responsible human) or `runAsUserId` (the funded identity) — never the caller's id in credential/settings resolution.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.Identifier],
        visit: (node) => {
          if (node.getText() === FORBIDDEN) {
            ctx.report.node(node, { token: FORBIDDEN, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/chat/x.ts": "export function f(callerUserId: string) {\n  return callerUserId;\n}\n" },
      expect: { count: 2 },
      why: "the banned D19 term as a code identifier — every occurrence (param + use) is its own finding",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/positions.ts":
          "const callerUserId = 1;\nconst record = { callerUserId };\nconst { callerUserId: extracted } = record;\nexport { extracted };\n",
      },
      expect: { count: 3 },
      why: "the spelling ban intentionally includes a shadowed binding, shorthand property, and destructuring property name",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/server/src/domain/chat/y.ts": "// callerUserId is forbidden (D19)\nexport const doc = 'route the callerUserId';\n" },
      why: "the term in a COMMENT / string literal — AST identifiers only; documentation is exempt",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/quoted.ts":
          'const record = { "callerUserId": 1, ["callerUserId"]: 2 };\nexport const value = record["callerUserId"];\n',
      },
      why: "quoted and computed string keys are the declared boundary of the identifier-only policy",
    },
  ],
});
