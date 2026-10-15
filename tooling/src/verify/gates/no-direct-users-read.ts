// Identity persistence belongs in sessions/admin; entry orchestrates their operations, including boot.
// The sealed-origin reader judges the canonical users declaration through imports and member spellings.
// Domain and entry are both admitted; exact existing per-module grants license the sanctioned identity homes.
// Renamed reexports remain the candidate-prefilter limit; no policy-local permission or reader is added.
// Singleton: identity-root origin is its own semantic question; shared floor primitives do not define a family.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReferenceWithName } from "../../floor/code-facts/reference-fact.ts";
import type { OriginReferenceServices } from "../contract/origin-verdict.ts";
import { defineGate } from "../contract/policy.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { possibleSealedReference, prepareSealedReference, readSealedOrigin, sealedOriginReports, sealedReferenceServices } from "../lib/sealed-origin.ts";

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
function candidate(node: MorphNode, services: OriginReferenceServices): MorphNode | undefined {
  if (Node.isImportSpecifier(node)) {
    return node.getName() === TABLE ? node : undefined;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return;
  }
  const member = readMemberReferenceWithName(node, services.readComputedName);
  return member.kind === "resolved" && member.value.name === TABLE ? node : undefined;
}

export const gate = defineGate({
  id: "no-direct-users-read",
  family: "no-direct-users-read",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/domain/**", "packages/server/src/entry/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const readers = new Map<string, MorphNode>();
    const pending: MorphNode[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node) => {
            if (!possibleSealedReference(node, USERS_HOME.exportedNames)) {
              return;
            }
            pending.push(node);
            prepareSealedReference(ctx, node);
          },
        },
      ],
      evaluate: () => {
        for (const node of pending) {
          const services = sealedReferenceServices(ctx, node);
          const anchor = candidate(node, services);
          if (anchor === undefined || !sealedOriginReports(readSealedOrigin(anchor, USERS_HOME, services.moduleOrigin), anchor, services.declarations)) {
            continue;
          }
          const subject = ctx.relativePath(node.getSourceFile());
          // ONE finding per carrier: a grant licenses one `(subject, operation)`, and a module that both
          // imports and dereferences the table would otherwise make its own row OVER-BROAD.
          if (!readers.has(subject)) {
            readers.set(subject, anchor);
          }
        }
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
        "packages/server/src/entry/boot/identity.ts": 'import { users } from "../../../../db/src/schema/users.ts";\nexport const identity = users;\n',
        "packages/server/src/domain/anchor.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "packages/server/src/entry/boot/identity.ts" },
      why: "boot delegates its sanctioned operation to sessions; a boot path does not license new raw identity persistence",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\n',
        "packages/server/src/entry/compose/identity.ts": 'import { users as root } from "../../../../db/src/schema/users.ts";\nexport const identity = root;\n',
        "packages/server/src/domain/anchor.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "packages/server/src/entry/compose/identity.ts" },
      why: "entry composition must delegate identity persistence rather than create a second users reader",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts": 'export const users = { name: "users" };\n',
        "packages/server/src/entry/auth/identity.ts":
          'import * as schema from "../../../../db/src/schema/users.ts";\nexport const identity = schema["users"];\n',
        "packages/server/src/domain/anchor.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "packages/server/src/entry/auth/identity.ts" },
      why: "entry namespace and bracket references reach the same sealed identity root",
    },
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/billing/x.ts", operation: "users-table-reference" },
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
        "packages/db/src/schema/users.ts": 'export const sessions = { name: "sessions" };\n',
        "packages/server/src/entry/boot/secrets.ts": 'import { sessions } from "../../../../db/src/schema/users.ts";\nexport const dependency = sessions;\n',
        "packages/server/src/domain/anchor.ts": "export {};\n",
      },
      why: "boot is admitted but a session-token dependency read is not a users-table read",
    },
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
