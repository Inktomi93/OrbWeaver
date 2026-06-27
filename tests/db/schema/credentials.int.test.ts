// credentials.int — the user_credentials slice against a real libSQL :memory: db (FK enforcement ON
// via createDb). Covers: the insert→select round-trip (branded id + metadata JSON parse), the provider
// enum CHECK (+ the test-mirror that the db column derives CRED_PROVIDERS), the one-active-per-
// (owner,provider) partial unique index, and the ownerId FK.

import { CRED_PROVIDERS, parseProviderMetadata } from "@orb/contracts/credentials";
import type { Db } from "@orb/db";
import { isConstraintViolation, userCredentials, users } from "@orb/db";
import type { Handle, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

async function seedUser(db: Db, raw = "user_cred_owner"): Promise<UserId> {
  const id = castId<UserId>(raw);
  await db.insert(users).values({ id, handle: castId<Handle>(raw) });
  return id;
}

test("user_credentials insert→select round-trips (branded id + metadata JSON parses)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db);
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
  // The JSON metadata read seam: parse via the canonical contracts parser.
  const meta = parseProviderMetadata(row?.metadata);
  expect(meta).toEqual({ kind: "custom_openai", baseUrl: "http://localhost:1234/v1" });
});

test("test-mirror: every CRED_PROVIDERS member is accepted by the provider column", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db);

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
  expect(rows.map((r) => r.provider).sort()).toEqual([...CRED_PROVIDERS].sort());
});

test("the provider CHECK rejects an off-enum value", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db);

  // A `string`-typed value downcast to the enum union forces an invalid value at the SQL boundary
  // (a string-literal `as` would trip TS2352 — the literal doesn't overlap the union).
  const invalidProvider: string = "totally_invalid";

  let caught: unknown;
  try {
    await db.insert(userCredentials).values({
      id: castId<UserCredentialId>("user_credential_bad"),
      ownerId,
      provider: invalidProvider as (typeof CRED_PROVIDERS)[number],
      ciphertext: "ct",
      iv: "iv",
      tag: "tag",
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("one-active-per-(owner,provider): a second active row collides; an inactive one coexists", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db);

  await db.insert(userCredentials).values({
    id: castId<UserCredentialId>("user_credential_active_a"),
    ownerId,
    provider: "openrouter",
    ciphertext: "ct",
    iv: "iv",
    tag: "tag",
    active: true,
  });

  // A second ACTIVE row for the same (owner, provider) violates the partial unique index.
  let caught: unknown;
  try {
    await db.insert(userCredentials).values({
      id: castId<UserCredentialId>("user_credential_active_b"),
      ownerId,
      provider: "openrouter",
      ciphertext: "ct",
      iv: "iv",
      tag: "tag",
      active: true,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");

  // An INACTIVE row for the same slot is allowed (UNIQUE ignores rows failing the WHERE predicate).
  await db.insert(userCredentials).values({
    id: castId<UserCredentialId>("user_credential_inactive"),
    ownerId,
    provider: "openrouter",
    ciphertext: "ct",
    iv: "iv",
    tag: "tag",
    active: false,
  });
  const inactive = await db
    .select()
    .from(userCredentials)
    .where(and(eq(userCredentials.ownerId, ownerId), eq(userCredentials.active, false)));
  expect(inactive).toHaveLength(1);
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
