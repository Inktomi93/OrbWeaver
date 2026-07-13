// Gate: infra-auth-no-userid (D40 the identity-resolution invariant). `infra/auth` VERIFIES a request's
// headers into a pre-row `ResolvedIdentity` (externalId/handle/groups) — it must NEVER yield a `userId`.
// Identity→row resolution is a DOMAIN step (`sessions.validate`/`provisionIdentity`); the immutable
// `Principal` is constructed ONCE at the `entry/auth/seam`. A `userId` identifier appearing under
// `infra/auth/**` is the neo tier-collapse reborn (the cookie path re-querying / "validate threw the id
// away") — RED. AST identifiers only: the many `// NO userId` invariant comments + string literals that
// mention the term are exempt (they DOCUMENT the ban). Mirrors the no-caller-user-id mechanic (a name tsc
// cannot catch because it's newly introduced, not a type error).
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const AUTH_DIR = /\/packages\/server\/src\/infra\/auth\//u;
const FORBIDDEN = "userId";

const MESSAGE =
  "`userId` is forbidden under infra/auth/** (D40 identity-resolution invariant): infra VERIFIES headers " +
  "into a pre-row `ResolvedIdentity` (NO userId); the seam (`entry/auth/seam.ts`) resolves the id ONCE via " +
  "a domain step (`sessions.validate`/`provisionIdentity`) and constructs the immutable Principal. See " +
  "Spine-Identity-and-Auth.md + Core-Path-Registry.md D40.";
export const gate: GateDescriptor = {
  name: "infra-auth-no-userid",
  docRow: "Core-Path-Registry.md D40 (identity-resolution invariant)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "resolve the id ONCE at the seam (entry/auth/seam.ts) via a domain step (sessions.validate / provisionIdentity); infra yields a pre-row ResolvedIdentity with NO userId.",
  scanRoot: (p) => AUTH_DIR.test(`/${p}`),
  kinds: [SyntaxKind.Identifier],
  visit: (node, _sf, ctx) => {
    if (node.getText() === FORBIDDEN) {
      ctx.report(node, { token: FORBIDDEN, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export function f(userId: string) {}\n",
      at: "packages/server/src/infra/auth/modes/thing.ts",
      why: "a `userId` code identifier under infra/auth — the D40 tier-collapse (infra yields no userId)",
    },
  ],
  mustPass: [
    {
      files:
        "// resolves NO userId here (invariant)\nexport const doc = 'the seam resolves the userId';\n",
      at: "packages/server/src/infra/auth/modes/notes.ts",
      why: "the `// NO userId` invariant comments + string mentions DOCUMENT the ban — AST identifiers only",
    },
    {
      files: "export function f(userId: string) {}\n",
      at: "packages/server/src/domain/sessions/verbs/validate.ts",
      why: "scope: the same identifier OUTSIDE infra/auth (a domain sessions.validate) is legal — passes",
    },
  ],
};
