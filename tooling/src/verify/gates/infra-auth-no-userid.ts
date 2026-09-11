// Gate: infra-auth-no-userid (D40 identity-resolution invariant). `infra/auth` verifies a request's
// headers into a pre-row `ResolvedIdentity` — it must never yield a `userId`; identity→row resolution
// is a DOMAIN step (`sessions.validate`/`provisionIdentity`), and `Principal` is constructed once at
// entry/auth/seam. A `userId` identifier under infra/auth/** is the neo tier-collapse reborn — RED. AST
// identifiers only: `// NO userId` comments and string literals documenting the ban are exempt.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const FORBIDDEN = "userId";

const MESSAGE =
  "`userId` is forbidden under infra/auth/** (D40 identity-resolution invariant): infra VERIFIES headers " +
  "into a pre-row `ResolvedIdentity` (NO userId); the seam (`entry/auth/seam.ts`) resolves the id ONCE via " +
  "a domain step (`sessions.validate`/`provisionIdentity`) and constructs the immutable Principal. See " +
  "Spine-Identity-and-Auth.md + Core-Path-Registry.md D40.";
export const gate = defineGate({
  id: "infra-auth-no-userid",
  family: "infra-auth-no-userid",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/infra/auth/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "resolve the id ONCE at the seam (entry/auth/seam.ts) via a domain step (sessions.validate / provisionIdentity); infra yields a pre-row ResolvedIdentity with NO userId.",
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
      files: { "packages/server/src/infra/auth/modes/thing.ts": "export function f(userId: string) {}\n" },
      expect: { count: 1, token: "userId" },
      why: "a `userId` code identifier under infra/auth — the D40 tier-collapse (infra yields no userId)",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/infra/auth/modes/positions.ts":
          "declare const userId: unique symbol;\nclass Auth { get userId(): string { return ''; } set userId(value: string) {} @userId accessor identity!: string; }\n",
      },
      expect: { count: 4 },
      why: "the all-Identifier policy intentionally includes the symbol binding, getter, setter, and decorator positions",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/infra/auth/modes/notes.ts": "// resolves NO userId here (invariant)\nexport const doc = 'the seam resolves the userId';\n",
      },
      why: "the `// NO userId` invariant comments + string mentions DOCUMENT the ban — AST identifiers only",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/infra/auth/modes/anchor.ts": "export const clean = true;\n",
        "packages/server/src/domain/sessions/verbs/validate.ts": "export function f(userId: string) {}\n",
      },
      why: "scope: the same identifier OUTSIDE infra/auth (a domain sessions.validate) is legal — passes",
    },
    {
      mode: "source",
      files: { "packages/server/src/infra/auth/modes/quoted.ts": 'export const identity = { "userId": "documented", ["userId"]: "computed" };\n' },
      why: "declared limit: quoted and computed property keys contain no userId Identifier node and are outside this spelling policy",
    },
  ],
});
