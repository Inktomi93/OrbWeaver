// backends/openrouter account — the diagnostic account verbs (credit balance + per-generation cost). The
// SDK client is a fake.

import { getOpenRouterCredits, getOpenRouterGenerationCost } from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

type CreditsClient = Parameters<typeof getOpenRouterCredits>[0];
type GenClient = Parameters<typeof getOpenRouterGenerationCost>[0];

describe("getOpenRouterCredits", () => {
  test("maps total + used off the credits data", async () => {
    const client = {
      credits: {
        getCredits: (): Promise<unknown> => Promise.resolve({ data: { totalCredits: 10, totalUsage: 3 } }),
      },
    } as unknown as CreditsClient;
    expect(await getOpenRouterCredits(client)).toEqual({ total: 10, used: 3 });
  });

  test("a failure becomes a typed ProviderError", async () => {
    const client = {
      credits: { getCredits: (): Promise<unknown> => Promise.reject(new Error("boom")) },
    } as unknown as CreditsClient;
    await expect(getOpenRouterCredits(client)).rejects.toMatchObject({ name: "ProviderError" });
  });
});

describe("getOpenRouterGenerationCost", () => {
  test("maps the cost + token counts off the generation data", async () => {
    const client = {
      generations: {
        getGeneration: (): Promise<unknown> =>
          Promise.resolve({
            data: { totalCost: 0.012, tokensPrompt: 100, tokensCompletion: 40 },
          }),
      },
    } as unknown as GenClient;
    expect(await getOpenRouterGenerationCost(client, "gen-1")).toEqual({
      totalCost: 0.012,
      tokensPrompt: 100,
      tokensCompletion: 40,
    });
  });
});
