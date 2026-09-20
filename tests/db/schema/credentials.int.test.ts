// credentials.int — the user_credentials slice against a real libSQL :memory: db (FK enforcement ON
// via createDb). Covers: the insert→select round-trip (branded id + metadata JSON parse), the test-mirror
// that the db column still types CRED_PROVIDERS, the revoked-reason column, the ownerId FK — and, under
// connections-as-the-unit (inference program §5.3, F7), that the SQL-level provider CHECK and the
// one-active-per-(owner,provider) partial unique are GONE: the column is becoming a registry id validated at
// the domain, and WHICH key resolves is the connection's `credentialId`, never an active flag.

import { CRED_PROVIDERS, CRED_REVOKED_REASONS, parseProviderMetadata } from "@orb/contracts/credentials";
import { userCredentials } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";
import { seedUser } from "./_support.ts";

test("user_credentials insert→select round-trips (branded id + metadata JSON parses)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cred_owner" });
  const id = castId<UserCredentialId>("user_credential_001");

  await db.insert(userCredentials).values({
    id,
    ownerId,
    provider: "custom_openai",
    ciphertext: "ct",
    iv: "iv",
    tag: "tag",
    metadata: { kind: "custom_openai", baseUrl: "http://localhost:1234/v1" },
    label: "Local",
  });

  const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, id));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.id).toBe(id);
  expect(row?.ownerId).toBe(ownerId);
  expect(row?.provider).toBe("custom_openai");
  // Booleans round-trip through the integer column; `active` defaults true.
  expect(row?.active).toBe(true);
  expect(row?.revokedAt).toBeNull();
  // #1373 — a live row carries no reason. `revoked_at`/`revoked_reason` move together at every writer.
  expect(row?.revokedReason).toBeNull();
  // The JSON metadata read seam: parse via the canonical contracts parser.
  const meta = parseProviderMetadata(row?.metadata);
  expect(meta).toEqual({ kind: "custom_openai", baseUrl: "http://localhost:1234/v1" });
});

test("test-mirror: every CRED_PROVIDERS member is accepted by the provider column", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cred_owner" });

  // Distinct providers coexist for one owner (the partial unique is per-(owner,provider)).
  await db.insert(userCredentials).values(
    CRED_PROVIDERS.map((provider, idx) => ({
      id: castId<UserCredentialId>(`user_credential_mirror_${idx}`),
      ownerId,
      provider,
      ciphertext: "ct",
      iv: "iv",
      tag: "tag",
    })),
  );

  const rows = await db.select().from(userCredentials);
  expect(rows.map((r) => r.provider).sort()).toEqual(CRED_PROVIDERS.toSorted());
});

test("test-mirror: every CRED_REVOKED_REASONS member round-trips through the revoked_reason column (#1373)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cred_owner" });

  // One row per reason. `provider` is fixed and `active:false` keeps the partial unique index out of the
  // way — this arm is about the reason column, nothing else.
  await db.insert(userCredentials).values(
    CRED_REVOKED_REASONS.map((revokedReason, idx) => ({
      id: castId<UserCredentialId>(`user_credential_reason_${idx}`),
      ownerId,
      provider: "openrouter" as const,
      ciphertext: "ct",
      iv: "iv",
      tag: "tag",
      active: false,
      revokedAt: 1_750_000_000_000,
      revokedReason,
    })),
  );

  const rows = await db.select().from(userCredentials);
  expect(rows.map((r) => r.revokedReason).sort()).toEqual(CRED_REVOKED_REASONS.toSorted());
});

test("there is NO provider CHECK: a registry id outside CRED_PROVIDERS is stored (validated at the domain, never in SQL)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cred_owner" });

  // A plugin provider id is runtime data — a SQL CHECK would be the closed-BACKEND_KEYS mistake again.
  const registryId: string = "plugin:acme/relay";
  await db.insert(userCredentials).values({
    id: castId<UserCredentialId>("user_credential_plugin"),
    ownerId,
    provider: registryId as (typeof CRED_PROVIDERS)[number],
    ciphertext: "ct",
    iv: "iv",
    tag: "tag",
  });
  const rows = await db.select().from(userCredentials);
  expect(rows.map((r) => r.provider)).toEqual([registryId]);
});

test("two ACTIVE rows for one (owner, provider) coexist — the connection decides which key resolves, not a slot flag", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cred_owner" });
  await db.insert(userCredentials).values([
    { id: castId<UserCredentialId>("user_credential_active_a"), ownerId, provider: "openrouter", ciphertext: "ct", iv: "iv", tag: "tag", active: true },
    { id: castId<UserCredentialId>("user_credential_active_b"), ownerId, provider: "openrouter", ciphertext: "ct", iv: "iv", tag: "tag", active: true },
  ]);
  const rows = await db
    .select()
    .from(userCredentials)
    .where(and(eq(userCredentials.ownerId, ownerId), eq(userCredentials.provider, "openrouter")));
  expect(rows.filter((r) => r.active)).toHaveLength(2);
});

test("the ownerId FK rejects a missing user", async () => {
  const db = await freshDb();

  let caught: unknown;
  try {
    await db.insert(userCredentials).values({
      id: castId<UserCredentialId>("user_credential_orphan"),
      ownerId: castId<UserId>("user_does_not_exist"),
      provider: "openrouter",
      ciphertext: "ct",
      iv: "iv",
      tag: "tag",
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});
