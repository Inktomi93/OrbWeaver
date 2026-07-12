// Gate: no-direct-users-read (Spine-Identity-and-Auth.md — resolve-once Principal; the no-direct-users-read chokepoint) — `users` is the identity
// root every single-owned table FKs. It is read/written through exactly TWO sanctioned domains: `sessions`
// (the resolution-path writer — validate / provisionIdentity / ensureUser) and `admin` (the user-management
// surface). EVERY OTHER domain takes `userId` from the resolved `Principal` (via the injected context) and
// NEVER queries `users` — joining it sideways re-couples identity into a feature and dodges the resolve-once
// model. This makes the documented chokepoint PHYSICS: a domain outside sessions/admin importing the `users`
// table symbol from `@orb/db` is RED. (The `@orb/db` schema files legitimately FK `users`; they are not
// under `domain/`, so they are unaffected.)
import type { ImportSpecifier, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const TABLE = "users";
const DB_SPECIFIER = /^@orb\/db(?:\/|$)/u;
const DOMAIN = /\/packages\/server\/src\/domain\//u;
const EXEMPT = /\/packages\/server\/src\/domain\/(?:sessions|admin)\//u;
const MESSAGE =
  "the 'users' table is read/written ONLY by domain/sessions + domain/admin (the no-direct-users-read chokepoint — Spine-Identity-and-Auth.md). Every other domain takes userId from the resolved Principal (the injected context) — never query users directly.";

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

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (a)) ──────────────────────────────────────────────
// The legacy predicate as an ImportSpecifier subscription: a `users` named import from @orb/db, in a
// domain file outside sessions/admin. scanRoot mirrors the legacy DOMAIN && !EXEMPT filter (the parity
// oracle). Per-occurrence (each `users` named import is its own finding). Kept ALONGSIDE the legacy Check.
const MSG_DIR = /packages\/server\/src\/domain\//u;
const MSG_EXEMPT = /packages\/server\/src\/domain\/(?:sessions|admin)\//u;

/** Is this ImportSpecifier a `users` named import from an @orb/db module? */
function isUsersFromDb(spec: ImportSpecifier): boolean {
  if (spec.getName() !== TABLE) {
    return false;
  }
  const decl = spec.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  return decl !== undefined && DB_SPECIFIER.test(decl.getModuleSpecifierValue());
}

export const gate: GateDescriptor = {
  name: "no-direct-users-read",
  docRow: "Spine-Identity-and-Auth.md (no-direct-users-read chokepoint)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "take userId from the resolved Principal (the injected context); the `users` table is read/written ONLY by domain/sessions + domain/admin.",
  scanRoot: (p) => MSG_DIR.test(p) && !MSG_EXEMPT.test(p),
  kinds: [SyntaxKind.ImportSpecifier],
  visit: (node, _sf, ctx) => {
    if (Node.isImportSpecifier(node) && isUsersFromDb(node)) {
      ctx.report(node, { token: TABLE, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'import { users } from "@orb/db";\nexport const u = users;\n',
      at: "packages/server/src/domain/billing/x.ts",
      why: "a `users` named import from @orb/db in a domain outside sessions/admin — the chokepoint dodge",
    },
  ],
  mustPass: [
    {
      files: 'import { messages } from "@orb/db";\nexport const m = messages;\n',
      at: "packages/server/src/domain/billing/y.ts",
      why: "a DIFFERENT table from @orb/db passes — only `users` is the identity-root chokepoint",
    },
  ],
};
