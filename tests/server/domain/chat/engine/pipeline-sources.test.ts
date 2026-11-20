// @subject packages/server/src/domain/chat/engine/pipeline.ts
// A tool-loop turn is SEVERAL model calls whose replies are concatenated into one stored reply. A citation's span
// is an offset into the leg that produced it, so the earlier leg's spans must shift by exactly the prose now in
// front of them — otherwise the stored offsets point into the wrong part of the turn's own text.

import { expect, test } from "@orb/testkit/node";
import type { TurnEconomics } from "#server/domain/chat/contract/results.ts";
import { aggregateEconomics } from "#server/domain/chat/engine/pipeline.ts";

test("an earlier leg's cited spans shift by the prose the next leg appended in front of them", () => {
  const first: TurnEconomics = { content: "Alpha ", sources: [{ url: "https://example.test/a", atChars: 0, endChars: 5 }] };
  const second: TurnEconomics = { content: "beta.", sources: [{ url: "https://example.test/b", atChars: 0 }] };
  expect(aggregateEconomics(first, second)?.sources).toEqual([
    { url: "https://example.test/a", atChars: 6, endChars: 11 },
    { url: "https://example.test/b", atChars: 0 },
  ]);
});

// The spread-if-present discipline survives aggregation: two legs that cited nothing write no key at all.
test("legs that cited nothing leave the aggregate without a sources key", () => {
  const aggregated = aggregateEconomics({ content: "Alpha " }, { content: "beta." });
  expect(aggregated).not.toBeNull();
  expect(Object.hasOwn(aggregated ?? {}, "sources")).toBe(false);
});
