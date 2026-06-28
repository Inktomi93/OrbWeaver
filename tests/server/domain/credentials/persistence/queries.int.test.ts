// persistence/queries — the db surface for `user_credentials`, against a real libSQL :memory: db. Asserts
// the owner-scoped reads, the projection drops every secret field (invariant #4), the one-active-per-slot
// promote, owner-scoped delete, and the revoke/clear stamps.

import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import { aadFor } from "../../../../../packages/server/src/domain/credentials/persistence/aad.ts";
import {
  clearRevokedOwned,
  deleteOwnedCredential,
  fetchOwnedCredential,
  insertSealed,
  listOwnedCredentials,
  loadActiveCredential,
  promoteActive,
  setRevokedById,
  toCredentialView,
} from "../../../../../packages/server/src/domain/credentials/persistence/queries.ts";
import { createSecretBox } from "../../../../../packages/server/src/infra/crypto/secrets.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../_support.ts";

const box = createSecretBox(Buffer.alloc(32, 7));
const FROZEN_AT = 1_750_000_000_000;
let counter = 0;
function nextId(): UserCredentialId {
  counter += 1;
  return castId<UserCredentialId>(`user_credential_${counter}`);
}

describe("persistence/queries", () => {
  test("toCredentialView drops every secret field (ciphertext/iv/tag)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const id = nextId();
    await insertSealed(db, {
      id,
      ownerId: owner,
      provider: "openrouter",
      label: "default",
      sealed: box.encrypt("sk-secret", aadFor(owner, "openrouter")),
      metadata: null,
      active: true,
      now: FROZEN_AT,
    });
    const row = await fetchOwnedCredential(db, owner, id);
    expect(row).toBeDefined();
    if (row === undefined) {
      return;
    }
    const view = toCredentialView(row);
    expect(view).not.toHaveProperty("ciphertext");
    expect(view).not.toHaveProperty("iv");
    expect(view).not.toHaveProperty("tag");
    expect(view).toMatchObject({ id, provider: "openrouter", active: true });
  });

  test("fetchOwnedCredential is owner-scoped (a non-owner gets undefined)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, { id: "user_a", role: "user" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });
    const id = nextId();
    await insertSealed(db, {
      id,
      ownerId: alice,
      provider: "openrouter",
      label: "default",
      sealed: box.encrypt("k", aadFor(alice, "openrouter")),
      metadata: null,
      active: true,
      now: FROZEN_AT,
    });
    expect(await fetchOwnedCredential(db, bob, id)).toBeUndefined();
    expect(await fetchOwnedCredential(db, alice, id)).toBeDefined();
  });

  test("promoteActive enforces one-active-per-(owner,provider)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const a = nextId();
    const b = nextId();
    await insertSealed(db, {
      id: a,
      ownerId: owner,
      provider: "openrouter",
      label: "a",
      sealed: box.encrypt("ka", aadFor(owner, "openrouter")),
      metadata: null,
      active: true,
      now: FROZEN_AT,
    });
    await insertSealed(db, {
      id: b,
      ownerId: owner,
      provider: "openrouter",
      label: "b",
      sealed: box.encrypt("kb", aadFor(owner, "openrouter")),
      metadata: null,
      active: false,
      now: FROZEN_AT,
    });
    await promoteActive(db, {
      ownerId: owner,
      credentialId: b,
      provider: "openrouter",
      now: FROZEN_AT,
    });
    const active = await loadActiveCredential(db, owner, "openrouter");
    expect(active?.id).toBe(b);
    const all = await listOwnedCredentials(db, owner);
    expect(all.filter((r) => r.active)).toHaveLength(1);
  });

  test("revoke then clear round-trips the revoked_at stamp", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const id = nextId();
    await insertSealed(db, {
      id,
      ownerId: owner,
      provider: "openrouter",
      label: "default",
      sealed: box.encrypt("k", aadFor(owner, "openrouter")),
      metadata: null,
      active: true,
      now: FROZEN_AT,
    });
    await setRevokedById(db, id, FROZEN_AT);
    expect((await fetchOwnedCredential(db, owner, id))?.revokedAt).not.toBeNull();
    await clearRevokedOwned(db, owner, id, FROZEN_AT);
    expect((await fetchOwnedCredential(db, owner, id))?.revokedAt).toBeNull();
  });

  test("deleteOwnedCredential is owner-scoped (a non-owner delete is a no-op)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, { id: "user_a", role: "user" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });
    const id = nextId();
    await insertSealed(db, {
      id,
      ownerId: alice,
      provider: "openrouter",
      label: "default",
      sealed: box.encrypt("k", aadFor(alice, "openrouter")),
      metadata: null,
      active: true,
      now: FROZEN_AT,
    });
    await deleteOwnedCredential(db, bob, id);
    expect(await fetchOwnedCredential(db, alice, id)).toBeDefined();
    await deleteOwnedCredential(db, alice, id);
    expect(await fetchOwnedCredential(db, alice, id)).toBeUndefined();
  });
});
