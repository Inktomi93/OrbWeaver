// @subject tests/support/node/corpus-recipe.ts
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusProviderExecution, createCorpusProviderServer } from "./corpus-provider.ts";
import { createCorpusProviderTransport, runCorpusSnapConsumer } from "./corpus-recipe.ts";
import { expect, test } from "./fixtures.ts";

async function providerFixture(): ReturnType<typeof createCorpusProviderServer> {
  return await createCorpusProviderServer(async (baseUrl) =>
    createCorpusProviderExecution({
      baseUrl,
      modelIds: [CORPUS_EMBED_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "",
      structuredReplies: new Map(),
      images: [],
    }),
  );
}

test.each(["stage retirement refused", "marker join refused"])("unconfirmed %s keeps the physical provider and clone alive", async (reason) => {
  const directory = await mkdtemp(join(tmpdir(), "orb-corpus-retained-"));
  await using provider = await providerFixture();
  let disposed = false;
  await using resource: AsyncDisposable = {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      disposed = true;
      await provider[Symbol.asyncDispose]();
      await rm(directory, { recursive: true, force: true });
    },
  };
  const retained: string[] = [];
  try {
    await expect(
      runCorpusSnapConsumer(
        resource,
        () => Promise.resolve(0),
        () => Promise.reject(new Error(reason)),
        (message) => {
          retained.push(message);
        },
      ),
    ).resolves.toBe(2);
    expect(disposed).toBe(false);
    expect(retained).toEqual([reason]);
    await access(directory);
    const response = await fetch(`${provider.baseUrl}/models`);
    expect(response.status).toBe(200);
    await response.text();
  } finally {
    await resource[Symbol.asyncDispose]();
  }
});

test("confirmed consumer completion retires before deleting the clone and closing its provider", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orb-corpus-completed-"));
  await using provider = await providerFixture();
  const order: string[] = [];
  await using resource: AsyncDisposable = {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      order.push("dispose");
      await provider[Symbol.asyncDispose]();
      await rm(directory, { recursive: true, force: true });
    },
  };
  try {
    expect(
      await runCorpusSnapConsumer(
        resource,
        () => {
          order.push("consume");
          return Promise.resolve(0);
        },
        () => {
          order.push("retire");
          return Promise.resolve();
        },
        () => {
          order.push("retained");
        },
      ),
    ).toBe(0);
    expect(order).toEqual(["consume", "retire", "dispose"]);
    await expect(access(directory)).rejects.toThrow();
    await expect(fetch(`${provider.baseUrl}/models`, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
  } finally {
    await resource[Symbol.asyncDispose]();
  }
});

test("preparation refuses other origins and hostnames before physical fetch or address resolution", async () => {
  await using provider = await providerFixture();
  const requests: string[] = [];
  const addresses: string[] = [];
  const transport = createCorpusProviderTransport(
    provider.baseUrl,
    (input, init) => {
      requests.push(new Request(input, init).url);
      return Promise.resolve(new Response("transport witness"));
    },
    (hostname) => {
      addresses.push(hostname);
      return Promise.resolve([hostname]);
    },
  );
  await expect(transport.fetch("https://unscripted.invalid/v1/models")).rejects.toThrow("off-origin");
  await expect(transport.fetch("http://127.0.0.1:1/v1/models")).rejects.toThrow("off-origin");
  await expect(transport.fetch(provider.baseUrl.replace("127.0.0.1", "localhost"))).rejects.toThrow("off-origin");
  await expect(transport.resolver("unscripted.invalid")).rejects.toThrow("off-origin");
  expect(requests).toEqual([]);
  expect(addresses).toEqual([]);
  const native = createCorpusProviderTransport(provider.baseUrl);
  const response = await native.fetch(`${provider.baseUrl}/embeddings`, {
    method: "POST",
    body: JSON.stringify({ model: CORPUS_EMBED_MODEL, input: "native guarded witness" }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: [{ embedding: [...CORPUS_EMBEDDING_VECTOR] }] });
  expect(await native.resolver(new URL(provider.baseUrl).hostname)).toEqual(["127.0.0.1"]);
});
