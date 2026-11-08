// @subject tests/support/node/corpus.ts
// A worker's default corpus roots share one committed template and its parsed wire: no root can change what the
// next one reads, and a failed template build reds only the root that met it.

import { __failNextCorpusTemplateForTest } from "./corpus.ts";
import { createCorpusHarness, expect, test } from "./fixtures.ts";

test("a root that writes to the shared corpus wire fails at the write, and the next root reads the original", { tags: "slow" }, async () => {
  let original: unknown;
  let count = 0;
  {
    await using first = await createCorpusHarness();
    const { reads } = first.corpus.wire;
    original = reads["sessions.me"];
    count = reads["sessions.me"].length;
    // Object.assign reaches writes the readonly types refuse; the case is that the runtime refuses them too.
    expect(() => Object.assign(reads, { "sessions.me": [] })).toThrow(TypeError);
    expect(() => Object.assign(reads["sessions.me"], { length: 0 })).toThrow(TypeError);
  }
  await using next = await createCorpusHarness();
  expect(count).toBeGreaterThan(0);
  expect(next.corpus.wire.reads["sessions.me"]).toBe(original);
  expect(next.corpus.wire.reads["sessions.me"]).toHaveLength(count);
});

test("a failed template build is not kept, so the next root builds it again", { tags: "slow" }, async () => {
  const planted = new Error("planted corpus template failure");
  __failNextCorpusTemplateForTest(planted);
  await expect(createCorpusHarness()).rejects.toBe(planted);
  await using next = await createCorpusHarness();
  expect(next.corpus.wire.reads["sessions.me"][0]?.output.userId).toBe(next.ownerId);
});
