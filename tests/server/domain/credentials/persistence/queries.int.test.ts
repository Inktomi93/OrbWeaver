// persistence/queries — the db surface for `user_credentials`, against a real libSQL :memory: db. Asserts
// the owner-scoped reads, the projection drops every secret field (invariant #4), the one-active-per-slot
// promote, owner-scoped delete, and the revoke/clear stamps.

import type { UserCredentialId } from "@orb/kit/ids";
import type { ProviderId } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { aadFor } from "../../../../../packages/server/src/domain/credentials/persistence/aad.ts";
import {
  clearRevokedOwned,
  deleteOwnedCredential,
  fetchOwnedCredential,
  insertSealed,
  setRevokedById,
  toCredentialView,
} from "../../../../../packages/server/src/domain/credentials/persistence/queries.ts";
import { createSecretBox } from "../../../../../packages/server/src/infra/crypto/secrets.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const box = createSecretBox(Buffer.alloc(32, 7));
const OPENROUTER = castId<ProviderId>("openrouter");
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
      provider: OPENROUTER,
      label: "default",
      sealed: box.encrypt("sk-secret", aadFor(owner, OPENROUTER)),
      metadata: null,
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
    expect(view).toMatchObject({ id, provider: "openrouter" });
  });

  test("fetchOwnedCredential is owner-scoped (a non-owner gets undefined)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, { id: "user_a", role: "user" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });
    const id = nextId();
    await insertSealed(db, {
      id,
      ownerId: alice,
      provider: OPENROUTER,
      label: "default",
      sealed: box.encrypt("k", aadFor(alice, OPENROUTER)),
      metadata: null,
      now: FROZEN_AT,
    });
    expect(await fetchOwnedCredential(db, bob, id)).toBeUndefined();
    expect(await fetchOwnedCredential(db, alice, id)).toBeDefined();
  });

  // The promote leg is owner-scoped in its OWN where, not just by the verb that calls it: naming a stranger's
  test("revoke then clear round-trips the revoked_at + revoked_reason PAIR", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const id = nextId();
    await insertSealed(db, {
      id,
      ownerId: owner,
      provider: OPENROUTER,
      label: "default",
      sealed: box.encrypt("k", aadFor(owner, OPENROUTER)),
      metadata: null,
      now: FROZEN_AT,
    });
    expect(await setRevokedById(db, { ownerId: owner, credentialId: id, revokedAt: FROZEN_AT, reason: "auth_failed" })).toEqual([{ id }]);
    // The pair is written and cleared TOGETHER (#1373) — a live row carrying a stale reason would tell the
    // Connections pane a working key had been rejected.
    expect(await fetchOwnedCredential(db, owner, id)).toMatchObject({ revokedAt: FROZEN_AT, revokedReason: "auth_failed" });
    await clearRevokedOwned(db, owner, id, FROZEN_AT);
    expect(await fetchOwnedCredential(db, owner, id)).toMatchObject({ revokedAt: null, revokedReason: null });
  });

  test("setRevokedById is OWNER-SCOPED — a foreign owner matches no row and writes nothing", async () => {
    // The predicate IS the belt (#1373 fix leg). This used to be `WHERE id = ?` behind an
    // `@owner-scope-write-ok` marker arguing the callers could not reach a foreign row; the empty return here
    // is what makes that a property of the QUERY instead of a claim about call sites.
    const db = await freshDb();
    const alice = await seedUser(db, { id: "user_a", role: "user" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });
    const id = nextId();
    await insertSealed(db, {
      id,
      ownerId: bob,
      provider: OPENROUTER,
      label: "default",
      sealed: box.encrypt("k", aadFor(bob, OPENROUTER)),
      metadata: null,
      now: FROZEN_AT,
    });

    expect(await setRevokedById(db, { ownerId: alice, credentialId: id, revokedAt: FROZEN_AT, reason: "auth_failed" })).toEqual([]);
    expect(await fetchOwnedCredential(db, bob, id)).toMatchObject({ revokedAt: null, revokedReason: null });
  });

  test("deleteOwnedCredential is owner-scoped (a non-owner delete is a no-op)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, { id: "user_a", role: "user" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });
    const id = nextId();
    await insertSealed(db, {
      id,
      ownerId: alice,
      provider: OPENROUTER,
      label: "default",
      sealed: box.encrypt("k", aadFor(alice, OPENROUTER)),
      metadata: null,
      now: FROZEN_AT,
    });
    await deleteOwnedCredential(db, bob, id);
    expect(await fetchOwnedCredential(db, alice, id)).toBeDefined();
    await deleteOwnedCredential(db, alice, id);
    expect(await fetchOwnedCredential(db, alice, id)).toBeUndefined();
  });
});
