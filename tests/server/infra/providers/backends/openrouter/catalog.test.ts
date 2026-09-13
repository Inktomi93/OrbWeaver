// backends/openrouter catalog — the live /models fetch verb: Model → ModelCatalogEntry normalization and
// the blank-price → null rule (a blank string means "unpriced", NOT free). The SDK client is a fake.

import { fetchOrCatalog } from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

type CatalogClient = Parameters<typeof fetchOrCatalog>[0];

describe("fetchOrCatalog", () => {
  test("normalizes models; a blank price → null (unpriced, NOT free)", async () => {
    // @orb-waive no-test-fabrication(unknown): hand-built fake vendor SDK client — the verb only calls `models.list`. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const client = {
      models: {
        list: (): Promise<unknown> =>
          Promise.resolve({
            result: {
              data: [
                {
                  id: "anthropic/claude-opus-4-5",
                  name: "Claude Opus 4.5",
                  contextLength: 200_000,
                  pricing: { prompt: "0.000015", completion: "0.000075", inputCacheRead: "" },
                  architecture: { inputModalities: ["text", "image"], outputModalities: ["text"] },
                  supportedParameters: ["reasoning", "temperature"],
                  topProvider: { maxCompletionTokens: 64_000, isModerated: true },
                  reasoning: {
                    mandatory: false,
                    defaultEnabled: true,
                    supportedEfforts: ["high", "medium", "low", null],
                    defaultEffort: "high",
                    supportsMaxTokens: true,
                  },
                },
              ],
            },
          }),
      },
    } as unknown as CatalogClient;
    const [entry] = await fetchOrCatalog(client);
    expect(entry?.id).toBe("anthropic/claude-opus-4-5");
    expect(entry?.contextLength).toBe(200_000);
    expect(entry?.promptPrice).toBe(0.000_015);
    expect(entry?.completionPrice).toBe(0.000_075);
    expect(entry?.cacheReadPrice).toBeNull(); // blank string → null, not 0
    expect(entry?.cacheWritePrice).toBeNull(); // absent → null
    expect(entry?.inputModalities).toEqual(["text", "image"]);
    expect(entry?.outputModalities).toEqual(["text"]); // GAP-3: outputModalities carried through
    expect(entry?.supportedParameters).toEqual(["reasoning", "temperature"]);
    expect(entry?.maxCompletionTokens).toBe(64_000); // the top provider's REAL output cap
    expect(entry?.reasoning).toEqual({
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ["high", "medium", "low"], // R0: stray nulls dropped
      defaultEffort: "high",
      supportsMaxTokens: true,
    });
    expect(entry?.isModerated).toBe(true); // R2: the top provider's moderation flag
  });

  test("falls back to the id when name is empty", async () => {
    // @orb-waive no-test-fabrication(unknown): hand-built fake vendor SDK client — the verb only calls `models.list`. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const client = {
      models: {
        list: (): Promise<unknown> =>
          Promise.resolve({
            result: {
              data: [
                {
                  id: "x/y",
                  name: "",
                  contextLength: null,
                  pricing: { prompt: "1", completion: "2" },
                  architecture: { inputModalities: [], outputModalities: [] },
                  supportedParameters: [],
                  topProvider: {},
                },
              ],
            },
          }),
      },
    } as unknown as CatalogClient;
    const [entry] = await fetchOrCatalog(client);
    expect(entry?.name).toBe("x/y");
    expect(entry?.contextLength).toBeNull();
    expect(entry?.maxCompletionTokens).toBeNull(); // absent top_provider.max_completion_tokens → null (resolver then estimates)
    expect(entry?.reasoning).toBeNull(); // R0: omitted reasoning → null (family fallback)
  });

  test("a transport failure becomes a typed ProviderError", async () => {
    // @orb-waive no-test-fabrication(unknown): hand-built fake vendor SDK client — the verb only calls `models.list`. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const client = {
      models: { list: (): Promise<unknown> => Promise.reject(new Error("network down")) },
    } as unknown as CatalogClient;
    await expect(fetchOrCatalog(client)).rejects.toMatchObject({ name: "ProviderError" });
  });
});
