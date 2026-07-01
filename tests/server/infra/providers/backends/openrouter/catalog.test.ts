// backends/openrouter catalog — the live /models fetch verb: Model → ModelCatalogEntry normalization and
// the blank-price → null rule (a blank string means "unpriced", NOT free). The SDK client is a fake.

import { fetchOrCatalog } from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

type CatalogClient = Parameters<typeof fetchOrCatalog>[0];

describe("fetchOrCatalog", () => {
  test("normalizes models; a blank price → null (unpriced, NOT free)", async () => {
    const client = {
      models: {
        list: (): Promise<unknown> =>
          Promise.resolve({
            data: [
              {
                id: "anthropic/claude-opus-4-5",
                name: "Claude Opus 4.5",
                contextLength: 200_000,
                pricing: { prompt: "0.000015", completion: "0.000075", inputCacheRead: "" },
                architecture: { inputModalities: ["text", "image"] },
                supportedParameters: ["reasoning", "temperature"],
              },
            ],
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
    expect(entry?.supportedParameters).toEqual(["reasoning", "temperature"]);
  });

  test("falls back to the id when name is empty", async () => {
    const client = {
      models: {
        list: (): Promise<unknown> =>
          Promise.resolve({
            data: [
              {
                id: "x/y",
                name: "",
                contextLength: null,
                pricing: { prompt: "1", completion: "2" },
                architecture: { inputModalities: [] },
                supportedParameters: [],
              },
            ],
          }),
      },
    } as unknown as CatalogClient;
    const [entry] = await fetchOrCatalog(client);
    expect(entry?.name).toBe("x/y");
    expect(entry?.contextLength).toBeNull();
  });

  test("a transport failure becomes a typed ProviderError", async () => {
    const client = {
      models: { list: (): Promise<unknown> => Promise.reject(new Error("network down")) },
    } as unknown as CatalogClient;
    await expect(fetchOrCatalog(client)).rejects.toMatchObject({ name: "ProviderError" });
  });
});
