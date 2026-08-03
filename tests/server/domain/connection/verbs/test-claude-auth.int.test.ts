// verb: testClaudeAuth — the max-pro-sub health check. Load-bearing: the verb resolves the `max-pro-sub`
// credential FIRST (the D17 owner gate lives inside credentials' mint — a non-owner rejects THERE, before
// any spend), picks the CHEAPEST curated tier (haiku — never opus for a probe), and hands both to the
// injected verify diagnostic. The result passes through untouched (connection adds no reshaping).

import { DomainForbiddenError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createConnectionService } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeConnHarness, principal } from "../_support.ts";

describe("testClaudeAuth", () => {
  test("resolves the max-pro-sub credential, probes the CHEAPEST curated tier, passes the result through", async () => {
    const db = await freshDb();
    const h = makeConnHarness(db);
    const svc = createConnectionService(h.ctx);

    const result = await svc.testClaudeAuth({ principal: principal(castId<UserId>("user_owner")) });

    // Authorization routed through credentials' owner-gated mint (the D17 chokepoint).
    expect(h.credentialCalls).toEqual(["max-pro-sub"]);
    // The probe model is the curated haiku entry — a health check never burns the opus tier.
    expect(h.verifyCalls).toEqual([{ source: "max-pro-sub", model: "claude-haiku-4-5-20251001" }]);
    expect(result).toEqual({
      source: "max-pro-sub",
      ok: true,
      apiKeySource: "none",
      model: "claude-haiku-4-5-20251001",
      reply: "ok",
      costUsd: 0.0001,
    });
  });

  test("a credentials-side owner-gate rejection propagates BEFORE any verify spend", async () => {
    const db = await freshDb();
    const h = makeConnHarness(db);
    // Simulate credentials' D17 refusal (the mint throws for a non-owner).
    const ctx = {
      ...h.ctx,
      resolveCredential: (): Promise<never> => Promise.reject(new DomainForbiddenError("max-pro-sub is owner-only")),
    };
    const svc = createConnectionService(ctx);

    await expect(svc.testClaudeAuth({ principal: principal(castId<UserId>("user_member")) })).rejects.toBeInstanceOf(DomainForbiddenError);
    // The verify diagnostic was never reached — no probe spend on a refused caller.
    expect(h.verifyCalls).toEqual([]);
  });
});
