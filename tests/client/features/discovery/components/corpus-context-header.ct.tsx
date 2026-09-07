// CT: the Corpus CONTEXT-panel band identity (north-star §6.3 N4/P4) — the section identity fed through
// the `defineContextTabs` `header` mint slot. Pins the new header channel: the band names the section
// ("Corpus") + its distilled-card count (a quiet mono readout), replacing the neutral "Details" fallback,
// so the panel reads as a titled analytics surface (and carries the zone-scoped ember top edge).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { CorpusContextHeaderStory } from "../_ct-stories.tsx";

// THE COUNT NAMES ITS BASE, and it is the SAME projection the LIST band uses (issue #535) — the two bands
// of one section printed the same bare `313` in one viewport beside an h1 saying "327 characters".
test("the CONTEXT band names the corpus and states the distilled count out of the library", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.catalog": { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 7, totalCharacters: 9 } });
  const component = await mount(<CorpusContextHeaderStory />);

  await expect(component.getByText("Corpus")).toBeVisible();
  await expect(component.getByText("7 of 9")).toBeVisible();
});

// A FAILED CATALOG READ IS NOT A ZERO CENSUS (#1500). `catalog?.totalDistilled ?? 0` hid a failed read
// behind the same silence as a library with nothing distilled: the band simply lost its number. The failure
// now states itself and carries the re-read — a button, because a band has no other way to offer one.
test("a FAILED catalog read says the census is unavailable and its retry re-reads (#1500)", async ({ mount, page }) => {
  let attempts = 0;
  const catalog = { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 7, totalCharacters: 9 };
  const trpc = await routeTrpc(page, {
    "discovery.catalog": () => (attempts++ === 0 ? trpcError({ message: "catalog read failed" }) : catalog),
  });
  const component = await mount(<CorpusContextHeaderStory />);

  const retry = component.getByRole("button", { name: "Census unavailable — retry" });
  await expect(retry).toBeVisible();
  await retry.click();

  await expect.poll(() => trpc.count("discovery.catalog"), { intervals: [20, 50, 100] }).toBe(2);
  await expect(component.getByText("7 of 9")).toBeVisible();
});
