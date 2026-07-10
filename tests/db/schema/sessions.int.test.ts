// sessions.int — the sessions + oidc_transactions slice against a real libSQL :memory: db (FK
// enforcement ON). Covers: the session round-trip (no raw token — only token_hash), the token_hash
// UNIQUE index, the userId FK + its cascade-on-user-delete, and the oidc_transactions natural-key KV
// (round-trip + the PK collision).

import { isConstraintViolation, oidcTransactions, sessions, users } from "@orb/db";
import type { SessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedUser } from "./_support.ts";

// epoch-ms literal — timestamp columns are plain integer numbers (contracts views type timestamps as numbers).
const EXPIRES_AT = 1_900_000_000_000;

test("a session round-trips (branded id + token_hash; raw token is never stored)", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_session_owner" });
  const id = castId<SessionId>("session_001");

  await db.insert(sessions).values({
    id,
    userId,
    tokenHash: "peppered-hash",
    expiresAt: EXPIRES_AT,
    label: "browser",
  });

  const rows = await db.select().from(sessions).where(eq(sessions.id, id));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.userId).toBe(userId);
  expect(row?.tokenHash).toBe("peppered-hash");
  expect(row?.revokedAt).toBeNull();
  // There is no raw-token column — only the hash.
  expect(row).not.toHaveProperty("token");
});

test("the token_hash UNIQUE index rejects a duplicate hash", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_session_owner" });

  await db.insert(sessions).values({
    id: castId<SessionId>("session_a"),
    userId,
    tokenHash: "same-hash",
    expiresAt: EXPIRES_AT,
  });

  let caught: unknown;
  try {
    await db.insert(sessions).values({
      id: castId<SessionId>("session_b"),
      userId,
      tokenHash: "same-hash",
      expiresAt: EXPIRES_AT,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("the userId FK rejects a missing user", async () => {
  const db = await freshDb();

  let caught: unknown;
  try {
    await db.insert(sessions).values({
      id: castId<SessionId>("session_orphan"),
      userId: castId<UserId>("user_does_not_exist"),
      tokenHash: "h",
      expiresAt: EXPIRES_AT,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("deleting the user cascades away their sessions", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_session_owner" });
  await db.insert(sessions).values({
    id: castId<SessionId>("session_cascade"),
    userId,
    tokenHash: "h-cascade",
    expiresAt: EXPIRES_AT,
  });

  await db.delete(users).where(eq(users.id, userId));

  const remaining = await db.select().from(sessions).where(eq(sessions.userId, userId));
  expect(remaining).toHaveLength(0);
});

test("oidc_transactions round-trips on its natural state key (nullable fields stay null)", async () => {
  const db = await freshDb();

  await db.insert(oidcTransactions).values({
    state: "state-abc",
    codeVerifier: "verifier-xyz",
    expiresAt: EXPIRES_AT,
  });

  const rows = await db
    .select()
    .from(oidcTransactions)
    .where(eq(oidcTransactions.state, "state-abc"));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.codeVerifier).toBe("verifier-xyz");
  expect(rows[0]?.nonce).toBeNull();
  expect(rows[0]?.redirectUri).toBeNull();
});

test("oidc_transactions rejects a duplicate state (primary key)", async () => {
  const db = await freshDb();
  await db.insert(oidcTransactions).values({
    state: "dup-state",
    codeVerifier: "v1",
    expiresAt: EXPIRES_AT,
  });

  let caught: unknown;
  try {
    await db.insert(oidcTransactions).values({
      state: "dup-state",
      codeVerifier: "v2",
      expiresAt: EXPIRES_AT,
    });
  } catch (err) {
    caught = err;
  }
  // SQLite reports a duplicate PRIMARY KEY as "UNIQUE constraint failed" → classifier kind is "unique".
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});
