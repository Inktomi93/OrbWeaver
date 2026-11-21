// A ThemeScope hands the D159 form-control edge fallback it took to the reporter context a host provides, once per scope and fallback.

import { EDGE_FALLBACK_SCOPE } from "@orb/testkit/iso";
import type { InputBorderFallback } from "@orb/ui/theme-scope";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import type { FallbackDeliveryStory } from "./_fallback-delivery-stories.tsx";

// The reporter log crosses the page as JSON; the reader is pinned to the production fallback type it parses.
const EDGE_LOG = z.array(z.object({ edge: z.string(), floorMet: z.boolean() }) satisfies z.ZodType<InputBorderFallback>);

const STORY = "tests/ui/content/theme-scope/_fallback-delivery-stories/FallbackDeliveryStory";

test("the reporter receives its scope's fallback exactly once", async ({ mount, page }) => {
  await mount<typeof FallbackDeliveryStory>(STORY, EDGE_FALLBACK_SCOPE);
  const edge = page.locator('[data-slot="edge-log"]');
  await expect(edge).not.toHaveText("[]");
  const edgeLog = EDGE_LOG.parse(JSON.parse((await edge.textContent()) ?? "[]"));
  expect(edgeLog).toHaveLength(1);
  expect(edgeLog[0]?.floorMet).toBe(true);
});
