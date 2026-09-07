// CT: the Corpus LIST chrome-band header (north-star §6.3 N1/N2) — the section identity that fills the
// `.shell-panel-header` band via the `listHeader` mint slot. Pins the new band channel: it names the
// section ("Corpus") and renders the distilled-card count as a quiet mono readout; a zero count renders
// the title alone (no "0"). The count reads the shared `discovery.catalog` cache.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CorpusListHeaderStory } from "../_ct-stories.tsx";

// AND THE COUNT NAMES ITS BASE (issue #535). The band printed a bare `CORPUS 313` beside an overview h1
// reading "327 characters" — two true numbers of two different things, one of them unlabelled. The census
// is asserted through the RENDERED band text, not through the projection, because the defect was what a
// reader met: a number with no denominator.
test("the LIST band names the corpus and states the distilled count out of the library", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.catalog": { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 12, totalCharacters: 20 } });
  const component = await mount(<CorpusListHeaderStory />);

  await expect(component.getByText("Corpus")).toBeVisible();
  await expect(component.getByText("12 of 20")).toBeVisible();
});

// A denominator that equals its numerator says nothing and costs a 48px chrome row eight characters.
test("a fully distilled library prints the bare count, with no denominator", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.catalog": { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 12, totalCharacters: 12 } });
  const component = await mount(<CorpusListHeaderStory />);

  await expect(component.getByText("12")).toBeVisible();
  await expect(component.getByText("of")).toHaveCount(0);
});

test("a zero distilled count renders the title alone, no number", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.catalog": { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 0, totalCharacters: 0 } });
  const component = await mount(<CorpusListHeaderStory />);

  await expect(component.getByText("Corpus")).toBeVisible();
  await expect(component.getByText("0")).toHaveCount(0);
});
