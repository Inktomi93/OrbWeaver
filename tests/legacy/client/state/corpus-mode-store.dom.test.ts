import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { getCorpusMode, healCorpusModeFrom, subscribeCorpusMode, writeCorpusMode } from "#client/state/corpus-mode-store.ts";

test("mode subscribers observe writes and healing, and unsubscribe releases the observer", () => {
  writeCorpusMode("explore");
  const observed: string[] = [];
  const unsubscribe = subscribeCorpusMode(() => observed.push(getCorpusMode()));
  try {
    writeCorpusMode("labels");
    healCorpusModeFrom("analytics");
    healCorpusModeFrom("corpus");
    expect(getCorpusMode()).toBe("insights");
    expect(observed).toEqual(["labels", "insights"]);
  } finally {
    unsubscribe();
  }
  writeCorpusMode("explore");
  expect(observed).toEqual(["labels", "insights"]);
});
