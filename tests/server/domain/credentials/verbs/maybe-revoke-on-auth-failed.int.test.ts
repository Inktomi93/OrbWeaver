// verb: maybeRevokeOnAuthFailed — the post-generation credential STRIKE-OUT (#1373; the chat engine injects it
// at its three generation catch seams). This verb is the ONE home of the revoke POLICY, so the exhaustive arm
// below is the load-bearing test: EVERY `PROVIDER_ERROR_KINDS` member gets a case, exactly one of them
// revokes, and adding a member to the union without deciding its verdict is a `tsc` error here (the `default`
// arm narrows to `never`, so an undecided kind cannot compile).
//
// Why that matters more than it looks: revoking on the wrong kind is a self-inflicted lockout. A `rate_limit`
// is a minute's wait; revoking on it would make a 429 permanently disable the user's key, and they would then
// have to notice a chip in the Connections pane to get it back.

import { userCredentials } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCredentialsService } from "@orb/server/domain/credentials";
import type { ProviderErrorKind } from "@orb/inference";
import { PROVIDER_ERROR_KINDS } from "@orb/inference";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedCredential, seedUser } from "../_support.ts";

/** The verdict every provider failure kind carries. Exhaustive by construction — a new `PROVIDER_ERROR_KINDS`
 *  member falls through to `default`, where it is no longer `never` and `tsc` reds. (A mapped `Record` would
 *  say the same thing but would force a `useNamingConvention` suppression per snake_case key, and a
 *  suppression added to pass a lint is the banned reflex.) `true` for exactly one member — see the header. */
function revokes(kind: ProviderErrorKind): boolean {
  switch (kind) {
    case "auth_failed":
      return true;
    case "aborted":
    case "billing":
    case "forbidden":
    case "invalid":
    case "max_output":
    case "model_unavailable":
    case "moderation":
    case "rate_limit":
    case "refused":
    case "server":
    case "unknown":
      return false;
    default: {
      const unhandled: never = kind;
      throw new Error(`undecided provider error kind: ${String(unhandled)}`);
    }
  }
}

describe("maybeRevokeOnAuthFailed", () => {
  test("auth_failed + a BYO credentialId revokes that credential AND records WHY", async () => {
    const db = await freshDb();
    const { svc, cred, owner } = await seedCredential(db, makeHarness(db));

    await svc.maybeRevokeOnAuthFailed({
      ownerId: owner,
      credentialId: cred.id,
      errorKind: "auth_failed",
      errorMessage: "401 from upstream",
    });
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    // The reason is the half that lets the pane say "the provider rejected it" rather than show a bare Revoked
    // chip — and it is written in the SAME statement as the stamp, never a second write that can lag.
    expect(rows[0]).toMatchObject({ revokedReason: "auth_failed" });
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  // EXHAUSTIVE over the provider union, one case per member — the arm that stops a future kind from joining a
  // policy nobody re-read.
  for (const kind of PROVIDER_ERROR_KINDS) {
    test(`\`${kind}\` ${revokes(kind) ? "REVOKES" : "is a no-op"}`, async () => {
      const db = await freshDb();
      const { svc, cred, owner } = await seedCredential(db, makeHarness(db));

      await svc.maybeRevokeOnAuthFailed({ ownerId: owner, credentialId: cred.id, errorKind: kind, errorMessage: `a ${kind} failure` });

      const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
      // Both columns move together or neither does: a live credential must never acquire a reason.
      expect(rows[0]).toMatchObject({ revokedReason: revokes(kind) ? "auth_failed" : null });
      expect(rows[0]?.revokedAt === null).toBe(!revokes(kind));
    });
  }

  test("a FOREIGN credentialId under this owner revokes NOTHING (the write is owner-scoped, not id-only)", async () => {
    // THE HOLE THIS CLOSES (`injected-op-caller-param`): the op is the domain boundary, so the boundary has
    // to carry the scope. Before this, the strike wrote `WHERE id = ?` and the ONLY thing keeping it off a
    // stranger's row was the discipline of today's call sites — a promise the next wiring inherits nothing
    // about. Bob's key must survive an `auth_failed` that Alice's turn reported against it.
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const alice = await seedUser(db, { id: "user_alice", role: "user" });
    const bob = await seedUser(db, { id: "user_bob", role: "user" });
    const bobsKey = await svc.add({ principal: principal(bob), provider: "openrouter", key: "sk-bob" });

    await svc.maybeRevokeOnAuthFailed({
      ownerId: alice,
      credentialId: bobsKey.id,
      errorKind: "auth_failed",
      errorMessage: "401 from upstream",
    });

    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, bobsKey.id));
    expect(rows[0]).toMatchObject({ revokedAt: null, revokedReason: null });
  });

  test("the owner-scoped miss is REPORTED, not silent — it is either a bug or a probe", async () => {
    // A strike that matches no row of the claimed owner is a security-relevant event: the engine only ever
    // names the credential its own turn authenticated with, so a mismatch means a wiring is wrong or someone
    // is naming ids they do not hold. Silence here would make the belt unobservable.
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const alice = await seedUser(db, { id: "user_alice", role: "user" });
    const bob = await seedUser(db, { id: "user_bob", role: "user" });
    const bobsKey = await svc.add({ principal: principal(bob), provider: "openrouter", key: "sk-bob" });

    await svc.maybeRevokeOnAuthFailed({ ownerId: alice, credentialId: bobsKey.id, errorKind: "auth_failed", errorMessage: "401" });

    // System-attributed (no principal was proven — the runner holds only ids), naming WHICH owner claimed
    // WHICH id. The refusal itself is the durable record; the row is untouched above.
    const refusal = h.audits.find((a) => a.entry.action === "credential.revokeOwnerMismatch");
    expect(refusal?.entry).toMatchObject({ actorUserId: null, entityId: bobsKey.id });
  });

  test("a null credentialId (keyless source) is a no-op (no row to revoke)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    // No throw, nothing to assert beyond "does not crash" — keyless host/vllm/local-light have no row.
    await expect(
      svc.maybeRevokeOnAuthFailed({
        ownerId: castId<UserId>("user_o"),
        credentialId: null,
        errorKind: "auth_failed",
        errorMessage: "401",
      }),
    ).resolves.toBeUndefined();
  });

  test("a keyless auth failure cannot reach a LIVE row (the null id is the whole guard)", async () => {
    // The shape this forecloses: a keyless source (max-pro-sub/vllm) auth-failing while a stored credential
    // happens to be live. There is no id to strike, so the write is unreachable rather than merely unlikely.
    const db = await freshDb();
    const { svc, cred, owner } = await seedCredential(db, makeHarness(db));

    await svc.maybeRevokeOnAuthFailed({ ownerId: owner, credentialId: null, errorKind: "auth_failed", errorMessage: "401 on the host box credential" });

    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).toBeNull();
  });
});
