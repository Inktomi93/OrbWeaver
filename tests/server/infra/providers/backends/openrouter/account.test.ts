// backends/openrouter account — the diagnostic account verbs (credit balance + per-generation cost). The
// SDK client is a fake typed against the port's narrowed client slice — no casts.

import { getOpenRouterCredits, getOpenRouterGenerationCost } from "@orb/server/infra/providers/backends/openrouter";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

type CreditsClient = Parameters<typeof getOpenRouterCredits>[0];
type GenClient = Parameters<typeof getOpenRouterGenerationCost>[0];

describe("getOpenRouterCredits", () => {
  test("maps total + used off the credits data", async () => {
    const client: CreditsClient = {
      credits: {
        getCredits: () => Promise.resolve({ data: { totalCredits: 10, totalUsage: 3 } }),
      },
    };
    expect(await getOpenRouterCredits(client)).toEqual({ total: 10, used: 3 });
  });

  test("a failure becomes a typed ProviderError", async () => {
    const client: CreditsClient = {
      credits: { getCredits: () => Promise.reject(new Error("boom")) },
    };
    await expect(getOpenRouterCredits(client)).rejects.toMatchObject({ name: "ProviderError" });
  });

  test("threads the signal through as the SDK options arg", async () => {
    const controller = new AbortController();
    const getCredits = vi.fn(() => Promise.resolve({ data: { totalCredits: 0, totalUsage: 0 } }));
    const client: CreditsClient = { credits: { getCredits } };
    await getOpenRouterCredits(client, controller.signal);
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
    expect(await getOpenRouterGenerationCost(client, "gen-1")).toEqual({
      totalCost: 0.012,
      tokensPrompt: 100,
      tokensCompletion: 40,
    });
  });

  test("threads the signal through as the SDK options arg", async () => {
    const controller = new AbortController();
    const getGeneration = vi.fn(() => Promise.resolve({ data: { totalCost: 0, tokensPrompt: 0, tokensCompletion: 0 } }));
    const client: GenClient = { generations: { getGeneration } };
    await getOpenRouterGenerationCost(client, "gen-1", controller.signal);
    expect(getGeneration).toHaveBeenCalledWith({ id: "gen-1" }, { signal: controller.signal });
  });
});
