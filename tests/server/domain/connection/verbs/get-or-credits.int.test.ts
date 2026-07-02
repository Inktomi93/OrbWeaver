// verb: getOrCredits — the caller's OpenRouter credit balance. Load-bearing: the verb resolves the
// caller's OWN `openrouter` credential FIRST (a missing/revoked key rejects in credentials.resolve with
// DomainNoCredentialError — the client-banner floor, never a fabricated zero balance) and passes the
// diagnostic's AccountCredits through untouched.

import { DomainNoCredentialError } from "@orb/kit/errors";
import { createConnectionService } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeConnHarness, principal } from "../_support.ts";

describe("getOrCredits", () => {
  test("resolves the caller's openrouter key and passes the balance through", async () => {
    const db = await freshDb();
    const h = makeConnHarness(db);
    const svc = createConnectionService(h.ctx);

    const result = await svc.getOrCredits({ principal: principal("user_a") });

    expect(h.credentialCalls).toEqual(["openrouter"]);
    expect(result).toEqual({ total: 25, used: 7.5 });
  });

  test("no/revoked key: the credentials-side DomainNoCredentialError propagates (no fabricated zero)", async () => {
    const db = await freshDb();
    const h = makeConnHarness(db);
    const ctx = {
      ...h.ctx,
      resolveCredential: (): Promise<never> =>
        Promise.reject(new DomainNoCredentialError("openrouter")),
    };
    const svc = createConnectionService(ctx);

    await expect(svc.getOrCredits({ principal: principal("user_a") })).rejects.toBeInstanceOf(
      DomainNoCredentialError,
    );
  });
});
