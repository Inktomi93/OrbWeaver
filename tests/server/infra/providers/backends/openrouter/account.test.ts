// backends/openrouter account — the diagnostic account verbs (credit balance + per-generation cost). The
// SDK client is a fake typed against the port's narrowed client slice — no casts.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import { NO_PROVIDER_SECRETS, providerCredentialSecretValues } from "@orb/server/infra/providers/backends/kit";
import { getOpenRouterCredits, getOpenRouterGenerationCost } from "@orb/server/infra/providers/backends/openrouter";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

type CreditsClient = Parameters<typeof getOpenRouterCredits>[0];
type GenClient = Parameters<typeof getOpenRouterGenerationCost>[0];

/** The credential-derived scrub set these surfaces now REQUIRE (#1599). */
function scrubSetFor(apiKey: string): ReturnType<typeof providerCredentialSecretValues> {
  // ResolvedCredential is brand-sealed; only domain credentials/substrate/mint constructs one.
  // @orb-waive no-test-fabrication(unknown): server-can't-mint — see above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return providerCredentialSecretValues({ source: "openrouter", apiKey, credentialId: null } as unknown as ResolvedCredential);
}

describe("getOpenRouterCredits", () => {
  test("maps total + used off the credits data", async () => {
    const client: CreditsClient = {
      credits: {
        getCredits: () => Promise.resolve({ data: { totalCredits: 10, totalUsage: 3 } }),
      },
    };
    expect(await getOpenRouterCredits(client, NO_PROVIDER_SECRETS)).toEqual({ total: 10, used: 3 });
  });

  test("a failure becomes a typed ProviderError", async () => {
    const client: CreditsClient = {
      credits: { getCredits: () => Promise.reject(new Error("boom")) },
    };
    await expect(getOpenRouterCredits(client, NO_PROVIDER_SECRETS)).rejects.toMatchObject({ name: "ProviderError" });
  });

  test("a credential-reflecting failure is scrubbed before it becomes a ProviderError", async () => {
    const secret = "sk-or-account-reflected-123456";
    const client: CreditsClient = {
      credits: { getCredits: () => Promise.reject(new Error(`401 rejected ${secret}`)) },
    };
    await expect(getOpenRouterCredits(client, scrubSetFor(secret))).rejects.toMatchObject({ message: expect.not.stringContaining(secret) });
  });

  test("threads the signal through as the SDK options arg", async () => {
    const controller = new AbortController();
    const getCredits = vi.fn(() => Promise.resolve({ data: { totalCredits: 0, totalUsage: 0 } }));
    const client: CreditsClient = { credits: { getCredits } };
    await getOpenRouterCredits(client, NO_PROVIDER_SECRETS, controller.signal);
    expect(getCredits).toHaveBeenCalledWith(undefined, { signal: controller.signal });
  });
});

describe("getOpenRouterGenerationCost", () => {
  test("maps the cost + token counts off the generation data", async () => {
    const client: GenClient = {
      generations: {
        getGeneration: () =>
          Promise.resolve({
            data: { totalCost: 0.012, tokensPrompt: 100, tokensCompletion: 40 },
          }),
      },
    };
    expect(await getOpenRouterGenerationCost(client, "gen-1", NO_PROVIDER_SECRETS)).toEqual({
      totalCost: 0.012,
      tokensPrompt: 100,
      tokensCompletion: 40,
    });
  });

  test("threads the signal through as the SDK options arg", async () => {
    const controller = new AbortController();
    const getGeneration = vi.fn(() => Promise.resolve({ data: { totalCost: 0, tokensPrompt: 0, tokensCompletion: 0 } }));
    const client: GenClient = { generations: { getGeneration } };
    await getOpenRouterGenerationCost(client, "gen-1", NO_PROVIDER_SECRETS, controller.signal);
    expect(getGeneration).toHaveBeenCalledWith({ id: "gen-1" }, { signal: controller.signal });
  });
});
