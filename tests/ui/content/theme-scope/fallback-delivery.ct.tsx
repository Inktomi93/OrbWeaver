// A ThemeScope hands the fallback it took to the reporter contexts a host provides: once per scope and fallback, for both
// the D336 primary fallback and the D159 form-control edge fallback.

import { EDGE_FALLBACK_SCOPE, TONE_FALLBACK_SCOPE } from "@orb/testkit/iso";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import type { FallbackDeliveryStory } from "./_fallback-delivery-stories.tsx";

const STORY = "tests/ui/content/theme-scope/_fallback-delivery-stories/FallbackDeliveryStory";

test("each reporter receives its scope's fallback exactly once", async ({ mount, page }) => {
  await mount<typeof FallbackDeliveryStory>(STORY, { ...TONE_FALLBACK_SCOPE, ...EDGE_FALLBACK_SCOPE });
  const tone = page.locator('[data-slot="tone-log"]');
  const edge = page.locator('[data-slot="edge-log"]');
  await expect(tone).not.toHaveText("[]");
  await expect(edge).not.toHaveText("[]");
  const toneLog = z.array(z.object({ accent: z.string(), hover: z.number(), active: z.number() })).parse(JSON.parse((await tone.textContent()) ?? "[]"));
  const edgeLog = z.array(z.object({ edge: z.string(), floorMet: z.boolean() })).parse(JSON.parse((await edge.textContent()) ?? "[]"));
  expect(toneLog).toHaveLength(1);
  expect(edgeLog).toHaveLength(1);
  expect(toneLog[0]?.active).toBeGreaterThan(0);
  expect(edgeLog[0]?.floorMet).toBe(true);
});
