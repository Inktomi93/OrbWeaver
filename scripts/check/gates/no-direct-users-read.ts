// Gate: no-direct-users-read (Spine-Identity-and-Auth.md — resolve-once Principal) — `users` is the
// identity root every single-owned table FKs; it is read/written through exactly TWO sanctioned domains
// (`sessions` — the resolution-path writer, and `admin` — user-management). Every other domain takes
// `userId` from the resolved `Principal`; joining `users` sideways re-couples identity into a feature.
// A domain outside sessions/admin importing the `users` table symbol from `@orb/db` is RED.
//
// TWO-SIDED (gate-hub #10): the carve-out ratchets DOWN — an EXEMPT_DOMAINS row whose domain imports no
// `users` symbol any more is RED (the sanctioned-reader claim died; a standing carve-out for a domain that
// no longer touches identity is a licence waiting to be used). The arm self-guards on a REAL-TREE ANCHOR
// (gate-hub #11): the identity root's own schema file, which a conformance mini-project only has when an
// example materializes it deliberately.
import type { ImportSpecifier } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const TABLE = "users";
const DB_SPECIFIER = /^@orb\/db(?:\/|$)/u;
const MESSAGE =
  "the 'users' table is read/written ONLY by domain/sessions + domain/admin (the no-direct-users-read chokepoint — Spine-Identity-and-Auth.md). Every other domain takes userId from the resolved Principal (the injected context) — never query users directly.";
const MSG_DIR = /packages\/server\/src\/domain\//u;
/** The TWO sanctioned identity domains (Spine-Identity-and-Auth.md): sessions writes on the resolution
 *  path, admin does user management. Named individually so the stale arm can name the dead one. */
const EXEMPT_DOMAINS = ["sessions", "admin"] as const;
const DOMAIN_ROOT = "packages/server/src/domain/";

const GATE_SELF = "scripts/check/gates/no-direct-users-read.ts";
/** Real-tree anchor (gate-hub #11): the identity root's own schema file. */
const ANCHOR = "packages/db/src/schema/users.ts";
const STALE_PREFIX =
  "stale EXEMPT_DOMAINS row — this domain imports no `users` symbol any more, so its sanctioned-reader " +
  "claim is dead and the carve-out is just a standing licence (ratchet down): ";

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
  scanRoot: (p) => MSG_DIR.test(p) && !EXEMPT_DOMAINS.some((d) => p.includes(`${DOMAIN_ROOT}${d}/`)),
  kinds: [SyntaxKind.ImportSpecifier],
  visit: (node, _sf, ctx) => {
    if (Node.isImportSpecifier(node) && isUsersFromDb(node)) {
      ctx.report(node, { token: TABLE, offset: 0 });
    }
  },
  // The exempt domains are scanRoot-EXCLUDED, so the walk never sees them — the stale arm reads them off
  // the shared project directly.
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    for (const domain of EXEMPT_DOMAINS) {
      const prefix = `${ctx.root}/${DOMAIN_ROOT}${domain}/`;
      const reads = ctx.project
        .getSourceFiles()
        .filter((sf) => sf.getFilePath().startsWith(prefix))
        .some((sf) => sf.getDescendantsOfKind(SyntaxKind.ImportSpecifier).some((spec) => isUsersFromDb(spec)));
      if (!reads) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}"${domain}" — delete the row in scripts/check/gates/no-direct-users-read.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'import { users } from "@orb/db";\nexport const u = users;\n',
      at: "packages/server/src/domain/billing/x.ts",
      why: "a `users` named import from @orb/db in a domain outside sessions/admin — the chokepoint dodge",
    },
    {
      files: {
        [ANCHOR]: 'export const users = sqliteTable("users", {});\n',
        "packages/server/src/domain/sessions/persistence/users.ts": 'import { users } from "@orb/db";\nexport const u = users;\n',
      },
      expect: { count: 1, messageIncludes: "stale EXEMPT_DOMAINS row" },
      why: "THE STALE ARM: the anchor (the identity root's schema) is loaded; sessions still reads `users` and keeps its carve-out, admin reads none — that row's sanctioned-reader claim is dead and ratchets down",
    },
  ],
  mustPass: [
    {
      files: 'import { messages } from "@orb/db";\nexport const m = messages;\n',
      at: "packages/server/src/domain/billing/y.ts",
      why: "a DIFFERENT table from @orb/db passes — only `users` is the identity-root chokepoint",
    },
    {
      files: 'import { users } from "@orb/db";\nexport const u = users;\n',
      at: "packages/server/src/domain/sessions/x.ts",
      why: "the `users` import in an EXEMPT domain (sessions — the resolution-path writer) — the carve-out, passes; with no anchor in this project the stale arm stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: 'export const users = sqliteTable("users", {});\n',
        "packages/server/src/domain/sessions/persistence/users.ts": 'import { users } from "@orb/db";\nexport const u = users;\n',
        "packages/server/src/domain/admin/verbs/set-role.ts": 'import { users } from "@orb/db";\nexport const u = users;\n',
      },
      why: "both carve-outs STILL EARNED, judged against the real-tree anchor: each identity domain does read `users`, so neither arm fires",
    },
  ],
};
