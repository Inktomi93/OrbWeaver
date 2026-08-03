// CT: the Corpus CONTEXT-panel band identity (north-star §6.3 N4/P4) — the section identity fed through
// the `defineContextTabs` `header` mint slot. Pins the new header channel: the band names the section
// ("Corpus") + its distilled-card count (a quiet mono readout), replacing the neutral "Details" fallback,
// so the panel reads as a titled analytics surface (and carries the zone-scoped ember top edge).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { CorpusContextHeaderStory } from "../_ct-stories.tsx";

test("the CONTEXT band names the corpus and shows the distilled count", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.catalog": { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 7 } });
  const component = await mount(<CorpusContextHeaderStory />);

  await expect(component.getByText("Corpus")).toBeVisible();
  await expect(component.getByText("7")).toBeVisible();
});
