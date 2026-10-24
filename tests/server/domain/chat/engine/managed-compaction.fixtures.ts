// The managed-compaction threshold search: bisect the canon length at which a real marker first lands.
// A caller that records a system prompt first supplies its own probe and the room grows by that turn.
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { ProviderError } from "@orb/inference";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect } from "@orb/testkit/node";
import { sdkEngineRoom } from "./engine-physical.ts";
import { ENGINE_SDK_MARKER } from "./engine-sdk-physical.mjs";

/** A bootstrap turn run before the measured one; `count` is the room's canon length after it. */
export type RecordedSystemProbe = (fixture: Awaited<ReturnType<typeof sdkEngineRoom>>, count: number, heavy: boolean) => Promise<void>;

export interface ThresholdSearch {
  readonly foregroundFails: boolean;
  readonly heavy?: boolean;
  readonly record?: RecordedSystemProbe;
  readonly observe?: (nativeExchanges: number) => void;
}

async function markerAt(count: number, search: ThresholdSearch): Promise<{ readonly compacted: boolean; readonly nativeExchanges: number }> {
  const heavy = search.heavy === true;
  await using fixture = await sdkEngineRoom({
    history: search.record === undefined ? count : count - 1,
    window: 8192,
    characters: [createCharacterSchema.parse({ handle: "priced-keeper", name: "Aria", description: heavy ? "word ".repeat(2000) : "A bold knight." })],
    promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, maxOutputTokens: 100, compaction: { mode: "managed" } } }),
  });
  await search.record?.(fixture, count, heavy);
  fixture.setPolicy({ foreground: search.foregroundFails ? "fail" : "reply" });
  const [result] = await Promise.allSettled([fixture.turn()]);
  const expected = search.foregroundFails ? { status: "rejected", reason: expect.any(ProviderError) } : { status: "fulfilled", value: { aborted: false } };
  expect(result).toMatchObject(expected);
  await fixture.h.root.settleBackground();
  return { compacted: (await fixture.marker()).compactSummary === ENGINE_SDK_MARKER, nativeExchanges: fixture.receipts.length };
}

/** The smallest canon length whose turn lands a marker, by bisection over real rooms. */
export async function firstCompactingRows(search: ThresholdSearch): Promise<number> {
  let low = 9;
  let high = 160;
  while (low < high) {
    const count = Math.floor((low + high) / 2);
    const sample = await markerAt(count, search);
    search.observe?.(sample.nativeExchanges);
    if (sample.compacted) {
      high = count;
    } else {
      low = count + 1;
    }
  }
  expect(low).toBeLessThan(160);
  return low;
}
