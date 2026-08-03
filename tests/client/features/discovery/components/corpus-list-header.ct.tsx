// CT: the Corpus LIST chrome-band header (north-star §6.3 N1/N2) — the section identity that fills the
// `.shell-panel-header` band via the `listHeader` mint slot. Pins the new band channel: it names the
// section ("Corpus") and renders the distilled-card count as a quiet mono readout; a zero count renders
// the title alone (no "0"). The count reads the shared `discovery.catalog` cache.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { CorpusListHeaderStory } from "../_ct-stories.tsx";

test("the LIST band names the corpus and shows the distilled count", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.catalog": { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 12 } });
  const component = await mount(<CorpusListHeaderStory />);

  await expect(component.getByText("Corpus")).toBeVisible();
  await expect(component.getByText("12")).toBeVisible();
});

test("a zero distilled count renders the title alone, no number", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.catalog": { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 0 } });
  const component = await mount(<CorpusListHeaderStory />);

  await expect(component.getByText("Corpus")).toBeVisible();
  await expect(component.getByText("0")).toHaveCount(0);
});
