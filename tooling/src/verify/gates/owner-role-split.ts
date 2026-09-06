// Policy: owner-role-split (ledger D17; Spine-Identity invariant #6) — `can()` is the ONLY
// privilege-comparison site: the global-role lattice (`owner ⊇ admin`) is decided inside
// `domain/admin/guard.ts` and nowhere else. A scattered `role === "owner"` comparison re-spells the lattice,
// which is how a delegated admin silently gains or loses owner surface.
//
// IDENTITY, NOT SPELLING, ON BOTH HALVES. The legacy reader hardcoded the literal set (`"owner"`/`"admin"`)
// inside the gate and matched the operand's TEXT against `/(?:^|\.)role$/i`. Both halves are now facts: the
// literal set is READ FROM `USER_ROLES`' own declaration through the shared `tupleVocabularyFact`, bound to
// its home in `packages/contracts/src/identity/`, so a member added to the lattice is judged the day it
// lands and a vocabulary that stops resolving takes the receipt to zero and WITHHOLDS the verdict; and the
// AXIS is proven by the read's own TYPE, which is what separates the global-role `role` from the message-row
// `role` that is compared to `"user"` in ten live places under `domain/`.
//
// THE `role` NAME REMAINS PART OF THE SUBJECT — a declared narrowing, not an oversight. Dropping it widens
// onto every comparison of a `UserRole`-typed value (`resolvedRole === "owner"` at
// `domain/sessions/verbs/provision-identity.ts:180,310` is the live shape), which is a burn-down with its
// own decision to make rather than a conversion. The limit carries a `mustPass` row.
//
// AUTHORITY IS reviewed-grant, and the legacy `packages/server/src/domain/admin/guard.ts` row is DELETED
// rather than translated: the guard encodes `owner ⊇ admin` as an exhaustive `ROLES_FOR_GLOBAL_ACTION`
// record and `.includes(principal.role)`, so it spells no literal comparison at all and the row licensed
// NOTHING. As a grant it would be STALE on its first complete run. The privilege seam is therefore
// grant-free today; the day it does compare a global-role literal, that is one exact reviewed row rather
// than a code change.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readIsOnAxis, readRoleComparison, vocabularyAtHome, vocabularyMembers } from "../lib/role-vocabulary.ts";
import { tupleVocabularyFact, tupleVocabularyReceipt } from "../lib/tuple-vocabulary-fact.ts";

const VOCABULARY = "USER_ROLES";
const VOCABULARY_HOME = "/packages/contracts/src/identity/";
const OPERATION = "global-role-comparison";
/** `user` is a role but not a PRIVILEGE: the lattice this policy confines is `owner ⊇ admin`. */
const LATTICE_MEMBERS: readonly string[] = ["owner", "admin"];

const MESSAGE =
  "global-role literal comparison outside domain/admin/guard.ts — can() is the ONE privilege seam (D17; " +
  "Spine-Identity inv #6): `owner ⊇ admin` lives inside it, and everything else calls " +
  "can()/requireAdmin/requireOwner rather than re-spelling the lattice.";
const FIX = "call can()/requireAdmin/requireOwner — the privilege lattice (owner ⊇ admin) lives ONLY inside domain/admin/guard.ts.";

export const gate = defineGate({
  id: "owner-role-split",
  family: "role-vocabulary",
  authority: "reviewed-grant",
  severity: "error",
  population: "@server",
  analysis: "types",
  execution: "entire-population",
  facts: [tupleVocabularyFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: { readonly node: MorphNode; readonly read: MorphNode; readonly value: string; readonly subject: string }[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.BinaryExpression],
          visit: (node, sourceFile: SourceFile) => {
            const comparison = readRoleComparison(node);
            if (comparison !== undefined) {
              candidates.push({ node, read: comparison.read, value: comparison.value, subject: ctx.relativePath(sourceFile) });
            }
          },
        },
      ],
      evaluate: () => {
        const vocabulary = vocabularyAtHome(ctx.fact(tupleVocabularyFact).read(VOCABULARY), VOCABULARY, VOCABULARY_HOME);
        ctx.receipt({ kind: "population", ...tupleVocabularyReceipt(vocabulary) });
        const members = vocabularyMembers(vocabulary);
        if (members.size === 0) {
          return;
        }
        const reported = new Map<string, MorphNode>();
        for (const candidate of candidates) {
          const onLattice = LATTICE_MEMBERS.includes(candidate.value) && members.has(candidate.value);
          if (!(onLattice && readIsOnAxis(candidate.read, members))) {
            continue;
          }
          // ONE finding per carrier: a reviewed grant licenses one `(subject, operation)`.
          if (!reported.has(candidate.subject)) {
            reported.set(candidate.subject, candidate.node);
          }
        }
        for (const [subject, node] of [...reported].toSorted(([left], [right]) => left.localeCompare(right))) {
          ctx.report.node(node, { subject, operation: OPERATION, message: `${MESSAGE} Comparer: ${subject}.`, fix: FIX });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const USER_ROLES = ["owner", "admin", "user"] as const;\nexport type UserRole = (typeof USER_ROLES)[number];\n',
        "packages/server/src/domain/hub/x.ts":
          'import type { UserRole } from "../../../../contracts/src/identity/index.ts";\nexport const isOwner = (r: { role: UserRole }): boolean => r.role === "owner";\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/hub/x.ts" },
      why: "the founding shape — a global-role literal comparison outside the guard re-spells the privilege lattice (D17); the message carries the exact grant SUBJECT",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const USER_ROLES = ["owner", "admin", "user"] as const;\nexport type UserRole = (typeof USER_ROLES)[number];\n',
        "packages/server/src/domain/hub/reversed.ts":
          'import type { UserRole } from "../../../../contracts/src/identity/index.ts";\nexport const isAdmin = (r: { role: UserRole }): boolean => "admin" === r.role;\n',
      },
      expect: { count: 1 },
      why: "operand order reversed, and the literal is `admin` — the second lattice member, read from the vocabulary rather than hardcoded here",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const USER_ROLES = ["owner", "admin", "user"] as const;\nexport type UserRole = (typeof USER_ROLES)[number];\n',
        "packages/server/src/domain/hub/bracket.ts":
          'import type { UserRole } from "../../../../contracts/src/identity/index.ts";\nexport const isOwner = (r: { role: UserRole }): boolean => r["role"] === "owner";\n',
      },
      expect: { count: 1 },
      why: 'the COMPUTED-LITERAL spelling of the same read — the legacy `/(?:^|\\.)role$/` text test could not see `r["role"]` at all',
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const USER_ROLES = ["owner", "admin", "user"] as const;\nexport type UserRole = (typeof USER_ROLES)[number];\n',
        "packages/server/src/domain/hub/aliased-literal.ts":
          'import type { UserRole } from "../../../../contracts/src/identity/index.ts";\nconst OWNER = "owner";\nexport const isOwner = (r: { role: UserRole }): boolean => r.role === OWNER;\n',
      },
      expect: { count: 1 },
      why: "the compared VALUE is read through the shared static-string reader, so a const alias of the literal is the same comparison — a bare literal-text match missed it",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const USER_ROLES = ["owner", "admin", "user"] as const;\nexport type UserRole = (typeof USER_ROLES)[number];\n',
        "packages/server/src/domain/hub/twice.ts":
          'import type { UserRole } from "../../../../contracts/src/identity/index.ts";\nexport const a = (r: { role: UserRole }): boolean => r.role === "owner";\nexport const b = (r: { role: UserRole }): boolean => r.role === "admin";\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two lattice comparisons in one carrier are ONE finding, because a reviewed grant licenses one `(subject, operation)` and two matching findings make the row OVER-BROAD and license neither",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const USER_ROLES = ["owner", "admin", "user"] as const;\nexport type UserRole = (typeof USER_ROLES)[number];\n',
        "packages/server/src/domain/hub/message-row.ts":
          'export const isUser = (m: { role: "system" | "user" | "assistant" }): boolean => m.role === "user";\n',
      },
      why: 'THE AXIS COUNTERFACTUAL, and the reason the vocabulary is a TYPE test and not a literal list: a message row\'s `role` is compared to `"user"` in ten live places under `domain/`. Its type is the MESSAGE axis, so it is not the privilege lattice — deleting the axis test floods this policy',
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const USER_ROLES = ["owner", "admin", "user"] as const;\nexport type UserRole = (typeof USER_ROLES)[number];\n',
        "packages/server/src/domain/hub/user-member.ts":
          'import type { UserRole } from "../../../../contracts/src/identity/index.ts";\nexport const isPlain = (r: { role: UserRole }): boolean => r.role === "user";\n',
      },
      why: "`user` is a member of the vocabulary but not of the PRIVILEGE lattice this policy confines (`owner ⊇ admin`) — the legacy literal set said the same thing, and this row keeps the widening from happening by accident",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const USER_ROLES = ["owner", "admin", "user"] as const;\nexport type UserRole = (typeof USER_ROLES)[number];\n',
        "packages/server/src/domain/hub/lattice-record.ts":
          'import type { UserRole } from "../../../../contracts/src/identity/index.ts";\nconst ROLES_FOR_ACTION = { admin: ["owner", "admin"], owner: ["owner"] } as const;\nexport const decide = (r: { role: UserRole }, action: "admin" | "owner"): boolean => ROLES_FOR_ACTION[action].includes(r.role);\n',
      },
      why: "THE LIVE GUARD SHAPE, and why its legacy sanctioned-home row is deleted: `domain/admin/guard.ts` encodes the lattice as an exhaustive record and a membership test, so it spells no comparison and needs no grant",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/identity/index.ts":
          'export const USER_ROLES = ["owner", "admin", "user"] as const;\nexport type UserRole = (typeof USER_ROLES)[number];\n',
        "packages/server/src/domain/sessions/provision.ts":
          'import type { UserRole } from "../../../../contracts/src/identity/index.ts";\nexport const enabled = (resolvedRole: UserRole): boolean => resolvedRole === "owner";\n',
      },
      why: "DECLARED LIMIT — a `UserRole`-typed value compared under ANOTHER NAME is outside the subject, which keeps the legacy narrowing. This is the live `provision-identity.ts` shape; widening onto it is a burn-down with its own decision, not a conversion",
    },
  ],
});
