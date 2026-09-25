// entry/boot/seed-owner — the privileged boot owner backfill. Real libSQL :memory: (the .int lane). Covers:
// a non-owner row at an OWNER handle is flipped to role=owner; the returned ids match; idempotent (a second
// run on a healthy owner+enabled row changes 0 rows and does NOT re-stamp updated_at); a DISABLED already-owner
// row is re-enabled at boot (the widened `or(ne(role,'owner'), enabled=false)` heal); a row whose handle is
// NOT in OWNER_HANDLES is left untouched. `ensureUser` is stubbed to the row the test seeded (its JIT-create
// mechanics are tested in domain/sessions — this isolates the backfill).
//
// The AUTH_MODE=local password-seed block below runs against the REAL sessions service (real ensureUser +
// real scrypt hasher over one pepper): a fresh local owner is FORM-loginable via the real `authenticate`
// verb; a re-boot never clobbers a subsequently-rotated password; and without the password deps (single-user
// / SSO) no hash is ever written.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import { users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createSessionsService } from "@orb/server/domain/sessions";
import { createLocalLightUserSeed, seedOwner } from "@orb/server/entry/boot";
import { createPasswordHasher } from "@orb/server/infra/auth";
import { eq } from "drizzle-orm";
import { afterEach, vi } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ID = castId<UserId>("u_owner");
const OTHER_ID = castId<UserId>("u_other");
// The stubbed-sessions cases never move the seed key, so a rename reaching the stub is a test defect.
const RENAME_NOT_REACHED = (): Promise<void> => Promise.reject(new Error("renameUserHandle is not reached by this case"));

// ≥32 chars — the SESSION_SECRET pepper floor (mirrors the sessions harness).
const PEPPER = "test-session-secret-at-least-32-chars-long";
const INITIAL_PASSWORD = "correct horse battery";

/** The moved-seed-key refusal's tell — the message must name WHY it refused, not just fail. */
const HANDLE_TAKEN_REFUSAL = /already held by another user/;

afterEach(() => {
  vi.unstubAllEnvs();
});

test("backfills a non-owner OWNER-handle row to role=owner + returns its id", async ({ clock }) => {
  const db = await freshDb();
  await db.insert(users).values({ id: OWNER_ID, handle: castId<Handle>("owner"), handleKey: handleKey(castId<Handle>("owner")), role: "user" });

  const ids = await seedOwner({
    db,
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID), renameUserHandle: RENAME_NOT_REACHED },
    ownerHandles: ["owner"],
    now: clock.now,
  });

  expect(ids).toEqual([OWNER_ID]);
  const [row] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  expect(row?.role).toBe("owner");
});

test("idempotent — a second run keeps role=owner and does not re-stamp updated_at", async ({ clock }) => {
  const db = await freshDb();
  await db.insert(users).values({ id: OWNER_ID, handle: castId<Handle>("owner"), handleKey: handleKey(castId<Handle>("owner")), role: "user", updatedAt: 1 });

  await seedOwner({
    db,
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID), renameUserHandle: RENAME_NOT_REACHED },
    ownerHandles: ["owner"],
    now: clock.now,
  });
  const [afterFirst] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  const stampedAt = afterFirst?.updatedAt;
  expect(afterFirst?.role).toBe("owner");

  clock.advance(10_000);
  await seedOwner({
    db,
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID), renameUserHandle: RENAME_NOT_REACHED },
    ownerHandles: ["owner"],
    now: clock.now,
  });
  const [afterSecond] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  expect(afterSecond?.role).toBe("owner");
  // The ne(role,'owner') guard matched 0 rows on the second run → updated_at is unchanged.
  expect(afterSecond?.updatedAt).toBe(stampedAt);
});

// Boot invariant: the owner row is always enabled. A raw-write `enabled=0` on the owner bricks the box
// (every request 401s and admin.setEnabled refuses the owner row), so a reboot must self-heal it. RED-first:
// the pre-fix `ne(role,'owner')` WHERE excluded an already-owner row, so `enabled` stayed 0.
test("re-enables a DISABLED already-owner row at boot (raw-write brick recovery)", async ({ clock }) => {
  const db = await freshDb();
  await db
    .insert(users)
    .values({ id: OWNER_ID, handle: castId<Handle>("owner"), handleKey: handleKey(castId<Handle>("owner")), role: "owner", enabled: false });

  await seedOwner({
    db,
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID), renameUserHandle: RENAME_NOT_REACHED },
    ownerHandles: ["owner"],
    now: clock.now,
  });

  const [row] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  expect(row?.role).toBe("owner");
  expect(row?.enabled).toBe(true);
});

test("refuses a multi-handle owner set — fail-fast, not a UNIQUE loop (D17: exactly one owner)", async ({ clock }) => {
  const db = await freshDb();
  await expect(
    seedOwner({
      db,
      sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID), renameUserHandle: RENAME_NOT_REACHED },
      ownerHandles: ["alice", "bob"],
      now: clock.now,
    }),
  ).rejects.toThrow("EXACTLY ONE owner");
});

test("leaves a non-OWNER-handle row untouched (stays role=user)", async ({ clock }) => {
  const db = await freshDb();
  await db.insert(users).values({ id: OTHER_ID, handle: castId<Handle>("someone"), handleKey: handleKey(castId<Handle>("someone")), role: "user" });

  await seedOwner({
    db,
    // ensureUser would JIT-create the owner row in production; here the test only cares the OTHER row is left alone.
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID), renameUserHandle: RENAME_NOT_REACHED },
    ownerHandles: ["owner"],
    now: clock.now,
  });

  const [row] = await db.select().from(users).where(eq(users.id, OTHER_ID));
  expect(row?.role).toBe("user");
});

test("AUTH_MODE=local: a fresh owner is form-loginable via the real authenticate path", async ({ clock }) => {
  const db = await freshDb();
  // Real sessions service = real ensureUser (JIT-create) + real scrypt verify over the same pepper.
  const sessions = createSessionsService({
    db,
    now: clock.now,
    sessionSecret: PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now: clock.now, onEmbedSpaceBound: () => undefined }),
  });

  const [ownerId] = await seedOwner({
    db,
    sessions,
    ownerHandles: ["owner"],
    now: clock.now,
    initialPassword: INITIAL_PASSWORD,
    hashPassword: createPasswordHasher(PEPPER).hash,
  });

  // The row now carries a real scrypt$ hash (never the cleartext).
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.handle, castId<Handle>("owner")));
  expect(row?.role).toBe("owner");
  expect(row?.passwordHash?.startsWith("scrypt$")).toBe(true);
  expect(row?.passwordHash).not.toContain(INITIAL_PASSWORD);

  // The real login path accepts the seeded password and rejects a wrong one.
  expect(await sessions.authenticate(castId<Handle>("owner"), INITIAL_PASSWORD)).toBe(ownerId);
  expect(await sessions.authenticate(castId<Handle>("owner"), "not the password")).toBeNull();
});

test("re-boot does NOT clobber a subsequently-rotated owner password", async ({ clock }) => {
  const db = await freshDb();
  const sessions = createSessionsService({
    db,
    now: clock.now,
    sessionSecret: PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now: clock.now, onEmbedSpaceBound: () => undefined }),
  });
  const hasher = createPasswordHasher(PEPPER);

  await seedOwner({
    db,
    sessions,
    ownerHandles: ["owner"],
    now: clock.now,
    initialPassword: INITIAL_PASSWORD,
    hashPassword: hasher.hash,
  });

  // The owner rotates their password after first login (a distinct hash lands on the row).
  const rotatedPassword = "a different pass phrase";
  const rotatedHash = await hasher.hash(rotatedPassword);
  await db
    .update(users)
    .set({ passwordHash: rotatedHash })
    .where(eq(users.handle, castId<Handle>("owner")));

  // A restart with LOCAL_INITIAL_PASSWORD still set must leave the rotated hash untouched.
  clock.advance(10_000);
  await seedOwner({
    db,
    sessions,
    ownerHandles: ["owner"],
    now: clock.now,
    initialPassword: INITIAL_PASSWORD,
    hashPassword: hasher.hash,
  });

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.handle, castId<Handle>("owner")));
  expect(row?.passwordHash).toBe(rotatedHash);
  // The env value no longer logs in; the rotated password does.
  expect(await sessions.authenticate(castId<Handle>("owner"), INITIAL_PASSWORD)).toBeNull();
  expect(await sessions.authenticate(castId<Handle>("owner"), rotatedPassword)).not.toBeNull();
});

// THE OIDC OWNER-ADOPTION CASCADE, end to end (boot → adopt → re-login → re-boot). Every hop below shipped
// with its own local test; the DEFECT lived only in their composition:
//   boot 1 seeds the owner at the OWNER_HANDLES key → the OIDC login ADOPTS that row (binds externalId, keeps
//   the handle) → the SECOND login resolves by externalId into the owner-exemption branch, whose
//   `updateExisting` RENAMED the row to the IdP handle → boot 2's `ensureUser("owner")` found nothing, its
//   insert collided with `users_single_owner_unique`, `onConflictDoNothing` swallowed it, the re-read by
//   handle missed, and `ensureUser` returned the id it had MINTED. `seedOwner` handed that PHANTOM id to
//   `createServices` and to the boot Principal, which `principalFromRow` degrades to `role:"user"` on a
//   missing row — so every owner-scoped seed (characters/persona/demo-chats/CAS schedules) ran against a
//   non-existent, non-owner principal.
test("the ADOPTED OIDC owner survives a re-boot: same owner id, same row, no phantom", async ({ clock }) => {
  const db = await freshDb();
  const sessions = createSessionsService({
    db,
    now: clock.now,
    sessionSecret: PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now: clock.now, onEmbedSpaceBound: () => undefined }),
  });
  vi.stubEnv("OWNER_HANDLES", "owner");

  const firstBootOwner = (await seedOwner({ db, sessions, ownerHandles: ["owner"], now: clock.now }))[0];
  if (firstBootOwner === undefined) {
    throw new Error("boot 1: seedOwner returned no owner id");
  }

  // The owner flips the box to OIDC and signs in TWICE under a different IdP handle (adopt, then re-login).
  vi.stubEnv("OWNER_GROUP", "owners");
  const oidc: ResolvedIdentity = {
    externalId: castId<ExternalId>("authentik|alex"),
    handle: castId<Handle>("alex"),
    groups: ["owners"],
    email: null,
  };
  await sessions.provisionIdentity(oidc, { ownerClaimProven: true });
  await sessions.provisionIdentity(oidc, { ownerClaimProven: true });

  const secondBootOwner = (await seedOwner({ db, sessions, ownerHandles: ["owner"], now: clock.now }))[0];
  if (secondBootOwner === undefined) {
    throw new Error("boot 2: seedOwner returned no owner id");
  }
  expect(secondBootOwner).toBe(firstBootOwner);

  // Rows unchanged: ONE user, still keyed on the OWNER_HANDLES handle, still owner, subject still bound.
  const rows = await db.select().from(users);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.handle).toBe("owner");
  expect(rows[0]?.role).toBe("owner");
  expect(rows[0]?.externalId).toBe("authentik|alex");

  // The id names a REAL row — so the boot Principal reads `owner` off the table instead of degrading to `user`.
  expect(await sessions.loadUserById(secondBootOwner)).toEqual({ role: "owner", handle: "owner", externalId: "authentik|alex", enabled: true });
});

// THE MOVED SEED KEY. `OWNER_HANDLES` is the handle boot's `seedOwner` and the auth seam's owner fallback
// BOTH resolve the owner ROW through, so an operator who edits it has moved the only key those two consumers
// have. RED-first (the pre-fix tree): the restart hit `ensureUser("<new key>")` → no row at that handle →
// `insertUser(role:"owner")` collided with `users_single_owner_unique` → `onConflictDoNothing` swallowed it →
// the re-read missed → `ensureUser` threw. BOOT FATAL, before any login could rename anything — which is what
// made `provision-identity`'s "the rename then lands the row back onto the new one" a promise nothing kept.
// D258, the mode-flip walk: on an unclaimed oidc box a member renames at the IdP to the seed key, the operator flips to
// a seeded mode (boot runs seedOwner) and back to oidc. The member must never end up holding the owner row.
test("a member's IdP rename onto the seed key never becomes the owner across a mode flip and back", async ({ clock }) => {
  const db = await freshDb();
  const sessions = createSessionsService({
    db,
    now: clock.now,
    sessionSecret: PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now: clock.now, onEmbedSpaceBound: () => undefined }),
  });
  vi.stubEnv("OWNER_HANDLES", "owner");
  const member: ResolvedIdentity = { externalId: castId<ExternalId>("idp|mallory"), handle: castId<Handle>("mallory"), groups: [], email: null };

  // oidc, unclaimed: the member joins, then renames at the IdP to the seed key.
  await sessions.provisionIdentity(member, { ownerClaimProven: false, allowJitProvision: true });
  await sessions.provisionIdentity({ ...member, handle: castId<Handle>("owner") }, { ownerClaimProven: false });

  // The operator flips to a seeded mode: boot seeds the owner by the seed key.
  const ownerId = (await seedOwner({ db, sessions, ownerHandles: ["owner"], now: clock.now }))[0];

  // Back to oidc: the member's subject signs in again.
  const back = await sessions.provisionIdentity({ ...member, handle: castId<Handle>("owner") }, { ownerClaimProven: false });

  const rows = await db.select().from(users);
  const memberRow = rows.find((row) => row.externalId === "idp|mallory");
  expect(memberRow).toMatchObject({ handle: "mallory", role: "user" });
  expect(rows.filter((row) => row.role === "owner")).toEqual([expect.objectContaining({ id: ownerId, handle: "owner", externalId: null })]);
  expect(back).toMatchObject({ outcome: "provisioned", userId: memberRow?.id, role: "user" });
});

// D258: a JIT sign-in under a look-alike of the seed key must leave the key free, or every seeded-mode boot's
// `ensureUser(seed key)` meets `users_handle_key_unique`.
test("after a stranger's JIT sign-in as a seed-key look-alike, a seeded-mode boot still seeds the owner", async ({ clock }) => {
  const db = await freshDb();
  const sessions = createSessionsService({
    db,
    now: clock.now,
    sessionSecret: PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now: clock.now, onEmbedSpaceBound: () => undefined }),
  });
  vi.stubEnv("OWNER_HANDLES", "owner");
  const stranger: ResolvedIdentity = { externalId: castId<ExternalId>("idp|stranger"), handle: castId<Handle>("Owner"), groups: [], email: null };
  await sessions.provisionIdentity(stranger, { ownerClaimProven: false, allowJitProvision: true });

  const ownerId = (await seedOwner({ db, sessions, ownerHandles: ["owner"], now: clock.now }))[0];

  const rows = await db.select().from(users);
  expect(rows).toEqual([expect.objectContaining({ id: ownerId, handle: "owner", role: "owner", externalId: null })]);
});

test("an operator who MOVES OWNER_HANDLES: the owner row follows the new key, boot survives, role/subject intact", async ({ clock }) => {
  const db = await freshDb();
  const sessions = createSessionsService({
    db,
    now: clock.now,
    sessionSecret: PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now: clock.now, onEmbedSpaceBound: () => undefined }),
  });
  vi.stubEnv("OWNER_HANDLES", "owner");

  const firstBootOwner = (await seedOwner({ db, sessions, ownerHandles: ["owner"], now: clock.now }))[0];
  // The realistic shape: the row is already SSO-bound (that binding is exactly what must survive the move).
  await db
    .update(users)
    .set({ externalId: castId<ExternalId>("authentik|alex") })
    .where(eq(users.handle, castId<Handle>("owner")));

  // The operator's IdP username changed, so they edit OWNER_HANDLES and restart.
  vi.stubEnv("OWNER_HANDLES", "alex");
  const secondBootOwner = (await seedOwner({ db, sessions, ownerHandles: ["alex"], now: clock.now }))[0];

  expect(secondBootOwner).toBe(firstBootOwner);
  const rows = await db.select().from(users);
  expect(rows).toHaveLength(1);
  // Only the handle moved: the role and the durable SSO subject are untouched by the migration.
  expect(rows[0]?.handle).toBe("alex");
  expect(rows[0]?.role).toBe("owner");
  expect(rows[0]?.externalId).toBe("authentik|alex");
  // The id names a REAL row — the boot Principal reads `owner`, never the phantom-id degrade to `user`.
  expect(await sessions.loadUserById(rows[0]?.id ?? OWNER_ID)).toEqual({ role: "owner", handle: "alex", externalId: "authentik|alex", enabled: true });
});

// The migration NEVER STEALS. A member already holding the new key means the operator picked a taken handle;
// boot refuses with an actionable message instead of moving that member's row (or flipping it to owner, which
// `users_single_owner_unique` would reject as an opaque SQLITE_CONSTRAINT — the pre-fix failure).
test("moving OWNER_HANDLES onto a handle a MEMBER already holds refuses loudly and touches NEITHER row", async ({ clock }) => {
  const db = await freshDb();
  const sessions = createSessionsService({
    db,
    now: clock.now,
    sessionSecret: PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now: clock.now, onEmbedSpaceBound: () => undefined }),
  });
  vi.stubEnv("OWNER_HANDLES", "owner");
  await seedOwner({ db, sessions, ownerHandles: ["owner"], now: clock.now });
  await db.insert(users).values({ id: OTHER_ID, handle: castId<Handle>("alex"), handleKey: handleKey(castId<Handle>("alex")), role: "user" });

  vi.stubEnv("OWNER_HANDLES", "alex");
  await expect(seedOwner({ db, sessions, ownerHandles: ["alex"], now: clock.now })).rejects.toThrow(HANDLE_TAKEN_REFUSAL);

  const rows = await db.select().from(users);
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.handle === "owner")?.role).toBe("owner");
  // The member kept their handle AND their role — a refused migration is not a partial one.
  expect(rows.find((r) => r.handle === "alex")?.role).toBe("user");
});

test("no initialPassword (single-user / SSO): the owner row is seeded WITHOUT a password", async ({ clock }) => {
  const db = await freshDb();
  const sessions = createSessionsService({
    db,
    now: clock.now,
    sessionSecret: PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now: clock.now, onEmbedSpaceBound: () => undefined }),
  });

  await seedOwner({ db, sessions, ownerHandles: ["owner"], now: clock.now });

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.handle, castId<Handle>("owner")));
  expect(row?.role).toBe("owner");
  expect(row?.passwordHash).toBeNull();
  // No hash → the local login path cannot authenticate (SSO/fallback owns identity in these modes).
  expect(await sessions.authenticate(castId<Handle>("owner"), INITIAL_PASSWORD)).toBeNull();
});
