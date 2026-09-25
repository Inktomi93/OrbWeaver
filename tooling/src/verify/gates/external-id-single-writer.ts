// Gate: external-id-single-writer (Spine-Identity-and-Auth.md invariant 10 — the bind-once identity chokepoint)
// — `users.externalId` / `external_id` is the STABLE SSO subject bound ONCE to a row. Three arms:
//   1. SUBJECT WRITERS. The registered persistence writers that bind a subject, and the only files that may
//      name each, are `SUBJECT_WRITERS` in `verify/lib/external-id-writer.ts` — that map is the census, not
//      this header. Any reference to a registered writer outside its callers is red however it is spelled: a
//      call, an aliased or namespace import, a bracket read, a re-export, or a wrapper in the persistence file
//      re-exposing it under a new name. The registry is per writer, so a caller of one writer is not a caller
//      of another. One finding per file per writer.
//   2. POSITIONAL INSERTS. `<db>.insert(users).select(…)` binds by column position, so no name says which value
//      lands in `external_id`. Outside `sessions/persistence/users.ts` it is red whatever it names; inside it,
//      one whose rows read an externalId must sit inside a registered writer. DECLARED LIMIT: inside the
//      persistence file a subject renamed before the bind (`${sub}`) reads as no externalId.
//   3. KEYED WRITES. A BIND of a NON-NULL subject: an `externalId`/`external_id` object-KEY whose nearest
//      enclosing call is a users write verb (insertUser/updateUser/set/values/onConflictDoUpdate), or an
//      `<x>.externalId = …` assignment, outside the two sanctioned files (provision-identity.ts and the
//      persistence file). A literal-`null` write (`externalId: null` — the local-user default in
//      `ensure-user.ts`, and the operator-recovery un-bind `SET external_id = NULL`) binds no subject and is NOT
//      the takeover vector, so it PASSES. Reads (`x.externalId`), the PROVISION_COLS SELECT map (no enclosing
//      write call), and audit `metadata:{externalId}` (enclosing call is `audit`) are structurally excluded.
//      DECLARED LIMIT: the write-verb callee is read through property access only, so `db["set"]` is blind
//      (the spelling-twin ledger's `bracket` row for this gate).
// A THIRD writer or caller is exactly the fragmented N-provisioning-paths hole OpenWebUI's W1 takeover rides.
//
// FAMILY: this per-node detector and `external-id-single-writer-health.ts` (the whole-population carve-out
// proof) BOTH read `verify/lib/external-id-writer.ts` — the one shared reader for the write-shape predicate,
// the two sanctioned files, and the subject-writer registry (a family means a shared `lib/` reader, never a
// shared theme, docs/law/gate-runtime-standardization.md). `hard`: there is no marker vocabulary here — a new
// caller is a registry row with its ledger ruling or a defect, never a reviewable exemption.
// COMMENT POSTURE: comment-SAFE — pure node-kind subscription, no file text is matched.
//
// POPULATION CORRECTION (re-derived 2026-09-11, #1937): the conversion had widened this policy's population
// from the legacy `scanRoot`'s server-only reach (`packages/server/src/`, 1,493 files) to `@backend`
// (`@server` + `@db` + `@contracts`, +147 files: 42 under `packages/db/src`, 105 under
// `packages/contracts/src`) with no recorded reason. Reverted to `@server`: every sanctioned/violating shape
// this family judges is a CALL SITE against the write verbs (`insertUser`/`updateUser`/`.set`/`.values`/
// `.onConflictDoUpdate`) or the atomic claim writer, and every real caller of those lives under
// `packages/server/src/domain/**` / `infra/**` — `db` only DECLARES the `externalId` column (a schema
// definition, not a call to a write verb) and `contracts` carries wire shapes, neither of which this
// predicate's AST shapes match. Widening bought no coverage and would have let a db/contracts file "carry"
// this family's reads/writes with no real consumer having asked for it.
// LEGACY SHA: (35bf7d328^) — the conversion's parent. Re-verified by the three-question test rather than
// inherited: the introducing commit is `35bf7d328` (`git log -S 'defineGate({' --reverse`), the cited sha is
// its parent by construction, and `git show 35bf7d328^:<this file>` is a LEGACY descriptor (`defineGate`
// count 0).
// POPULATION PORT: byte-identical. The legacy descriptor's `scanRoot: (p) => p.startsWith("packages/server/src/")`
// becomes `@server`, which IS `packages/server/src/` — same predicate, same anchoring, no delta. The
// paragraph above states the widening that was CONSIDERED and refused (`@db`/`@contracts`), which is the
// decision worth recording here; the port itself moved nothing.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `external-id-single-writer` descriptor at 9377887c0edb28a63931b57f697b0c1596d5aa72, the parent of the conversion
// `35bf7d328` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,356 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 1,493 and final `population` admits 1,493. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/server/src/domain/admin/__cbbhr_in_context.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
// CONVERSION-COMMIT PORT (verifier cb-v-header-residue L5): the figures above resolve TODAY'S declaration. The
// conversion `35bf7d328` itself declared `@backend`: legacy 1,493 vs final 1,640, legacy − final = ∅, final − legacy
// = 147 (`packages/contracts/src` 105, `packages/db/src` 42) — the unrecorded widening the POPULATION CORRECTION
// paragraph above describes. Later change, recorded separately: `841d080a9` (#1937) reverted it to `@server`, which
// gives the ∅/∅ above.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import {
  EXTERNAL_ID_SANCTIONED_FILES,
  externalIdWriteAnchor,
  isExternalIdAssignment,
  isExternalIdWriteKey,
  LINK_CAPABILITY,
  PENDING_SIGNUP_CAPABILITY,
  PROVISION_CAPABILITY,
  positionalInsertSanctioned,
  positionalUsersInsert,
  SUBJECT_WRITERS,
  subjectWriterReference,
} from "../lib/external-id-writer.ts";

const MESSAGE =
  "a `users.externalId` write or subject-binding writer reference outside its registered callers (Spine-Identity-and-Auth.md invariant 10 — the bind-once identity chokepoint). `externalId` is the STABLE SSO subject; it is bound only through the registered writers in sessions/persistence/users.ts (`SUBJECT_WRITERS`, verify/lib/external-id-writer.ts), each reachable only from its registered capability files, and a positional users insert outside that file binds a column no name can show. A second linking site is the fragmented-provisioning hole (OpenWebUI W1 takeover) this invariant forbids.";
const FIX =
  "route the bind through a registered capability (`provisionIdentity`, `linkExternalId`, or the D254 pending-join confirm) — never write the externalId column directly or reach its writer from another file. A genuinely new subject writer or caller is a `SUBJECT_WRITERS` row with its ledger ruling, never a local write.";

const SANCTIONED_SET: ReadonlySet<string> = new Set(EXTERNAL_ID_SANCTIONED_FILES);

export const gate = defineGate({
  id: "external-id-single-writer",
  family: "external-id-single-writer",
  authority: "hard",
  severity: "error",
  population: "@server",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // One finding per file per writer: an import and its call are one reach, not two.
    const reached = new Set<string>();
    const judgeReference = (reference: NonNullable<ReturnType<typeof subjectWriterReference>>, rel: string): void => {
      const key = `${rel}\u0000${reference.writer}`;
      if (SUBJECT_WRITERS.get(reference.writer)?.has(rel) !== true && !reached.has(key)) {
        reached.add(key);
        ctx.report.node(reference.node, { token: reference.token, offset: 0 });
      }
    };
    return {
      visitors: [
        {
          kinds: [
            SyntaxKind.PropertyAssignment,
            SyntaxKind.ShorthandPropertyAssignment,
            SyntaxKind.BinaryExpression,
            SyntaxKind.CallExpression,
            SyntaxKind.Identifier,
            SyntaxKind.ElementAccessExpression,
          ],
          visit: (node: Node, sourceFile) => {
            const rel = ctx.relativePath(sourceFile);
            const reference = subjectWriterReference(node, rel);
            if (reference !== undefined) {
              judgeReference(reference, rel);
              return;
            }
            const positional = positionalUsersInsert(node);
            if (positional !== undefined) {
              if (!positionalInsertSanctioned(node, positional.rows, rel)) {
                ctx.report.node(positional.node, { token: positional.token, offset: 0 });
              }
              return;
            }
            // A sanctioned file's write is the carve-out — never reported. The health sibling re-derives the
            // same predicate over the whole population to prove each sanctioned file still earns its carve-out.
            if ((isExternalIdWriteKey(node) || isExternalIdAssignment(node)) && !SANCTIONED_SET.has(rel)) {
              const anchor = externalIdWriteAnchor(node);
              ctx.report.node(anchor.node, { token: anchor.token, offset: 0 });
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/second-link.ts":
          'import { updateUser } from "../persistence/users.ts";\n' +
          "export async function link(db: D, userId: U, externalId: E): Promise<void> {\n" +
          "  await updateUser(db, userId, { externalId, updatedAt: 0 });\n" +
          "}\n",
      },
      expect: { count: 1, token: "externalId" },
      why: "a THIRD externalId write site — a new linking verb calling updateUser({ externalId }) outside the two sanctioned files: the fragmented-provisioning hole U1 forbids, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/second-link.ts":
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function secondLink(db: D, userId: U, externalId: E): Promise<void> {\n" +
          "  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n" +
          "}\n",
      },
      expect: { count: 1, token: "claimExternalIdIfUnbound" },
      why: "a THIRD capability calling the atomic persistence writer — indirect fragmentation is the same takeover surface, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/admin/verbs/rogue-link.ts":
          "export function patch(changes: { externalId?: string }, externalId: string): void {\n  changes.externalId = externalId;\n}\n",
      },
      expect: { count: 1 },
      why: "the assignment-shape write (`changes.externalId = …`) — the patch-building form, in a non-sanctioned domain, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/raw-set.ts":
          'import { users } from "@orb/db";\nexport const w = (db: DB, sub: string) => db.update(users).set({ external_id: sub });\n',
      },
      expect: { count: 1 },
      why: "a RAW drizzle `.set({ external_id })` write bypassing the persistence wrappers — still a column write, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/third-join.ts":
          'import { insertPendingSignupUserStatement } from "../persistence/users.ts";\n' +
          "export function join(db: D, who: W, admission: S): B {\n" +
          "  return insertPendingSignupUserStatement(db, { id: who.id, handle: who.handle, externalId: who.externalId, email: null, role: 'user', enabled: true, at: 0 }, admission);\n" +
          "}\n",
      },
      expect: { count: 1, token: "insertPendingSignupUserStatement" },
      why: "the HELPER-CALL spelling: a third sessions verb reaching the pending-join subject writer. The `externalId:` key sits under a call that is not a users write verb, so only the writer registry can see it, RED",
    },
    {
      mode: "source",
      files: {
        [LINK_CAPABILITY]:
          'import { insertPendingSignupUserStatement } from "../persistence/users.ts";\n' +
          "export function linkByJoin(db: D, row: R, admission: S): B {\n" +
          "  return insertPendingSignupUserStatement(db, row, admission);\n" +
          "}\n",
      },
      expect: { count: 1, token: "insertPendingSignupUserStatement" },
      why: "the registry is PER WRITER: link-external-id.ts may reach the claim writer, never the pending-join insert. A flat caller set would admit it, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/aliased-link.ts":
          'import { claimExternalIdIfUnbound as bindOnce } from "../persistence/users.ts";\n' +
          "export async function link(db: D, userId: U, externalId: E): Promise<void> {\n" +
          "  await bindOnce(db, userId, externalId, 0);\n" +
          "}\n",
      },
      expect: { count: 1, token: "claimExternalIdIfUnbound" },
      why: "the ALIASED import of the claim writer: a callee-name match sees only `bindOnce`. The reference is judged at the imported name, so an alias buys nothing, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/bracket-link.ts":
          'import * as persistence from "../persistence/users.ts";\n' +
          "export async function link(db: D, userId: U, externalId: E): Promise<void> {\n" +
          '  await persistence["claimExternalIdIfUnbound"](db, userId, externalId, 0);\n' +
          "}\n",
      },
      expect: { count: 1, token: '"claimExternalIdIfUnbound"' },
      why: "the NAMESPACE BRACKET read of the claim writer: no import specifier names it and no identifier spells it, so only the element-access reader sees it, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { users } from "@orb/db";\nimport { sql } from "drizzle-orm";\n' +
          "export function insertPendingSignupUserStatement(db: DB, row: R, admission: S): B {\n" +
          "  return db.insert(users).select(sql`select ${row.id}, ${row.handle}, ${row.externalId} where ${admission}`).returning({ id: users.id });\n" +
          "}\n" +
          "export const insertAnyJoin = (db: DB, row: R, admission: S): B => insertPendingSignupUserStatement(db, row, admission);\n",
      },
      expect: { count: 1, token: "insertPendingSignupUserStatement" },
      why: "a WRAPPER in the persistence file re-exposing a registered writer under a new name, which no caller registry names. Only the declaration itself is exempt in its home, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/raw-join.ts":
          'import { users } from "@orb/db";\nimport { sql } from "drizzle-orm";\n' +
          "export const join = (db: DB, id: string, handle: string, sub: string): B =>\n" +
          "  db.insert(users).select(sql`select ${id}, ${handle}, ${sub}, null, 'user', 1, null, 'human', null, 0, 0`);\n",
      },
      expect: { count: 1, token: "select" },
      why: "the RAW POSITIONAL spelling outside the persistence file: values bind by column position, so `${sub}` lands in external_id under no name the gate could read. A positional users insert outside users.ts is red whatever it names, RED",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { users } from "@orb/db";\nimport { sql } from "drizzle-orm";\n' +
          "export function insertSsoUserStatement(db: DB, row: R): B {\n" +
          "  return db.insert(users).select(sql`select ${row.id}, ${row.handle}, ${row.externalId}, null, 'user', 1, null, 'human', null, 0, 0`).returning({ id: users.id });\n" +
          "}\n",
      },
      expect: { count: 1, token: "select" },
      why: "an UNREGISTERED positional subject writer in the persistence file: it reads an externalId into a users insert and no registry row names it or its callers, RED",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [LINK_CAPABILITY]:
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function linkExternalId(db: D, userId: U, externalId: E): Promise<void> {\n" +
          "  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n" +
          "}\n",
      },
      why: "the sanctioned admin capability calling its exact persistence writer, passes",
    },
    {
      mode: "source",
      files: {
        [PROVISION_CAPABILITY]:
          'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
          "export async function bindOwnerSubject(db: D, ownerId: U, externalId: E): Promise<boolean> {\n" +
          "  return await claimExternalIdIfUnbound(db, ownerId, externalId, 0);\n" +
          "}\n",
      },
      why: "the SSO-seam upsert binding the owner-flip subject through the SAME atomic writer (#1451) — the second sanctioned capability, not a third mechanism: it REPLACED a read-then-plain-UPDATE, so the bind count went 2 → 1, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { users } from "@orb/db";\nexport const COLS = { id: users.id, externalId: users.externalId } as const;\nexport const read = (db: DB) => db.select(COLS);\n',
      },
      why: "the PROVISION_COLS SELECT map (`externalId: users.externalId`, nearest call `.select`) — a READ column map, not a write, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/admin/verbs/audit-only.ts":
          "export async function audit(a: unknown, at: number): Promise<void> {\n  void a;\n  void at;\n}\n" +
          "export async function log(externalId: string): Promise<void> {\n" +
          '  await audit({ action: "link", metadata: { externalId, idempotent: true } }, 0);\n' +
          "}\n",
      },
      why: "an audit `metadata: { externalId }` (nearest call `audit`, not a write verb) — the observed admin idempotent-audit shape, not a column write, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/infra/auth/modes/forward-header.ts":
          "export interface Claim {\n  readonly handle: string;\n  readonly externalId: string | null;\n}\n" +
          "export const build = (uid: string): Claim => ({ handle: uid, externalId: uid });\n",
      },
      why: "an identity-CLAIM construction (`{ handle, externalId }` returned, no enclosing write call) — the infra/auth ResolvedIdentity shape, not a users write, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/substrate/role-policy.ts":
          "export const same = (a: { externalId: string | null }, b: string | null): boolean => a.externalId === b;\n",
      },
      why: "an equality READ (`a.externalId === b`, a `===` token) — the bind-once compare, not an assignment, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/verbs/ensure-user.ts":
          'import { insertUser } from "../persistence/users.ts";\n' +
          "export async function ensure(db: D, handle: string): Promise<void> {\n" +
          "  await insertUser(db, { handle, externalId: null, role: 'user' });\n" +
          "}\n",
      },
      why: "the local-user default `externalId: null` (the real ensure-user shape) — binds no subject and is not the takeover vector, passes",
    },
    {
      mode: "source",
      files: {
        [PENDING_SIGNUP_CAPABILITY]:
          'import { insertPendingSignupUserStatement } from "../persistence/users.ts";\n' +
          "export function account(db: D, who: W, admission: S): B {\n" +
          "  return insertPendingSignupUserStatement(db, { id: who.id, handle: who.handle, externalId: who.externalId, email: null, role: 'user', enabled: true, at: 0 }, admission);\n" +
          "}\n",
      },
      why: "the registered caller of the pending-join writer: the D254 confirm plans through decideProvision and binds its subject only through this one statement, passes. Drop this file from the writer's registered callers and this reds",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/sessions/persistence/users.ts":
          'import { users } from "@orb/db";\nimport { and, eq, isNull, sql } from "drizzle-orm";\n' +
          "export function insertSignupUserStatement(db: DB, row: R, admission: S): B {\n" +
          "  return db.insert(users).select(sql`select ${row.id}, ${row.handle}, null, null, 'user', 1, ${row.passwordHash}, 'human', null, ${row.at}, ${row.at} where ${admission}`).returning({ id: users.id });\n" +
          "}\n" +
          "export function insertPendingSignupUserStatement(db: DB, row: R, admission: S): B {\n" +
          "  return db.insert(users).select(sql`select ${row.id}, ${row.handle}, ${row.externalId}, ${row.email} where changes() > 0 and ${admission}`).returning({ id: users.id });\n" +
          "}\n" +
          "export function claimExternalIdIfUnbound(db: DB, id: string, externalId: E, updatedAt: number): B {\n" +
          "  return db.update(users).set({ externalId, updatedAt }).where(and(eq(users.id, id), isNull(users.externalId))).returning({ id: users.id });\n" +
          "}\n",
      },
      why: "the real persistence file: the local signup's positional insert binds a literal null subject and reads no externalId, the registered pending-join writer reads one, and the claim writer's declaration is its own name, passes. Cut the reads-an-externalId fence or the registered-writer exemption and this reds",
    },
  ],
});
