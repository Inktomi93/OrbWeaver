import { EMBEDDING_FLOOR, modelIdSchema } from "@orb/contracts/inference";
import { createScheduledCache } from "../../../../packages/inference/src/backends/local-light/scheduled-cache.ts";
import { createLocalLightEmbed } from "../../../../packages/inference/src/backends/local-light/tasks.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeModelCache, fakeResolved } from "../../_support.ts";

const MODEL = modelIdSchema.parse("orb-test/model");

test("a query waits for the active call, then runs before the remaining indexing batches", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const calls: string[][] = [];
  const cache = createScheduledCache({
    ...fakeModelCache(),
    embedTexts: async (_model, inputs) => {
      calls.push([...inputs]);
      if (calls.length === 1) {
        entered.resolve();
        await release.promise;
      }
      return inputs.map(() => Float32Array.of(1, 0));
    },
  });
  const embed = createLocalLightEmbed(cache, (id) => id);
  const connection = fakeResolved({ task: "embed", providerId: "local-light", model: MODEL, capability: { kind: "embedding", embedding: EMBEDDING_FLOOR } });
  const documents = Array.from({ length: 9 }, (_, i) => `card ${i}`);
  const indexing = embed({ connection, input: documents, inputType: "document" });
  await entered.promise;
  const query = embed({ connection, input: "find a character", inputType: "query" });
  await Promise.resolve();
  expect(calls).toEqual([documents.slice(0, 4)]);
  release.resolve();
  const [indexed, found] = await Promise.all([indexing, query]);
  expect(calls).toEqual([documents.slice(0, 4), ["find a character"], documents.slice(4, 8), documents.slice(8)]);
  expect(indexed.vectors).toHaveLength(documents.length);
  expect(found.vectors).toEqual([Float32Array.of(1, 0)]);
});

test("length grouping preserves caller order and bounds padded batches", async () => {
  const calls: string[][] = [];
  const cache = createScheduledCache({
    ...fakeModelCache(),
    embedTexts: (_model, inputs) => {
      calls.push([...inputs]);
      return Promise.resolve(inputs.map((text) => Float32Array.of(text.length)));
    },
  });
  const texts = ["a".repeat(10_000), "bb", "ccc", "d", "e".repeat(9999)];
  const rows = await cache.embedTexts(MODEL, texts);
  expect(rows.map((row) => row[0])).toEqual(texts.map((text) => text.length));
  expect(calls.map((batch) => batch.map((text) => text.length))).toEqual([[1, 2], [3], [9999], [10_000]]);
});

test("a held inference bounds every other model operation and queued failures do not poison the queue", async () => {
  const held = Promise.withResolvers<Float32Array[]>();
  const entered = Promise.withResolvers<void>();
  let imageCalls = 0;
  const cache = createScheduledCache({
    ...fakeModelCache(),
    embedTexts: () => {
      entered.resolve();
      return held.promise;
    },
    embedImages: () => {
      imageCalls += 1;
      return Promise.resolve([Float32Array.of(7)]);
    },
  });
  const first = cache.embedTexts(MODEL, ["hello"]);
  const refused = first.catch((error: Error) => error.message);
  await entered.promise;
  const image = cache.embedImages(MODEL, [new Uint8Array([1])]);
  await Promise.resolve();
  expect(imageCalls).toBe(0);
  held.reject(new Error("encoder failure"));
  expect(await refused).toBe("encoder failure");
  expect((await image)[0]?.[0]).toBe(7);
  expect(imageCalls).toBe(1);
});
