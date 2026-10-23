// Invariant 10 subject writers and D257 handle keys use the configured native ESLint rules.

import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";

import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { scaledBudget } from "./_load-budget.ts";

const SERVER_SRC = "packages/server/src";
const SESSIONS = `${SERVER_SRC}/domain/sessions`;
const USERS = `${SESSIONS}/persistence/users.ts`;
const LINK = `${SESSIONS}/verbs/link-external-id.ts`;
const PROVISION = `${SESSIONS}/verbs/provision-identity.ts`;
const PENDING = `${SESSIONS}/verbs/pending-signup.ts`;
const CLAIM = "orb/external-id-claim-writer-callers";
const PENDING_JOIN = "orb/external-id-pending-join-writer-callers";
const HOME = "orb/external-id-writer-home";
const BINDS = "orb/external-id-subject-binds";
const OPAQUE = "orb/external-id-opaque-users-writes";
const RAW = "orb/external-id-raw-users-writes";
const PLAIN = "orb/users-write-plain-spelling";
const HANDLE_KEY = "orb/handle-key-writer";
const IDENTITY_RULES = [CLAIM, PENDING_JOIN, HOME, BINDS, OPAQUE, RAW, PLAIN, HANDLE_KEY];

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
      // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
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
    // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
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
      // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
      "export function insertSignupUserStatement(db, row, admission) {\n  return db.insert(users).select(sql`select ${row.id}, ${row.handle}, null, null, 'user', 1, ${row.passwordHash}, 'human', null, ${row.at}, ${row.at} where ${admission}`).returning({ id: users.id });\n}\n" +
      // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
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
    // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
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

test.for([...SUBJECT_ROWS, ...HANDLE_KEY_ROWS])("identity writers: $name", { timeout: scaledBudget(30_000) }, async (row, { repoRoot }) => {
  const config = await new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot }).calculateConfigForFile(join(repoRoot, row.path));
  const messages = new Linter({ cwd: repoRoot }).verify(
    row.source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      rules: Object.fromEntries(IDENTITY_RULES.map((rule) => [rule, config.rules[rule] ?? "off"])),
    },
    { filename: join(repoRoot, row.path) },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    row.source,
  ).toEqual([]);
  expect([...new Set(messages.map(({ ruleId }) => ruleId))].toSorted((left, right) => String(left).localeCompare(String(right)))).toEqual(row.rules.toSorted());
});
