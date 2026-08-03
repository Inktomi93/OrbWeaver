// backends/openrouter probe — the credential-health probe: a credits round-trip classified into
// CredentialHealth (ok / revoked / unreachable). The SDK client is a fake; the clock is injected.

import { probeOpenRouterCredential } from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

const FIXED_NOW = 5000;
type ProbeClient = Parameters<typeof probeOpenRouterCredential>[0];

describe("probeOpenRouterCredential", () => {
  test("a successful credits read → ok, stamped with the injected clock", async () => {
    const client = {
      credits: { getCredits: (): Promise<unknown> => Promise.resolve({ data: {} }) },
    } as unknown as ProbeClient;
    expect(await probeOpenRouterCredential(client, () => FIXED_NOW)).toEqual({
      status: "ok",
      checkedAt: FIXED_NOW,
    });
  });

  test("a 401-class error → revoked (with a sanitized reason)", async () => {
    const client = {
      credits: {
        getCredits: (): Promise<unknown> => Promise.reject(new Error("401 invalid api key")),
      },
    } as unknown as ProbeClient;
    const health = await probeOpenRouterCredential(client, () => FIXED_NOW);
    expect(health.status).toBe("revoked");
    expect(health.checkedAt).toBe(FIXED_NOW);
  });

  test("any other error → unreachable", async () => {
    const client = {
      credits: { getCredits: (): Promise<unknown> => Promise.reject(new Error("ECONNRESET")) },
    } as unknown as ProbeClient;
    expect((await probeOpenRouterCredential(client, () => FIXED_NOW)).status).toBe("unreachable");
  });
});
