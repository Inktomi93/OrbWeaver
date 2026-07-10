// users.int — the identity-root users slice against a real libSQL :memory: db (FK enforcement ON via
// createDb). Covers: the role CHECK (off-enum rejected) + the test-mirror that the db column DERIVES
// USER_ROLES (db === contracts), the role default, the handle UNIQUE, the externalId UNIQUE-when-set
// partial index (multiple nulls coexist, equal non-nulls collide), and the epoch-ms NUMBER timestamps.

import { USER_KINDS, USER_ROLES } from "@orb/contracts/identity";
import { isConstraintViolation, users } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

// The default global role a freshly-provisioned user lands on (owner/admin are granted explicitly — D17).
const DEFAULT_ROLE = "user";

test("the users_role_check CHECK rejects an off-enum role", async () => {
  const db = await freshDb();

  // A `string`-typed value downcast to the enum union forces an invalid value at the SQL boundary
  // (a bare string-literal `as` would trip TS2352 — the literal doesn't overlap the union).
  const invalidRole: string = "nope";

  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_bad_role"),
      handle: castId<Handle>("user_bad_role"),
      role: invalidRole as (typeof USER_ROLES)[number],
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("test-mirror: the users.role column derives the canonical USER_ROLES tuple", () => {
  // Pins db === contracts: the schema enum is built FROM the contracts tuple, never re-spelled.
  expect([...users.role.enumValues]).toEqual([...USER_ROLES]);
});

test("a user round-trips with the default role and epoch-ms NUMBER timestamps", async () => {
  const db = await freshDb();
  const id = castId<UserId>("user_defaults");

  await db.insert(users).values({ id, handle: castId<Handle>("user_defaults") });

  const rows = await db.select().from(users).where(eq(users.id, id));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  // The role defaults (it is never spelled at insert time here).
  expect(row?.role).toBe(DEFAULT_ROLE);
  // externalId is null on the owner-fallback / single-user path.
  expect(row?.externalId).toBeNull();
  // Timestamps are plain integer epoch-ms NUMBERS — never Date instances.
  expect(row?.createdAt).toBeTypeOf("number");
  expect(row?.updatedAt).toBeTypeOf("number");
});

test("the handle UNIQUE index rejects a duplicate handle", async () => {
  const db = await freshDb();
  const handle = castId<Handle>("dup_handle");
  await db.insert(users).values({ id: castId<UserId>("user_handle_a"), handle });

  let caught: unknown;
  try {
    await db.insert(users).values({ id: castId<UserId>("user_handle_b"), handle });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("the externalId UNIQUE-when-set partial index lets multiple null externalIds coexist", async () => {
  const db = await freshDb();

  // SQLite's UNIQUE ignores NULL rows (reinforced by the partial `where externalId is not null`), so
  // many SSO-less users coexist.
  await db.insert(users).values([
    { id: castId<UserId>("user_null_ext_a"), handle: castId<Handle>("user_null_ext_a") },
    { id: castId<UserId>("user_null_ext_b"), handle: castId<Handle>("user_null_ext_b") },
  ]);

  const rows = await db.select().from(users);
  expect(rows).toHaveLength(2);
});

test("the externalId UNIQUE-when-set partial index rejects two equal non-null externalIds", async () => {
  const db = await freshDb();
  const externalId = castId<ExternalId>("sso_subject_one");
  await db.insert(users).values({
    id: castId<UserId>("user_ext_a"),
    handle: castId<Handle>("user_ext_a"),
    externalId,
  });

  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_ext_b"),
      handle: castId<Handle>("user_ext_b"),
      externalId,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

// ── D17/D40 "exactly one owner" — the users_single_owner_unique partial index ──
// The `Principal`/D17 invariant "exactly one owner" needed its DDL enforcer (D40 tracked it open). A partial
// unique over `role` scoped to owner rows makes a second owner unrepresentable; non-owner roles are ignored
// by the WHERE (SQLite skips them), so admin/user are unconstrained.

test("the users_single_owner_unique partial index rejects a second owner row", async () => {
  const db = await freshDb();
  await db.insert(users).values({
    id: castId<UserId>("user_owner_a"),
    handle: castId<Handle>("owner_a"),
    role: "owner",
  });

  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_owner_b"),
      handle: castId<Handle>("owner_b"),
      role: "owner",
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("the single-owner index leaves non-owner roles unconstrained (many admins + users coexist)", async () => {
  const db = await freshDb();
  await db.insert(users).values([
    { id: castId<UserId>("user_owner_solo"), handle: castId<Handle>("owner_solo"), role: "owner" },
    { id: castId<UserId>("user_admin_a"), handle: castId<Handle>("admin_a"), role: "admin" },
    { id: castId<UserId>("user_admin_b"), handle: castId<Handle>("admin_b"), role: "admin" },
    { id: castId<UserId>("user_plain_a"), handle: castId<Handle>("plain_a"), role: "user" },
    { id: castId<UserId>("user_plain_b"), handle: castId<Handle>("plain_b"), role: "user" },
  ]);

  const rows = await db.select().from(users);
  expect(rows).toHaveLength(5);
});

// ── D60 agent principals (agent-principal-design/01 §1): kind + ownerUserId + the three shape CHECKs ──
// The DDL is the FIRST wall of the structural no-login guarantee — an agent is loginless / unprivileged /
// owned as PHYSICS, not prose. These pin every arm (the sessions belts back the same guarantees at the app tier).

test("test-mirror: the users.kind column derives the canonical USER_KINDS tuple", () => {
  expect([...users.kind.enumValues]).toEqual([...USER_KINDS]);
});

test("kind defaults to 'human' and a human carries no owner link", async () => {
  const db = await freshDb();
  const id = castId<UserId>("user_kind_default");
  await db.insert(users).values({ id, handle: castId<Handle>("user_kind_default") });
  const row = (await db.select().from(users).where(eq(users.id, id)))[0];
  expect(row?.kind).toBe("human");
  expect(row?.ownerUserId).toBeNull();
});

// Seed a human owner (the `ownerUserId` FK target for an agent row).
async function seedOwner(db: Awaited<ReturnType<typeof freshDb>>): Promise<UserId> {
  const ownerId = castId<UserId>("user_agent_owner");
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>("agent_owner") });
  return ownerId;
}

test("a valid agent principal inserts: role='user', no password, no externalId, owned", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db);
  const agentId = castId<UserId>("user_agent_ok");
  await db.insert(users).values({
    id: agentId,
    handle: castId<Handle>("__agent__buddy__user_agent_owner"),
    role: "user",
    kind: "agent",
    ownerUserId: ownerId,
  });
  const row = (await db.select().from(users).where(eq(users.id, agentId)))[0];
  expect(row?.kind).toBe("agent");
  expect(row?.ownerUserId).toBe(ownerId);
  expect(row?.passwordHash).toBeNull();
  expect(row?.externalId).toBeNull();
});

test("users_agent_shape rejects an agent with a privileged role", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db);
  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_agent_role"),
      handle: castId<Handle>("agent_role"),
      role: "admin",
      kind: "agent",
      ownerUserId: ownerId,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("users_agent_shape rejects an agent carrying a passwordHash (loginless)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db);
  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_agent_pw"),
      handle: castId<Handle>("agent_pw"),
      role: "user",
      kind: "agent",
      ownerUserId: ownerId,
      passwordHash: "scrypt$deadbeef",
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("users_agent_shape rejects an agent carrying an externalId (no SSO subject)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db);
  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_agent_ext"),
      handle: castId<Handle>("agent_ext"),
      role: "user",
      kind: "agent",
      ownerUserId: ownerId,
      externalId: castId<ExternalId>("sso_agent"),
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("users_agent_shape rejects an agent with a null owner (agents are always owned)", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_agent_noowner"),
      handle: castId<Handle>("agent_noowner"),
      role: "user",
      kind: "agent",
      ownerUserId: null,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("users_human_shape rejects a human carrying an owner link", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db);
  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_human_owned"),
      handle: castId<Handle>("human_owned"),
      kind: "human",
      ownerUserId: ownerId,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("owner hard-delete CASCADEs the agent users row (referential physics, no orphan)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db);
  const agentId = castId<UserId>("user_agent_cascade");
  await db.insert(users).values({
    id: agentId,
    handle: castId<Handle>("__agent__buddy__cascade"),
    role: "user",
    kind: "agent",
    ownerUserId: ownerId,
  });
  await db.delete(users).where(eq(users.id, ownerId));
  const remaining = await db.select().from(users).where(eq(users.id, agentId));
  expect(remaining).toHaveLength(0);
});
