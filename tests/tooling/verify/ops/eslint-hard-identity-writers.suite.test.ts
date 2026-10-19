// Invariant 10's subject-writer registry and D257's handle-key rule run through the actual non-suppressible native profile.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Linter } from "eslint";
import { ESLint } from "eslint";
import { scaledBudget } from "../../_load-budget.ts";

const HARD_CONFIG = "eslint-hard.config.js";
const SERVER_SRC = "packages/server/src";
const SESSIONS = `${SERVER_SRC}/domain/sessions`;
const USERS = `${SESSIONS}/persistence/users.ts`;
const LINK = `${SESSIONS}/verbs/link-external-id.ts`;
const PROVISION = `${SESSIONS}/verbs/provision-identity.ts`;
const PENDING = `${SESSIONS}/verbs/pending-signup.ts`;
const CLAIM_WRITER = "claimExternalIdIfUnbound";
const PENDING_JOIN_WRITER = "insertPendingSignupUserStatement";
const CLAIM = "orb/external-id-claim-writer-callers";
const PENDING_JOIN = "orb/external-id-pending-join-writer-callers";
const HOME = "orb/external-id-writer-home";
const BINDS = "orb/external-id-subject-binds";
const OPAQUE = "orb/external-id-opaque-users-writes";
const RAW = "orb/external-id-raw-users-writes";
const PLAIN = "orb/users-write-plain-spelling";
const HANDLE_KEY = "orb/handle-key-writer";
const IDENTITY_RULES = [CLAIM, PENDING_JOIN, HOME, BINDS, OPAQUE, RAW, PLAIN, HANDLE_KEY];

// The exemption census: the server files each rule does not judge. A new caller or a widened exemption is a
// reviewed change here, and a home that moves or disappears fails the census.
const EXEMPT: Readonly<Record<string, readonly string[]>> = {
  [CLAIM]: [LINK, PROVISION, USERS],
  [PENDING_JOIN]: [PENDING, USERS],
  [BINDS]: [PROVISION, USERS],
  [OPAQUE]: [PROVISION, USERS],
  [RAW]: [USERS],
  [PLAIN]: [],
  [HANDLE_KEY]: [],
};
// Each exemption is earned: these files still bind a subject, and these callers still call their writer.
const SUBJECT_BINDERS = [PROVISION, USERS] as const;
const WRITER_CALLERS: Readonly<Record<string, readonly string[]>> = {
  [CLAIM_WRITER]: [LINK, PROVISION],
  [PENDING_JOIN_WRITER]: [PENDING],
};

interface Row {
  readonly name: string;
  readonly path: string;
  readonly source: string;
  readonly rules: readonly string[];
}

const CLAIM_IMPORT = 'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n';
const PENDING_IMPORT = 'import { insertPendingSignupUserStatement } from "../persistence/users.ts";\n';
const USERS_IMPORT = 'import { users } from "@orb/db";\n';
// Bindings declared outside @server: the rules cannot see their string values, so they refuse the computed spelling.
const COLUMN_IMPORT = 'import { SUBJECT_COLUMN } from "@orb/contracts/identity";\n';
const VERB_IMPORT = 'import { SELECT, SET, UPDATE, UPSERT } from "@orb/kit/verbs";\n';
const ADMIN = `${SERVER_SRC}/domain/admin/verbs`;

// Subject-writer cases: the per-writer caller registry, keyed and assigned binds, opaque data, raw SQL and hidden spellings.
const SUBJECT_ROWS: readonly Row[] = [
  {
    name: "a third linking verb writing the subject through updateUser",
    path: `${SESSIONS}/verbs/second-link.ts`,
    source:
      'import { updateUser } from "../persistence/users.ts";\nexport async function link(db, userId, externalId) {\n  await updateUser(db, userId, { externalId, updatedAt: 0 });\n}\n',
    rules: [BINDS],
  },
  {
    name: "a third capability calling the atomic claim writer",
    path: `${SESSIONS}/verbs/second-link.ts`,
    source: `${CLAIM_IMPORT}export async function secondLink(db, userId, externalId) {\n  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n}\n`,
    rules: [CLAIM],
  },
  {
    name: "the patch-building assignment in another domain",
    path: `${ADMIN}/rogue-link.ts`,
    source: "export function patch(changes, externalId) {\n  changes.externalId = externalId;\n}\n",
    rules: [BINDS],
  },
  {
    name: "a raw drizzle set of external_id",
    path: `${SESSIONS}/verbs/raw-set.ts`,
    source: `${USERS_IMPORT}export const w = (db, sub) => db.update(users).set({ external_id: sub });\n`,
    rules: [BINDS],
  },
  {
    name: "a third sessions verb reaching the pending-join writer",
    path: `${SESSIONS}/verbs/third-join.ts`,
    source: `${PENDING_IMPORT}export function join(db, who, admission) {\n  return insertPendingSignupUserStatement(db, { id: who.id, handle: who.handle, externalId: who.externalId, email: null, role: "user", enabled: true, at: 0 }, admission);\n}\n`,
    rules: [PENDING_JOIN],
  },
  {
    name: "a caller of one writer reaching the other writer",
    path: LINK,
    source: `${PENDING_IMPORT}export function linkByJoin(db, row, admission) {\n  return insertPendingSignupUserStatement(db, row, admission);\n}\n`,
    rules: [PENDING_JOIN],
  },
  {
    name: "an aliased import of the claim writer",
    path: `${SESSIONS}/verbs/aliased-link.ts`,
    source:
      'import { claimExternalIdIfUnbound as bindOnce } from "../persistence/users.ts";\nexport async function link(db, userId, externalId) {\n  await bindOnce(db, userId, externalId, 0);\n}\n',
    rules: [CLAIM],
  },
  {
    name: "a namespace bracket read of the claim writer",
    path: `${SESSIONS}/verbs/bracket-link.ts`,
    source:
      'import * as persistence from "../persistence/users.ts";\nexport async function link(db, userId, externalId) {\n  await persistence["claimExternalIdIfUnbound"](db, userId, externalId, 0);\n}\n',
    rules: [CLAIM],
  },
  {
    name: "a wrapper in the persistence file re-exposing a registered writer",
    path: USERS,
    source: `${USERS_IMPORT}import { sql } from "drizzle-orm";\nexport function insertPendingSignupUserStatement(db, row, admission) {\n  return db.insert(users).select(sql\`select \${row.id}, \${row.handle}, \${row.externalId} where \${admission}\`).returning({ id: users.id });\n}\nexport const insertAnyJoin = (db, row, admission) => insertPendingSignupUserStatement(db, row, admission);\n`,
    rules: [HOME],
  },
  {
    name: "a raw positional users insert outside the persistence file",
    path: `${SESSIONS}/verbs/raw-join.ts`,
    source: `${USERS_IMPORT}import { sql } from "drizzle-orm";\nexport const join = (db, id, handle, sub) =>\n  db.insert(users).select(sql\`select \${id}, \${handle}, \${sub}, null, 'user', 1, null, 'human', null, 0, 0\`);\n`,
    rules: [RAW],
  },
  {
    name: "an unregistered positional subject writer in the persistence file",
    path: USERS,
    source: `${USERS_IMPORT}import { sql } from "drizzle-orm";\nexport function insertSsoUserStatement(db, row) {\n  return db.insert(users).select(sql\`select \${row.id}, \${row.handle}, \${row.externalId}, null, 'user', 1, null, 'human', null, 0, 0\`).returning({ id: users.id });\n}\n`,
    rules: [HOME],
  },
  {
    name: "a keyed subject write in the persistence file outside every registered writer",
    path: USERS,
    source: `${USERS_IMPORT}import { eq } from "drizzle-orm";\nexport const rebindSubject = (db, id, sub) => db.update(users).set({ externalId: sub }).where(eq(users.id, id));\n`,
    rules: [HOME],
  },
  {
    name: "a raw SQL insert into users",
    path: `${ADMIN}/raw-insert.ts`,
    source:
      'import { sql } from "drizzle-orm";\nexport const w = (db, id, h, sub) => db.run(sql`insert into users (id, handle, handle_key, external_id) values (${id}, ${h}, ${h}, ${sub})`);\n',
    rules: [RAW],
  },
  {
    name: "a raw SQL update of the interpolated users table",
    path: `${ADMIN}/raw-update.ts`,
    source: `${USERS_IMPORT}import { sql } from "drizzle-orm";\nexport const w = (db, id, sub) => db.run(sql\`update \${users} set external_id = \${sub} where id = \${id}\`);\n`,
    rules: [RAW],
  },
  {
    name: "a sql.raw users update",
    path: `${ADMIN}/raw-string.ts`,
    source: "import { sql } from \"drizzle-orm\";\nexport const w = (db) => db.run(sql.raw(\"update users set external_id = 'x' where id = 'y'\"));\n",
    rules: [RAW],
  },
  {
    name: "a namespace sql tag over a users update",
    path: `${ADMIN}/raw-namespace.ts`,
    source: 'import * as orm from "drizzle-orm";\nexport const w = (db, id, sub) => db.run(orm.sql`update users set external_id = ${sub} where id = ${id}`);\n',
    rules: [RAW],
  },
  {
    name: "a users insert whose data is a variable",
    path: `${ADMIN}/opaque-values.ts`,
    source: `${USERS_IMPORT}export const w = (db, row) => { const r = { ...row, externalId: row.sub }; return db.insert(users).values(r); };\n`,
    rules: [OPAQUE],
  },
  {
    name: "a users upsert whose set is a variable",
    path: `${ADMIN}/opaque-upsert.ts`,
    source: `${USERS_IMPORT}export const w = (db, row) => { const set = { externalId: row.sub }; return db.insert(users).values({ id: row.id }).onConflictDoUpdate({ target: users.id, set }); };\n`,
    rules: [OPAQUE],
  },
  {
    name: "an insertUser row spreading an identity",
    path: `${ADMIN}/spread-insert.ts`,
    source:
      'import { insertUser } from "../../sessions/persistence/users.ts";\nexport const go = (db, identity) => insertUser(db, { id: "u", role: "user", enabled: true, createdAt: 0, updatedAt: 0, ...identity });\n',
    rules: [OPAQUE],
  },
  {
    name: "the bracket assignment of the subject",
    path: `${ADMIN}/bracket-patch.ts`,
    source: 'export function p(changes, sub) {\n  changes["externalId"] = sub;\n}\n',
    rules: [BINDS, OPAQUE],
  },
  {
    name: "a computed subject key under a users write",
    path: `${ADMIN}/computed-key.ts`,
    source: `${USERS_IMPORT}export const w = (db, sub) => db.update(users).set({ ["externalId"]: sub });\n`,
    rules: [BINDS, OPAQUE],
  },
  {
    name: "the admin link capability calling its claim writer",
    path: LINK,
    source: `${CLAIM_IMPORT}export async function linkExternalId(db, userId, externalId) {\n  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n}\n`,
    rules: [],
  },
  {
    name: "the SSO seam's owner-flip bind through the same claim writer",
    path: PROVISION,
    source: `${CLAIM_IMPORT}export async function bindOwnerSubject(db, ownerId, externalId) {\n  return await claimExternalIdIfUnbound(db, ownerId, externalId, 0);\n}\n`,
    rules: [],
  },
  {
    name: "a read column map in the persistence file",
    path: USERS,
    source: `${USERS_IMPORT}export const COLS = { id: users.id, externalId: users.externalId };\nexport const read = (db) => db.select(COLS);\n`,
    rules: [],
  },
  {
    name: "audit metadata naming the subject",
    path: `${ADMIN}/audit-only.ts`,
    source:
      'export async function audit(a, at) {\n  void a;\n  void at;\n}\nexport async function log(externalId) {\n  await audit({ action: "link", metadata: { externalId, idempotent: true } }, 0);\n}\n',
    rules: [],
  },
  {
    name: "an identity claim construction",
    path: `${SERVER_SRC}/infra/auth/modes/forward-header.ts`,
    source: "export const build = (uid) => ({ handle: uid, externalId: uid });\n",
    rules: [],
  },
  {
    name: "a subject equality read",
    path: `${SESSIONS}/substrate/role-policy.ts`,
    source: "export const same = (a, b) => a.externalId === b;\n",
    rules: [],
  },
  {
    name: "the local-user null subject",
    path: `${SESSIONS}/verbs/ensure-user.ts`,
    source:
      'import { insertUser } from "../persistence/users.ts";\nexport async function ensure(db, handle) {\n  await insertUser(db, { handle, externalId: null, role: "user" });\n}\n',
    rules: [],
  },
  {
    name: "the registered caller of the pending-join writer",
    path: PENDING,
    source: `${PENDING_IMPORT}export function account(db, who, admission) {\n  return insertPendingSignupUserStatement(db, { id: who.id, handle: who.handle, externalId: who.externalId, email: null, role: "user", enabled: true, at: 0 }, admission);\n}\n`,
    rules: [],
  },
  {
    name: "the persistence file's registered writers and its null-subject signup",
    path: USERS,
    source:
      `${USERS_IMPORT}import { and, eq, isNull, sql } from "drizzle-orm";\n` +
      "export function insertSignupUserStatement(db, row, admission) {\n  return db.insert(users).select(sql`select ${row.id}, ${row.handle}, null, null, 'user', 1, ${row.passwordHash}, 'human', null, ${row.at}, ${row.at} where ${admission}`).returning({ id: users.id });\n}\n" +
      "export function insertPendingSignupUserStatement(db, row, admission) {\n  return db.insert(users).select(sql`select ${row.id}, ${row.handle}, ${row.externalId}, ${row.email} where changes() > 0 and ${admission}`).returning({ id: users.id });\n}\n" +
      "export function claimExternalIdIfUnbound(db, id, externalId, updatedAt) {\n  return db.update(users).set({ externalId, updatedAt }).where(and(eq(users.id, id), isNull(users.externalId))).returning({ id: users.id });\n}\n",
    rules: [],
  },
  {
    name: "the persistence file's generic insert forwarding its caller's row",
    path: USERS,
    source:
      `${USERS_IMPORT}import { and, eq, isNull } from "drizzle-orm";\n` +
      "export async function insertUser(db, row) {\n  await db.insert(users).values({ ...row, handleKey: k(row.handle) }).onConflictDoNothing();\n}\n" +
      "export function claimExternalIdIfUnbound(db, id, externalId, updatedAt) {\n  return db.update(users).set({ externalId, updatedAt }).where(and(eq(users.id, id), isNull(users.externalId))).returning({ id: users.id });\n}\n",
    rules: [],
  },
  {
    name: "a subject-free users write and a raw users read",
    path: `${ADMIN}/set-role.ts`,
    source: `${USERS_IMPORT}import { eq, sql } from "drizzle-orm";\nexport const w = (db, id, role, at) => db.update(users).set({ role, updatedAt: at }).where(eq(users.id, id));\nexport const count = (db) => db.get(sql\`select count(*) from \${users}\`);\n`,
    rules: [],
  },
  {
    name: "a quoted subject key in the persistence file outside every registered writer",
    path: USERS,
    source: `${USERS_IMPORT}export async function rebindSubjectUnchecked(db, id, sub) {\n  await db.update(users).set({ "externalId": sub, updatedAt: 0 });\n}\n`,
    rules: [HOME],
  },
  {
    name: "a computed subject key in the persistence file outside every registered writer",
    path: USERS,
    source: `${USERS_IMPORT}export const rebind = (db, sub) => db.update(users).set({ ["externalId"]: sub });\n`,
    rules: [HOME],
  },
  {
    name: "a subject patch assignment in the persistence file outside every registered writer",
    path: USERS,
    source: "export function patch(changes, sub) {\n  changes.externalId = sub;\n}\n",
    rules: [HOME],
  },
  {
    name: "a bracket subject patch assignment in the persistence file outside every registered writer",
    path: USERS,
    source: 'export function patch(changes, sub) {\n  changes["externalId"] = sub;\n}\n',
    rules: [HOME],
  },
  {
    name: "a users table cast under a write outside the persistence file",
    path: `${ADMIN}/cast-set.ts`,
    source: `${USERS_IMPORT}export const w = (db, data) => db.update(users as never).set(data);\n`,
    rules: [PLAIN],
  },
  {
    name: "a cast users insert receiver",
    path: `${ADMIN}/cast-values.ts`,
    source: `${USERS_IMPORT}export const w = (db, data) => (db.insert(users) as never).values(data);\n`,
    rules: [PLAIN],
  },
  {
    name: "a cast users table under a positional insert",
    path: `${ADMIN}/cast-positional.ts`,
    source: `${USERS_IMPORT}import { sql } from "drizzle-orm";\nexport const w = (db, sub) => db.insert(users as never).select(sql\`select \${sub}\`);\n`,
    rules: [PLAIN],
  },
  {
    name: "a cast users insert under an upsert",
    path: `${ADMIN}/cast-upsert.ts`,
    source: `${USERS_IMPORT}export const w = (db, set) => (db.insert(users).values({ id: 1 }) as never).onConflictDoUpdate({ target: users.id, set });\n`,
    rules: [PLAIN],
  },
  {
    name: "an optional-chain wrapped users update receiver",
    path: `${ADMIN}/chain-set.ts`,
    source: `${USERS_IMPORT}export const w = (db, data) => (db?.update(users)).set(data);\n`,
    rules: [PLAIN],
  },
  {
    name: "an aliased users table import",
    path: `${ADMIN}/alias-table.ts`,
    source: 'import { users as accounts } from "@orb/db";\nexport const w = (db, sub) => db.update(accounts).set({ role: sub });\n',
    rules: [PLAIN],
  },
  {
    name: "a cast sql tag over a users update",
    path: `${ADMIN}/cast-tag.ts`,
    source: 'import { sql } from "drizzle-orm";\nexport const w = (db, sub) => db.run((sql as typeof sql)`update users set external_id = ${sub}`);\n',
    rules: [RAW],
  },
  {
    name: "a const users update read by sql.raw",
    path: `${ADMIN}/raw-const.ts`,
    source: 'import { sql } from "drizzle-orm";\nconst UPDATE = "update users set external_id = \'x\'";\nexport const w = (db) => db.run(sql.raw(UPDATE));\n',
    rules: [RAW],
  },
  {
    name: "a subject-free optional-chain users write",
    path: `${ADMIN}/chain-role.ts`,
    source: `${USERS_IMPORT}export const w = (db, role) => db?.update(users).set({ role });\n`,
    rules: [],
  },
  {
    name: "an imported constant key under a users write in the persistence file outside every registered writer",
    path: USERS,
    source: `${USERS_IMPORT}${COLUMN_IMPORT}export const rebind = (db, sub) => db.update(users).set({ [SUBJECT_COLUMN]: sub });\n`,
    rules: [HOME],
  },
  {
    name: "an imported constant key under a users write",
    path: `${ADMIN}/dynamic-key.ts`,
    source: `${USERS_IMPORT}${COLUMN_IMPORT}export const w = (db, sub) => db.update(users).set({ [SUBJECT_COLUMN]: sub });\n`,
    rules: [OPAQUE],
  },
  {
    name: "an imported constant key under a persistence verb patch",
    path: `${ADMIN}/dynamic-patch.ts`,
    source: `import { updateUser } from "../../sessions/persistence/users.ts";\n${COLUMN_IMPORT}export const w = (db, id, sub) => updateUser(db, id, { [SUBJECT_COLUMN]: sub });\n`,
    rules: [OPAQUE],
  },
  {
    name: "a constant-named update verb on the users table",
    path: `${ADMIN}/dynamic-update.ts`,
    source: `${USERS_IMPORT}${VERB_IMPORT}export const w = (db, data) => db[UPDATE](users).set(data);\n`,
    rules: [PLAIN],
  },
  {
    name: "a constant-named set on a users update",
    path: `${ADMIN}/dynamic-set.ts`,
    source: `${USERS_IMPORT}${VERB_IMPORT}export const w = (db, data) => db.update(users)[SET](data);\n`,
    rules: [PLAIN],
  },
  {
    name: "a constant-named select on a users insert",
    path: `${ADMIN}/dynamic-select.ts`,
    source: `${USERS_IMPORT}${VERB_IMPORT}import { sql } from "drizzle-orm";\nexport const w = (db, sub) => db.insert(users)[SELECT](sql\`select \${sub}\`);\n`,
    rules: [PLAIN],
  },
  {
    name: "a constant-named upsert on a users insert",
    path: `${ADMIN}/dynamic-upsert.ts`,
    source: `${USERS_IMPORT}${VERB_IMPORT}export const w = (db, set) => db.insert(users).values({ id: 1 })[UPSERT]({ target: users.id, set });\n`,
    rules: [PLAIN],
  },
];

// D257 cases: a users write that sets handle without its key, in each spelling the rule reads.
const HANDLE_KEY_ROWS: readonly Row[] = [
  {
    name: "a rename without the key",
    path: `${SERVER_SRC}/entry/boot/seed-owner.ts`,
    source: `${USERS_IMPORT}import { eq } from "drizzle-orm";\nexport const rename = (db, id, handle, at) => db.update(users).set({ handle, updatedAt: at }).where(eq(users.id, id));\n`,
    rules: [HANDLE_KEY],
  },
  {
    name: "the bracket and quoted-key rename",
    path: `${ADMIN}/rename.ts`,
    source: `${USERS_IMPORT}import { eq } from "drizzle-orm";\nexport const rename = (db, id, next) => db["update"](users)["set"]({ "handle": next }).where(eq(users.id, id));\n`,
    rules: [HANDLE_KEY],
  },
  {
    name: "an insert without the key in the persistence file",
    path: USERS,
    source: `${USERS_IMPORT}export const mint = (db, id, handle, at) => db.insert(users).values({ id, handle, role: "user", createdAt: at, updatedAt: at });\n`,
    rules: [HANDLE_KEY],
  },
  {
    name: "an insert writing the key beside the handle",
    path: USERS,
    source: `import { handleKey } from "@orb/kit/handle-key";\n${USERS_IMPORT}export const mint = (db, id, handle, at) => db.insert(users).values({ id, handle, handleKey: handleKey(handle), createdAt: at, updatedAt: at });\n`,
    rules: [],
  },
  {
    name: "a rename through the key-deriving persistence verb",
    path: `${SESSIONS}/verbs/rename.ts`,
    source:
      'import { updateUser } from "../persistence/users.ts";\nexport const rename = (db, id, handle, at) => updateUser(db, id, { handle, updatedAt: at });\n',
    rules: [],
  },
  {
    name: "a handle column on another table",
    path: `${SERVER_SRC}/domain/character/verbs/rename.ts`,
    source:
      'import { characters } from "@orb/db";\nimport { eq } from "drizzle-orm";\nexport const rename = (db, id, handle) => db.update(characters).set({ handle }).where(eq(characters.id, id));\n',
    rules: [],
  },
  {
    name: "an upsert set renaming without the key",
    path: `${ADMIN}/upsert-rename.ts`,
    source: `${USERS_IMPORT}export const w = (db, id, handle, k) => db.insert(users).values({ id, handle, handleKey: k }).onConflictDoUpdate({ target: users.id, set: { handle } });\n`,
    rules: [HANDLE_KEY],
  },
  {
    name: "an upsert whose cast config renames without the key in the persistence file",
    path: USERS,
    source: `${USERS_IMPORT}export const w = (db, id, handle, k) => db.insert(users).values({ id, handle, handleKey: k }).onConflictDoUpdate({ target: users.id, set: { handle } } as never);\n`,
    rules: [HANDLE_KEY],
  },
  {
    name: "a rename through a cast users table",
    path: `${ADMIN}/cast-rename.ts`,
    source: `${USERS_IMPORT}import { eq } from "drizzle-orm";\nexport const rename = (db, id, handle, at) => db.update(users as typeof users).set({ handle, updatedAt: at }).where(eq(users.id, id));\n`,
    rules: [PLAIN],
  },
  {
    name: "a rename through a cast users update receiver",
    path: USERS,
    source: `${USERS_IMPORT}export const rename = (db, handle) => (db.update(users) as never).set({ handle });\n`,
    rules: [PLAIN],
  },
  {
    name: "a rename through a non-null users table",
    path: USERS,
    source: `${USERS_IMPORT}export const rename = (db, handle) => db.update(users!).set({ handle });\n`,
    rules: [PLAIN],
  },
  {
    name: "a rename whose literal data is cast",
    path: USERS,
    source: `${USERS_IMPORT}export const rename = (db, handle) => db.update(users).set({ handle } as never);\n`,
    rules: [HANDLE_KEY],
  },
  {
    name: "a rename through a constant-named update verb",
    path: `${ADMIN}/dynamic-rename.ts`,
    source: `${USERS_IMPORT}${VERB_IMPORT}export const rename = (db, handle) => db[UPDATE](users).set({ handle });\n`,
    rules: [PLAIN],
  },
];

function hardLinter(repoRoot: string): ESLint {
  return new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, HARD_CONFIG), allowInlineConfig: false });
}

async function firedRules(eslint: ESLint, repoRoot: string, row: Pick<Row, "path" | "source">): Promise<readonly string[]> {
  const [result] = await eslint.lintText(row.source, { filePath: join(repoRoot, row.path) });
  expect(result?.fatalErrorCount, row.path).toBe(0);
  return [...new Set(result?.messages.map(({ ruleId }) => ruleId ?? "fatal"))].toSorted();
}

test.for([...SUBJECT_ROWS, ...HANDLE_KEY_ROWS])("hard identity writers: $name", { timeout: scaledBudget(30_000) }, async (row, { repoRoot }) => {
  expect(await firedRules(hardLinter(repoRoot), repoRoot, row)).toEqual(row.rules.toSorted());
});

test("an inline directive cannot excuse a third subject writer", { timeout: scaledBudget(30_000) }, async ({ repoRoot }) => {
  const source = `/* eslint-disable -- Attempted hard bypass. */\n${CLAIM_IMPORT}// eslint-disable-next-line ${CLAIM} -- Attempted hard bypass.\nexport const bind = (db, id, sub) => claimExternalIdIfUnbound(db, id, sub, 0);\n`;
  expect(await firedRules(hardLinter(repoRoot), repoRoot, { path: `${SESSIONS}/verbs/bypass.ts`, source })).toEqual([CLAIM]);
});

test("the live server tree is clean and each exemption is exactly its census", { timeout: scaledBudget(120_000) }, async ({ repoRoot }) => {
  const eslint = hardLinter(repoRoot);
  const sources = readdirSync(join(repoRoot, SERVER_SRC), { recursive: true, encoding: "utf8" })
    .filter((path) => /\.tsx?$/u.test(path))
    .map((path) => `${SERVER_SRC}/${path}`);
  expect(sources).toContain(USERS);
  const exempt = new Map<string, string[]>(Object.keys(EXEMPT).map((rule) => [rule, []]));
  for (const path of sources) {
    const config = await eslint.calculateConfigForFile(join(repoRoot, path));
    for (const [rule, paths] of exempt) {
      if (config?.rules?.[rule] === undefined) {
        paths.push(path);
      }
    }
  }
  expect(Object.fromEntries([...exempt].map(([rule, paths]) => [rule, paths.toSorted()]))).toEqual(
    Object.fromEntries(Object.entries(EXEMPT).map(([rule, paths]) => [rule, paths.toSorted()])),
  );
  const identityRules = new Set(IDENTITY_RULES);
  const scoped = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: join(repoRoot, HARD_CONFIG),
    allowInlineConfig: false,
    ruleFilter: ({ ruleId }) => identityRules.has(ruleId),
  });
  const results = await scoped.lintFiles(sources.map((path) => join(repoRoot, path)));
  expect(results.flatMap(({ filePath, messages }) => messages.map(({ ruleId, line }) => `${filePath}:${line}: ${ruleId ?? "fatal"}`))).toEqual([]);
});

// A sanctioned file that stops binding, or a registered caller that stops calling its writer, leaves a dead exemption.
async function earnedProblems(repoRoot: string, files: ReadonlyMap<string, string>): Promise<readonly string[]> {
  const hard = await hardLinter(repoRoot).calculateConfigForFile(join(repoRoot, USERS));
  const judge = (rules: Linter.RulesRecord): ESLint =>
    new ESLint({
      cwd: repoRoot,
      overrideConfigFile: true,
      allowInlineConfig: false,
      overrideConfig: [{ files: ["**/*.ts"], plugins: hard.plugins, languageOptions: hard.languageOptions, rules }],
    });
  const findings = async (eslint: ESLint, path: string): Promise<number | undefined> => {
    const source = files.get(path);
    if (source === undefined) {
      return;
    }
    const [result] = await eslint.lintText(source, { filePath: join(repoRoot, path) });
    expect(result?.fatalErrorCount, path).toBe(0);
    return result?.messages.length;
  };
  const problems: string[] = [];
  const binds = judge({ [BINDS]: "error" });
  for (const path of SUBJECT_BINDERS) {
    if (((await findings(binds, path)) ?? 0) === 0) {
      problems.push(`${path} no longer binds a subject`);
    }
  }
  for (const [writer, callers] of Object.entries(WRITER_CALLERS)) {
    const calls = judge({
      "no-restricted-syntax": [
        "error",
        {
          selector: `CallExpression:matches([callee.type='Identifier'][callee.name='${writer}'], [callee.type='MemberExpression'][callee.property.name='${writer}'])`,
        },
      ],
    });
    for (const caller of callers) {
      if (((await findings(calls, caller)) ?? 0) === 0) {
        problems.push(`${caller} no longer calls ${writer}`);
      }
    }
  }
  return problems;
}

const USERS_WRITER_FIXTURE = `${USERS_IMPORT}export const claimExternalIdIfUnbound = (db, id, sub) => db.update(users).set({ externalId: sub });\n`;
const PROVISION_FIXTURE = `${CLAIM_IMPORT}export async function bindOwnerSubject(db, ownerId, externalId) {\n  const changes = {};\n  changes.externalId = externalId;\n  return await claimExternalIdIfUnbound(db, ownerId, externalId, 0);\n}\n`;
const LINK_FIXTURE = `${CLAIM_IMPORT}export async function linkExternalId(db, userId, externalId) {\n  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n}\n`;
const PENDING_FIXTURE = `${PENDING_IMPORT}export function account(db, row, admission) {\n  return insertPendingSignupUserStatement(db, row, admission);\n}\n`;
const HEALTHY: Readonly<Record<string, string>> = {
  [PROVISION]: PROVISION_FIXTURE,
  [USERS]: USERS_WRITER_FIXTURE,
  [LINK]: LINK_FIXTURE,
  [PENDING]: PENDING_FIXTURE,
};

const EARNED_ROWS: readonly { readonly name: string; readonly files: Readonly<Record<string, string | undefined>>; readonly problems: readonly string[] }[] = [
  {
    name: "provision-identity.ts stops binding and keeps only the claim call",
    files: {
      [PROVISION]: `${CLAIM_IMPORT}export async function bindOwnerSubject(db, ownerId, externalId) {\n  return await claimExternalIdIfUnbound(db, ownerId, externalId, 0);\n}\n`,
    },
    problems: [`${PROVISION} no longer binds a subject`],
  },
  {
    name: "link-external-id.ts stops calling the claim writer",
    files: { [LINK]: "export async function linkExternalId() {}\n" },
    problems: [`${LINK} no longer calls ${CLAIM_WRITER}`],
  },
  {
    name: "link-external-id.ts is deleted",
    files: { [LINK]: undefined },
    problems: [`${LINK} no longer calls ${CLAIM_WRITER}`],
  },
  {
    name: "provision-identity.ts still builds its patch but its owner-flip bind leaves the claim",
    files: { [PROVISION]: "export async function bindOwnerSubject(changes, externalId) {\n  changes.externalId = externalId;\n}\n" },
    problems: [`${PROVISION} no longer calls ${CLAIM_WRITER}`],
  },
  {
    name: "pending-signup.ts stops calling the pending-join writer",
    files: { [PENDING]: "export function preparePendingSignup() {\n  return null;\n}\n" },
    problems: [`${PENDING} no longer calls ${PENDING_JOIN_WRITER}`],
  },
  { name: "the healthy shape", files: {}, problems: [] },
  {
    name: "a read column map beside the real write",
    files: { [USERS]: `${USERS_WRITER_FIXTURE}export const read = (db) => db.select({ id: 1, externalId: 2 });\n` },
    problems: [],
  },
  {
    name: "link-external-id.ts still imports the claim writer but no longer calls it",
    files: { [LINK]: `${CLAIM_IMPORT}export const linkExternalId = () => claimExternalIdIfUnbound;\n` },
    problems: [`${LINK} no longer calls ${CLAIM_WRITER}`],
  },
  {
    name: "the persistence file keeps a read map and an opaque write but binds no subject",
    files: {
      [USERS]: `${USERS_IMPORT}export const COLS = { externalId: users.externalId };\nexport async function updateUser(db, id, patch) {\n  await db.update(users).set(patch);\n}\n`,
    },
    problems: [`${USERS} no longer binds a subject`],
  },
];

test.for(EARNED_ROWS)("earned identity exemptions: $name", { timeout: scaledBudget(30_000) }, async (row, { repoRoot }) => {
  const files = new Map(Object.entries({ ...HEALTHY, ...row.files }).filter((entry): entry is [string, string] => entry[1] !== undefined));
  expect(await earnedProblems(repoRoot, files)).toEqual(row.problems);
});

test("each live exempt file still holds the bind or call its exemption excuses", { timeout: scaledBudget(30_000) }, async ({ repoRoot }) => {
  const paths = [...new Set([...SUBJECT_BINDERS, ...Object.values(WRITER_CALLERS).flat()])];
  expect(await earnedProblems(repoRoot, new Map(paths.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])))).toEqual([]);
});
