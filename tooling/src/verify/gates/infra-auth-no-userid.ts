// Gate: infra-auth-no-userid (D40 identity-resolution invariant). `infra/auth` verifies a request's
// headers into a pre-row `ResolvedIdentity` — it must never yield a `userId`; identity→row resolution
// is a DOMAIN step (`sessions.validate`/`provisionIdentity`), and `Principal` is constructed once at
// entry/auth/seam. A `userId` identifier under infra/auth/** is the neo tier-collapse reborn — RED. AST
// identifiers only: `// NO userId` comments and string literals documenting the ban are exempt.
//
// FAMILY: a declared SINGLETON under its own id. The subject is one identifier spelling inside one tier
// directory, and no other policy on the tree reads it — there is no shared `lib/` computation to name, and
// a shared topic (identity) is not a family.
//
// POPULATION: `@server` narrowed to `infra/auth/**`, a tier directory rather than a package. The
// `under` fence is what makes the policy a tier rule rather than a spelling ban, so mustPass[1] places the
// same identifier in `domain/sessions/verbs/` and proves the fence bites.
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot` was `/\/packages\/server\/src\/infra\/auth\//u`
// over `/${p}`, which is exactly the `@server` root plus the `under` fence above.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 16 admitted on both sides, symmetric difference ZERO in both directions.
// LEGACY SHA: (45743d76d^) — the conversion's parent.
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
  fix: "resolve the id ONCE at the seam (entry/auth/seam.ts) via a domain step (sessions.validate / provisionIdentity); infra yields a pre-row ResolvedIdentity with NO userId. A site that genuinely must carry the spelling waives that exact occurrence with `@orb-waive infra-auth-no-userid(userId): <reason + end condition>` — the reported position is always the identifier text `userId`, because the report passes that token explicitly at offset 0.",
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
    {
      mode: "source",
      files: {
        "packages/server/src/infra/auth/modes/waived.ts":
          "// @orb-waive infra-auth-no-userid(userId): the proof's stand-in reason; ends when this fixture stops flagging.\nexport function f(userId: string) {}\n",
      },
      why: "POSITIONAL IDENTITY: the report passes the token `userId` explicitly and anchors on the Identifier node itself, so the position an author types is the identifier text — never the parameter's declaration or the enclosing function's name. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
