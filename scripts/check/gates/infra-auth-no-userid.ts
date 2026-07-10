// Gate: infra-auth-no-userid (D40 the identity-resolution invariant). `infra/auth` VERIFIES a request's
// headers into a pre-row `ResolvedIdentity` (externalId/handle/groups) — it must NEVER yield a `userId`.
// Identity→row resolution is a DOMAIN step (`sessions.validate`/`provisionIdentity`); the immutable
// `Principal` is constructed ONCE at the `entry/auth/seam`. A `userId` identifier appearing under
// `infra/auth/**` is the neo tier-collapse reborn (the cookie path re-querying / "validate threw the id
// away") — RED. AST identifiers only: the many `// NO userId` invariant comments + string literals that
// mention the term are exempt (they DOCUMENT the ban). Mirrors the no-caller-user-id mechanic (a name tsc
// cannot catch because it's newly introduced, not a type error).
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const AUTH_DIR = /\/packages\/server\/src\/infra\/auth\//u;
const FORBIDDEN = "userId";

const MESSAGE =
  "`userId` is forbidden under infra/auth/** (D40 identity-resolution invariant): infra VERIFIES headers " +
  "into a pre-row `ResolvedIdentity` (NO userId); the seam (`entry/auth/seam.ts`) resolves the id ONCE via " +
  "a domain step (`sessions.validate`/`provisionIdentity`) and constructs the immutable Principal. See " +
  "Spine-Identity-and-Auth.md + Core-Path-Registry-D35-D43.md D40.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const infraAuthNoUserId: Check = {
  name: "infra-auth-no-userid",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      if (!AUTH_DIR.test(sf.getFilePath())) {
        continue;
      }
      const rel = relPath(root, sf.getFilePath());
      for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
        if (id.getText() === FORBIDDEN) {
          violations.push({ file: rel, line: id.getStartLineNumber(), message: MESSAGE });
        }
      }
    }
    return violations;
  },
};
