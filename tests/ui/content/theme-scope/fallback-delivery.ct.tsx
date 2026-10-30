// A ThemeScope hands the fallback it took to the reporter contexts a host provides: once per scope and fallback, for both
// the D336 primary fallback and the D159 form-control edge fallback.
import { expect, test } from "@playwright/test";
import type { FallbackDeliveryStory } from "./_fallback-delivery-stories.tsx";
import { EDGE_FALLBACK_SCOPE, TONE_FALLBACK_SCOPE } from "./fallback-cases.ts";

const STORY = "tests/ui/content/theme-scope/_fallback-delivery-stories/FallbackDeliveryStory";

test("each reporter receives its scope's fallback exactly once", async ({ mount, page }) => {
  await mount<typeof FallbackDeliveryStory>(STORY, { ...TONE_FALLBACK_SCOPE, ...EDGE_FALLBACK_SCOPE });
  const tone = page.locator('[data-slot="tone-log"]');
  const edge = page.locator('[data-slot="edge-log"]');
  await expect(tone).not.toHaveText("[]");
  await expect(edge).not.toHaveText("[]");
  const toneLog = JSON.parse((await tone.textContent()) ?? "[]") as readonly { readonly accent: string; readonly hover: number; readonly active: number }[];
  const edgeLog = JSON.parse((await edge.textContent()) ?? "[]") as readonly { readonly edge: string; readonly floorMet: boolean }[];
  expect(toneLog).toHaveLength(1);
  expect(edgeLog).toHaveLength(1);
  expect(toneLog[0]?.active).toBeGreaterThan(0);
  expect(edgeLog[0]?.floorMet).toBe(true);
});
