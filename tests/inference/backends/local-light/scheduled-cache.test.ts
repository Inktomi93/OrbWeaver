import { modelIdSchema } from "@orb/contracts/inference";
import { createScheduledCache } from "../../../../packages/inference/src/backends/local-light/scheduled-cache.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeModelCache } from "../../_support.ts";

const MODEL = modelIdSchema.parse("orb-test/model");

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
