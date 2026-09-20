// credentials.int — the user_credentials slice against a real libSQL :memory: db (FK enforcement ON via
// createDb). Covers: the insert→select round-trip (branded id + metadata JSON parse), the revoked-reason
// column, the ownerId FK — and, under connections-as-the-unit (inference program §5.3, F7), that the
// SQL-level provider CHECK and the one-active-per-(owner,provider) partial unique are GONE: the column is a
// registry id validated at the domain, and WHICH key resolves is the connection's `credentialId`, never an
// active flag. A second key on the same provider is just a second labelled row.

import { CRED_REVOKED_REASONS, parseProviderMetadata } from "@orb/contracts/credentials";
import type { ProviderId } from "@orb/contracts/inference";
import { userCredentials } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";
import { seedUser } from "./_support.ts";

const VLLM = castId<ProviderId>("vllm");
const OPENROUTER = castId<ProviderId>("openrouter");

test("user_credentials insert→select round-trips (branded id + metadata JSON parses)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cred_owner" });
  const id = castId<UserCredentialId>("user_credential_001");

  await db.insert(userCredentials).values({
    id,
    ownerId,
    provider: VLLM,
    ciphertext: "ct",
    iv: "iv",
    tag: "tag",
    metadata: { auth: "endpoint" },
    label: "Local",
  });

  const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, id));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.id).toBe(id);
  expect(row?.ownerId).toBe(ownerId);
  expect(row?.provider).toBe("vllm");
  expect(row?.revokedAt).toBeNull();
  // #1373 — a live row carries no reason. `revoked_at`/`revoked_reason` move together at every writer.
  expect(row?.revokedReason).toBeNull();
  // The JSON metadata read seam: parse via the canonical contracts parser (the `auth` discriminator).
  const meta = parseProviderMetadata(row?.metadata);
  expect(meta).toEqual({ auth: "endpoint" });
});

test("the provider column carries a REGISTRY id with no SQL CHECK — a plugin-namespaced id inserts (validation is the domain's)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cred_owner" });
  await db.insert(userCredentials).values({
    id: castId<UserCredentialId>("user_credential_plugin"),
    ownerId,
    provider: castId<ProviderId>("plugin:acme/llm"),
    ciphertext: "ct",
    iv: "iv",
    tag: "tag",
    metadata: null,
    label: "default",
  });
  const rows = await db.select({ provider: userCredentials.provider }).from(userCredentials).where(eq(userCredentials.ownerId, ownerId));
  expect(rows.map((r) => r.provider)).toEqual(["plugin:acme/llm"]);
});

test("TWO keys on the same (owner, provider) coexist — there is no active-slot partial unique any more", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cred_owner" });
  for (const label of ["work", "personal"]) {
    await db.insert(userCredentials).values({
      id: castId<UserCredentialId>(`user_credential_${label}`),
      ownerId,
      provider: OPENROUTER,
      ciphertext: "ct",
      iv: "iv",
      tag: "tag",
      metadata: null,
      label,
    });
  }
  const rows = await db
    .select({ label: userCredentials.label })
    .from(userCredentials)
    .where(and(eq(userCredentials.ownerId, ownerId), eq(userCredentials.provider, OPENROUTER)));
  expect(rows.map((r) => r.label).toSorted()).toEqual(["personal", "work"]);
});

test("revoked_reason is CHECK-bound to CRED_REVOKED_REASONS — an unlisted word is refused at the row", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cred_owner" });
  const base = { ownerId, provider: OPENROUTER, ciphertext: "ct", iv: "iv", tag: "tag", metadata: null, label: "default" };
  for (const [idx, reason] of CRED_REVOKED_REASONS.entries()) {
    await db.insert(userCredentials).values({ ...base, id: castId<UserCredentialId>(`user_credential_r${idx}`), label: `r${idx}`, revokedAt: 1, revokedReason: reason });
  }
  await expect(
    // @orb-waive no-test-fabrication(unknown): the CHECK probe MUST send a word outside the tuple — that is the test. Ends when the column's enum can express its own negative.
    db.insert(userCredentials).values({ ...base, id: castId<UserCredentialId>("user_credential_bad"), label: "bad", revokedAt: 1, revokedReason: "expired" as unknown as (typeof CRED_REVOKED_REASONS)[number] }),
  ).rejects.toSatisfy((err: unknown) => isConstraintViolation(err) !== undefined);
});

test("owner_id is an enforced FK — a row for a missing user is refused", async () => {
  const db = await freshDb();
  await expect(
    db.insert(userCredentials).values({
      id: castId<UserCredentialId>("user_credential_orphan"),
      ownerId: castId<UserId>("user_missing"),
      provider: OPENROUTER,
      ciphertext: "ct",
      iv: "iv",
      tag: "tag",
      metadata: null,
      label: "default",
    }),
  ).rejects.toSatisfy((err: unknown) => isConstraintViolation(err) !== undefined);
});
