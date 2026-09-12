// Policy: no-direct-users-read (Spine-Identity-and-Auth.md — resolve-once Principal). `users` is the
// identity root every single-owned table FKs, and it is read/written through exactly TWO sanctioned domains:
// `sessions` (the resolution-path writer that turns a session into the Principal) and `admin` (user
// management). Every other domain takes `userId` from the resolved Principal; joining `users` sideways
// re-couples identity into a feature.
//
// IDENTITY, NOT SPELLING: the legacy reader keyed on the NAME `users` plus a `/^@orb\/db/` module-specifier
// regex, so a local object with a `users` key had to be excluded by hand and a re-export through any other
// barrel walked past. The subject is now the reference whose CANONICAL DECLARATION is the `users` export of
// the db schema, resolved through the shared sealed-origin reader — the named import, the namespace member
// (`schema.users`) and the bracket spelling (`schema["users"]`) are one reference however they are written,
// and a same-named export of another module is provably not it.
//
// AUTHORITY IS reviewed-grant. The two identity domains are not per-occurrence mistakes; each importing
// module is a recurring repository PERMISSION and takes one exact `(subject, operation)` row in the central
// reviewed-grant table. A row per FILE, deliberately: the legacy `domain/sessions/` and `domain/admin/` rows
// were DIRECTORY licences that admitted every future file under them, which the final law forbids. The two
// legacy staleness arms are BOTH the grant table now — a domain that stops reading `users` (mode A) and a
// domain that moves (mode B) each leave their rows consumed zero times, which is the central STALE alarm.
// The db schema home is outside this policy's population, so its own liveness is that same alarm rather
// than a receipt: if `users` moves out of the schema, every reference resolves foreign, every row goes
// stale, and the run says so at each row instead of silently having nothing to judge.
//
// FAMILY: SINGLETON (`no-direct-users-read`). `lib/sealed-origin.ts#readSealedOrigin`/`sealedOriginReports`
// and `lib/reference-fact.ts#readMemberReference` are corpus-wide primitives, not a family computation; the
// identity root's home constant is this policy's alone and no sibling shares its subject.
// POPULATION PORT: byte-identical. The legacy descriptor filtered `MSG_DIR.test(p)` where
// `MSG_DIR = /packages\/server\/src\/domain\//` (`9808b93c0^:71`); the final population is
// `{ in: ["@server"], under: ["packages/server/src/domain/**"] }`. The legacy `domain/sessions/` and
// `domain/admin/` rows were scanned-and-excused SANCTIONED_HOMES entries, never a population subtraction, so
// nothing moved between the two halves at the conversion.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { readSealedOrigin, sealedOriginReports } from "../lib/sealed-origin.ts";

const TABLE = "users";
const OPERATION = "users-table-reference";

/** The identity root's declaration home: the db schema directory, so an internal split cannot retire the arm. */
const USERS_HOME: SealedHome = { pathInfix: "/packages/db/src/schema/", exportedNames: new Set([TABLE]) };

const MESSAGE =
  "the `users` table is read/written ONLY by domain/sessions + domain/admin (the no-direct-users-read " +
  "chokepoint — Spine-Identity-and-Auth.md). Every other domain takes userId from the resolved Principal " +
  "(the injected context) and never queries users directly.";
const FIX = "take userId from the resolved Principal (the injected context); the `users` table is read/written ONLY by domain/sessions + domain/admin.";

/** THE CANDIDATE PREFILTER: an `ImportSpecifier`'s `getName()` is the exported name even under an alias, and
 *  a namespace member is spelled with the exported name too. A re-export under a DIFFERENT name is the one
 *  loss, declared in a `mustPass` row and shared with the legacy reader. */
function candidate(node: MorphNode): MorphNode | undefined {
  if (Node.isImportSpecifier(node)) {
    return node.getName() === TABLE ? node : undefined;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return;
  }
  const member = readMemberReference(node);
  return member.kind === "resolved" && member.value.name === TABLE ? node : undefined;
}

export const gate = defineGate({
  id: "no-direct-users-read",
  family: "no-direct-users-read",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/domain/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const readers = new Map<string, MorphNode>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node, sourceFile: SourceFile) => {
            const anchor = candidate(node);
            if (anchor === undefined || !sealedOriginReports(readSealedOrigin(anchor, USERS_HOME), anchor)) {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            // ONE finding per carrier: a grant licenses one `(subject, operation)`, and a module that both
            // imports and dereferences the table would otherwise make its own row OVER-BROAD.
            if (!readers.has(subject)) {
              readers.set(subject, anchor);
            }
          },
        },
      ],
      evaluate: () => {
        for (const [subject, anchor] of [...readers].toSorted(([left], [right]) => left.localeCompare(right))) {
          ctx.report.node(anchor, { subject, operation: OPERATION, message: `${MESSAGE} Reader: ${subject}.`, fix: FIX });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\n',
        "packages/server/src/domain/billing/x.ts": 'import { users } from "../../../../db/src/schema/users.ts";\nexport const u = users;\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/billing/x.ts" },
      why: "the founding shape — a `users` import in a domain outside sessions/admin, the chokepoint dodge; the message carries the exact grant SUBJECT",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\n',
        "packages/db/src/index.ts": 'export { users } from "./schema/users.ts";\n',
        "packages/server/src/domain/billing/barrel.ts": 'import { users } from "../../../../db/src/index.ts";\nexport const u = users;\n',
      },
      expect: { count: 1 },
      why: "A RE-EXPORT through the db barrel is the same table — the canonical declaration is still the schema module, so the barrel is not a laundry",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\n',
        "packages/server/src/domain/billing/ns.ts": 'import * as schema from "../../../../db/src/schema/users.ts";\nexport const u = schema.users;\n',
      },
      expect: { count: 1 },
      why: "#1506: the NAMESPACE spelling of the same read produces no ImportSpecifier at all — the identity chokepoint was one `import * as` away before the shared reader",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\n',
        "packages/server/src/domain/billing/bracket.ts": 'import * as schema from "../../../../db/src/schema/users.ts";\nexport const u = schema["users"];\n',
      },
      expect: { count: 1 },
      why: "#1506: the BRACKET spelling of the namespace read is the same reference, so it is the same finding",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\n',
        "packages/server/src/domain/billing/twice.ts":
          'import { users } from "../../../../db/src/schema/users.ts";\nexport const a = users;\nexport const b = users;\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: the import and its uses are ONE finding per carrier, because a reviewed grant licenses one `(subject, operation)` and two matching findings make the row OVER-BROAD and license neither",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/billing/unreadable.ts": 'import { users } from "./missing-barrel.ts";\nexport const u = users;\n',
      },
      expect: { count: 1 },
      why: "FAIL-CLOSED at the DECLARED DOOR — a `users` import that resolves to nothing is reported rather than admitted",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\nexport const messages = { name: "messages" };\n',
        "packages/server/src/domain/billing/y.ts": 'import { messages } from "../../../../db/src/schema/users.ts";\nexport const m = messages;\n',
      },
      why: "a DIFFERENT table from the same schema home passes — only `users` is the identity-root chokepoint",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\n',
        "packages/server/src/domain/billing/local.ts": "const schema = { users: 1 };\nexport const u = schema.users;\n",
      },
      why: "#1506's negative control, now proven by IDENTITY rather than by a specifier regex: a LOCAL object with a `users` key binds its own property declaration, so the member read is not a subject at all",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/billing/foreign.ts": "export const users = { name: 'not the table' };\nexport const u = users;\n",
        "packages/server/src/domain/billing/import-foreign.ts": 'import { users } from "./foreign.ts";\nexport const u = users;\n',
      },
      why: "THE HOME COUNTERFACTUAL — a GENUINE module export named `users` that resolves cleanly to a declaration OUTSIDE the db schema is a different symbol. Deleting the home comparison turns this row red, which is what proves the identity was resolved and not spelled",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\n',
        "packages/db/src/barrel.ts": 'export { users as identityRoot } from "./schema/users.ts";\n',
        "packages/server/src/domain/billing/renamed.ts": 'import { identityRoot } from "../../../../db/src/barrel.ts";\nexport const u = identityRoot;\n',
      },
      why: "DECLARED LIMIT — a barrel that RE-EXPORTS the table under a DIFFERENT name is outside the candidate prefilter. The legacy name reader missed it too, so this is a written baseline rather than a regression; closing it means resolving an origin on every identifier in a 1,144-file population, which does not finish",
    },
  ],
});
