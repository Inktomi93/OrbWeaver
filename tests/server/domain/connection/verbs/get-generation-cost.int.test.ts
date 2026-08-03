// verb: getGenerationCost — the settled cost of one OpenRouter generation. Load-bearing: the caller's
// OWN `openrouter` key is resolved first (the key that billed the generation; no key →
// DomainNoCredentialError), the generationId threads through to the diagnostic, and the GenerationCost
// passes through untouched.

import { DomainNoCredentialError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createConnectionService } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeConnHarness, principal } from "../_support.ts";

describe("getGenerationCost", () => {
  test("resolves the caller's openrouter key, threads the generationId, passes the cost through", async () => {
    const db = await freshDb();
    const h = makeConnHarness(db);
    const svc = createConnectionService(h.ctx);

    const result = await svc.getGenerationCost({
      principal: principal(castId<UserId>("user_a")),
      generationId: "gen-123",
    });

    expect(h.credentialCalls).toEqual(["openrouter"]);
    // The fake echoes the id length as tokensPrompt — proves the id threaded through.
    expect(result).toEqual({ totalCost: 0.0123, tokensPrompt: 7, tokensCompletion: 42 });
  });

  test("no/revoked key: DomainNoCredentialError propagates before any upstream call", async () => {
    const db = await freshDb();
    const h = makeConnHarness(db);
    const ctx = {
      ...h.ctx,
      resolveCredential: (): Promise<never> => Promise.reject(new DomainNoCredentialError("openrouter")),
    };
    const svc = createConnectionService(ctx);

    await expect(svc.getGenerationCost({ principal: principal(castId<UserId>("user_a")), generationId: "gen-123" })).rejects.toBeInstanceOf(
      DomainNoCredentialError,
    );
  });
});
