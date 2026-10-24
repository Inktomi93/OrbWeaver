import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { beforeAll, describe } from "vitest";
import { sdkEngineRoom } from "./engine-physical.ts";
import { ENGINE_SDK_MARKER } from "./engine-sdk-physical.mjs";
import { firstCompactingRows } from "./managed-compaction.fixtures.ts";

describe("the measured pre-turn threshold", () => {
  // The search is the shared input both offsets read, so it runs once here instead of inside whichever case runs first.
  const measured = Promise.withResolvers<number>();
  beforeAll(async () => {
    measured.resolve(await firstCompactingRows({ foregroundFails: true }));
  });

  for (const offset of [-1, 0]) {
    test(`the actual pre-turn threshold ${offset === -1 ? "one-row-short refusal" : "crossing row"} is stable`, async () => {
      const threshold = await measured.promise;
      await using fixture = await sdkEngineRoom({
        history: threshold + offset,
        window: 8192,
        policy: { foreground: "fail" },
        promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, maxOutputTokens: 100, compaction: { mode: "managed" } } }),
      });
      await expect(fixture.turn()).toThrowProviderError("server");
      expect((await fixture.marker()).compactSummary).toBe(offset === -1 ? null : ENGINE_SDK_MARKER);
      expect(fixture.receipts.filter(({ marker }) => marker)).toHaveLength(offset === -1 ? 0 : 1);
    });
  }
});
