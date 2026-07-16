// Gate: infra-auth-no-userid (D40 identity-resolution invariant). `infra/auth` verifies a request's
// headers into a pre-row `ResolvedIdentity` — it must never yield a `userId`; identity→row resolution
// is a DOMAIN step (`sessions.validate`/`provisionIdentity`), and `Principal` is constructed once at
// entry/auth/seam. A `userId` identifier under infra/auth/** is the neo tier-collapse reborn — RED. AST
// identifiers only: `// NO userId` comments and string literals documenting the ban are exempt.
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
      files: "// resolves NO userId here (invariant)\nexport const doc = 'the seam resolves the userId';\n",
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
