// Gate: no-direct-users-read (admin.md §"the no-direct-users-read chokepoint") — `users` is the identity
// root every single-owned table FKs. It is read/written through exactly TWO sanctioned domains: `sessions`
// (the resolution-path writer — validate / provisionIdentity / ensureUser) and `admin` (the user-management
// surface). EVERY OTHER domain takes `userId` from the resolved `Principal` (via the injected context) and
// NEVER queries `users` — joining it sideways re-couples identity into a feature and dodges the resolve-once
// model. This makes the documented chokepoint PHYSICS: a domain outside sessions/admin importing the `users`
// table symbol from `@orb/db` is RED. (The `@orb/db` schema files legitimately FK `users`; they are not
// under `domain/`, so they are unaffected.)
import type { SourceFile } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const TABLE = "users";
const DB_SPECIFIER = /^@orb\/db(?:\/|$)/u;
const DOMAIN = /\/packages\/server\/src\/domain\//u;
const EXEMPT = /\/packages\/server\/src\/domain\/(?:sessions|admin)\//u;
const MESSAGE =
  "the 'users' table is read/written ONLY by domain/sessions + domain/admin (the no-direct-users-read chokepoint, admin.md §317). Every other domain takes userId from the resolved Principal (the injected context) — never query users directly.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** Collect every `users`-table named import from `@orb/db` in one file. */
function usersImportsIn(sf: SourceFile, root: string): Violation[] {
  const out: Violation[] = [];
  for (const decl of sf.getImportDeclarations()) {
    if (!DB_SPECIFIER.test(decl.getModuleSpecifierValue())) {
      continue;
    }
    for (const named of decl.getNamedImports()) {
      if (named.getName() === TABLE) {
        out.push({
          file: relPath(root, sf.getFilePath()),
          line: named.getStartLineNumber(),
          message: MESSAGE,
        });
      }
    }
  }
  return out;
}

export const noDirectUsersRead: Check = {
  name: "no-direct-users-read",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (DOMAIN.test(path) && !EXEMPT.test(path)) {
        violations.push(...usersImportsIn(sf, root));
      }
    }
    return violations;
  },
};
