// Gate: no-direct-users-read (Spine-Identity-and-Auth.md — resolve-once Principal) — `users` is the
// identity root every single-owned table FKs; it is read/written through exactly TWO sanctioned domains
// (`sessions` — the resolution-path writer, and `admin` — user-management). Every other domain takes
// `userId` from the resolved `Principal`; joining `users` sideways re-couples identity into a feature.
// A domain outside sessions/admin importing the `users` table symbol from `@orb/db` is RED — reached by a
// NAMED import or through an `import * as schema` namespace member in either spelling (`schema.users`,
// `schema["users"]`). The namespace route produces no ImportSpecifier at all and walked past this
// chokepoint in silence until #1506; the reference is one thing however it is written.
//
// TWO-SIDED (gate-hub #10): the carve-out ratchets DOWN — an EXEMPT_DOMAINS row whose domain imports no
// `users` symbol any more is RED (the sanctioned-reader claim died; a standing carve-out for a domain that
// no longer touches identity is a licence waiting to be used). The arm self-guards on a REAL-TREE ANCHOR
// (gate-hub #11): the identity root's own schema file, which a conformance mini-project only has when an
// example materializes it deliberately.
//
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the two identity domains are SCANNED and exempted
// by cited rows, not scoped out of scanRoot — a carve-out keyed on a path that no longer exists is
// unfalsifiable, and the shared RENAME TRIPWIRE (mode B) is what makes it falsifiable.
import type { SourceFile, Node as TsMorphNode } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";
import { homeFiles, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";
import { MEMBER_ACCESS_KINDS, moduleMemberReference } from "../lib/symbol-reference.ts";

const TABLE = "users";
const DB_SPECIFIER = /^@orb\/db(?:\/|$)/u;
const MESSAGE =
  "the 'users' table is read/written ONLY by domain/sessions + domain/admin (the no-direct-users-read chokepoint — Spine-Identity-and-Auth.md). Every other domain takes userId from the resolved Principal (the injected context) — never query users directly.";
const MSG_DIR = /packages\/server\/src\/domain\//u;
const DOMAIN_ROOT = "packages/server/src/domain/";

/** The TWO sanctioned identity domains (Spine-Identity-and-Auth.md): sessions writes on the resolution
 *  path, admin does user management. Keyed by PATH so both staleness modes can name the dead one. */
const SANCTIONED_HOMES: ExemptionTable = {
  [`${DOMAIN_ROOT}sessions/`]: {
    why: "the resolution-path writer — it is what turns a session into the Principal every other domain reads userId from, so it must touch the identity root. Ends when sessions stops importing `users` (mode A) or moves (mode B)",
  },
  [`${DOMAIN_ROOT}admin/`]: {
    why: "user MANAGEMENT (role grants, the owner/admin surface) is the other sanctioned reader. Same two end conditions",
  },
};

const GATE_SELF = "tooling/src/verify/gates/no-direct-users-read.ts";
/** Real-tree anchor (gate-hub #11): the identity root's own schema file. */
const ANCHOR = "packages/db/src/schema/users.ts";
const STALE_PREFIX =
  "stale EXEMPT_DOMAINS row — this domain imports no `users` symbol any more, so its sanctioned-reader " +
  "claim is dead and the carve-out is just a standing licence (ratchet down): ";

/** Every spelling of a `users` reference from `@orb/db` — the named ImportSpecifier and the namespace
 *  member read. ONE predicate, so the two arms can never disagree about what a `users` read is, and the
 *  stale arms below judge the same set the visit does. */
function isUsersReference(node: TsMorphNode): boolean {
  const reference = moduleMemberReference(node, (specifier) => DB_SPECIFIER.test(specifier));
  return reference !== undefined && reference.name === TABLE;
}

/** Does this file read `users` from `@orb/db` at all, in ANY spelling? The stale (mode A) arm's question. */
function readsUsers(sf: SourceFile): boolean {
  return sf.forEachDescendant((node) => (isUsersReference(node) ? true : undefined)) === true;
}

export const gate: GateDescriptor = {
  name: "no-direct-users-read",
  docRow: "Spine-Identity-and-Auth.md (no-direct-users-read chokepoint)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "take userId from the resolved Principal (the injected context); the `users` table is read/written ONLY by domain/sessions + domain/admin.",
  scanRoot: (p) => MSG_DIR.test(p),
  kinds: [SyntaxKind.ImportSpecifier, ...MEMBER_ACCESS_KINDS],
  visit: (node, sf, ctx) => {
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (isUsersReference(node)) {
      ctx.report(node, { token: TABLE, offset: 0 });
    }
  },
  finalize: (ctx) => {
    // MODE B (the rename tripwire) — a carve-out whose domain dir resolves to nothing.
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "sanctioned identity domain", anchor: ANCHOR });
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    // MODE A — the domain exists but no longer reads `users`, so its sanctioned-reader claim is dead.
    for (const key of Object.keys(SANCTIONED_HOMES)) {
      const files = homeFiles(ctx, key);
      const reads = files.some((sf) => readsUsers(sf));
      if (files.length > 0 && !reads) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}"${key}" — delete the row in tooling/src/verify/gates/no-direct-users-read.ts`,
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
      files: 'import * as schema from "@orb/db";\nexport const u = schema.users;\n',
      at: "packages/server/src/domain/billing/ns.ts",
      expect: { count: 1, token: TABLE },
      why: "#1506: the NAMESPACE spelling of the same read. Before the shared reader this produced ZERO findings — there is no ImportSpecifier to visit, so the identity chokepoint was one `import * as` away",
    },
    {
      files: 'import * as schema from "@orb/db";\nexport const u = schema["users"];\n',
      at: "packages/server/src/domain/billing/bracket.ts",
      expect: { count: 1, token: TABLE },
      why: "#1506: the bracket spelling of the namespace read — the same reference, so the same finding",
    },
    {
      files: {
        [ANCHOR]: 'export const users = sqliteTable("users", {});\n',
        "packages/server/src/domain/sessions/persistence/users.ts": 'import { users } from "@orb/db";\nexport const u = users;\n',
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "MODE B (the rename tripwire): the anchor is loaded and sessions still reads `users`, while admin resolves to NO file — the carve-out names a domain that is gone. Exactly ONE finding: mode A is guarded on the home having files, so the two arms never double-report the same row",
    },
    {
      files: {
        [ANCHOR]: 'export const users = sqliteTable("users", {});\n',
        "packages/server/src/domain/sessions/persistence/users.ts": 'import { users } from "@orb/db";\nexport const u = users;\n',
        "packages/server/src/domain/admin/verbs/set-role.ts": "export const setRole = null;\n",
      },
      expect: { count: 1, messageIncludes: "stale EXEMPT_DOMAINS row" },
      why: "MODE A alone: admin still EXISTS but imports no `users` symbol any more — its sanctioned-reader claim is dead and the carve-out is just a standing licence",
    },
  ],
  mustPass: [
    {
      files: 'import * as schema from "@orb/db";\nexport const m = schema.messages;\n',
      at: "packages/server/src/domain/billing/ns-other.ts",
      why: "#1506's NEGATIVE control: a namespace member naming a DIFFERENT table passes — the new arm keys on the `users` name, not on 'reached through a namespace'",
    },
    {
      files: "const schema = { users: 1 };\nexport const u = schema.users;\n",
      at: "packages/server/src/domain/billing/local.ts",
      why: "#1506's other negative control: a LOCAL object with a `users` key is not an @orb/db reference — the receiver must resolve to a namespace import of @orb/db",
    },
    {
      files: 'import { messages } from "@orb/db";\nexport const m = messages;\n',
      at: "packages/server/src/domain/billing/y.ts",
      why: "a DIFFERENT table from @orb/db passes — only `users` is the identity-root chokepoint",
    },
    {
      files: 'import { users } from "@orb/db";\nexport const u = users;\n',
      at: "packages/server/src/domain/sessions/x.ts",
      why: "THE ALLOWLIST ITSELF: the `users` import in a sanctioned identity domain (sessions — the resolution-path writer) is now SCANNED and passes on a cited row; with no anchor in this project both stale arms stay silent (THE ANCHOR GUARD)",
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
