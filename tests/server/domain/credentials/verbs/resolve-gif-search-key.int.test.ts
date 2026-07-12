// verb: resolveGifSearchKey — the non-LLM external-service resolver (D61 gallery-design §5). Pins: the
// owner-scoped round-trip (add seals under AAD `${owner}|gif-search`, resolve decrypts the SAME plaintext),
// the no-credential floor (null, never a throw), the cross-tenant refusal (user B never resolves user A's
// key), and the revoked → null path. Real db + real SecretBox (the AAD binding is exercised for real).

import { userCredentials } from "@orb/db";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("resolveGifSearchKey", () => {
  test("round-trips: add seals the Tenor key, resolveGifSearchKey decrypts the SAME plaintext", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    await svc.add({ principal: principal(owner), provider: "gif-search", key: "tenor-secret-xyz" });

    const key = await svc.resolveGifSearchKey({ principal: principal(owner) });
    expect(key).toBe("tenor-secret-xyz");
  });

  test("returns null when the user has no gif-search credential (the no-credential floor, never a throw)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    // An openrouter key exists but NOT a gif-search one — the resolver is provider-scoped, so this is null.
    await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-or" });

    expect(await svc.resolveGifSearchKey({ principal: principal(owner) })).toBeNull();
  });

  test("owner-scoped: user B never resolves user A's gif-search key (cross-tenant refusal)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const a = await seedUser(db, { id: "user_a", role: "user" });
    const b = await seedUser(db, { id: "user_b", role: "user" });
    await svc.add({ principal: principal(a), provider: "gif-search", key: "a-only-key" });

    expect(await svc.resolveGifSearchKey({ principal: principal(b) })).toBeNull();
    expect(await svc.resolveGifSearchKey({ principal: principal(a) })).toBe("a-only-key");
  });

  test("returns null for a revoked gif-search credential", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const cred = await svc.add({
      principal: principal(owner),
      provider: "gif-search",
      key: "tenor-secret",
    });
    await db.update(userCredentials).set({ revokedAt: 1 }).where(eq(userCredentials.id, cred.id));

    expect(await svc.resolveGifSearchKey({ principal: principal(owner) })).toBeNull();
  });
});
