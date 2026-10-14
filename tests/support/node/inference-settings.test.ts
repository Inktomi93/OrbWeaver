// @subject tests/support/iso/endpoint-features.ts
// @subject tests/support/iso/prompt-cache-settings.ts

import { SHIPPED_PROMPT_CACHE, WIRE_DEFAULT_FEATURES } from "@orb/contracts/inference";
import { makeEndpointFeatures } from "@orb/testkit/iso/endpoint-features.ts";
import { makePromptCacheSettings } from "@orb/testkit/iso/prompt-cache-settings.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("a single concurrency override cannot erase the other wire defaults", () => {
  const features = makeEndpointFeatures({ concurrency: { embed: 1 } });
  expect(features.concurrency).toEqual({ ...WIRE_DEFAULT_FEATURES.concurrency, embed: 1 });
  expect(() => makeEndpointFeatures({ concurrency: { embed: 0 } })).toThrow();
});

test("cache preference overrides preserve shipped siblings and cannot loosen the depth bound", () => {
  const preferences = makePromptCacheSettings({ enabled: !SHIPPED_PROMPT_CACHE.enabled });
  expect(preferences).toEqual({ ...SHIPPED_PROMPT_CACHE, enabled: !SHIPPED_PROMPT_CACHE.enabled });
  expect(() => makePromptCacheSettings({ historyDepth: 0 })).toThrow();
});
