// verb: maybeRevokeOnAuthFailed — the post-turn side-effect (chat/compaction inject it). Revokes only on
// `auth_failed` + a non-null (BYO) credentialId; a no-op otherwise (keyless sources have no row).

import { userCredentials } from "@orb/db";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

// biome-ignore lint/security/noSecrets: "maybeRevokeOnAuthFailed" is the verb name (high camelCase entropy), not a credential.
describe("maybeRevokeOnAuthFailed", () => {
  test("auth_failed + a BYO credentialId revokes that credential", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({ principal: principal(owner), provider: "openrouter", key: "k" });

    await svc.maybeRevokeOnAuthFailed({
      credentialId: cred.id,
      errorKind: "auth_failed",
      errorMessage: "401 from upstream",
    });
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  test("a non-auth_failed error is a no-op", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({ principal: principal(owner), provider: "openrouter", key: "k" });

    await svc.maybeRevokeOnAuthFailed({
      credentialId: cred.id,
      errorKind: "rate_limit",
      errorMessage: "429",
    });
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).toBeNull();
  });

  test("a null credentialId (keyless source) is a no-op (no row to revoke)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    // No throw, nothing to assert beyond "does not crash" — keyless host/vllm/local-light have no row.
    await expect(
      svc.maybeRevokeOnAuthFailed({
        credentialId: null,
        errorKind: "auth_failed",
        errorMessage: "401",
      }),
    ).resolves.toBeUndefined();
  });
});
