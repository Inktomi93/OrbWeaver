// Corpus workspace state CT (D271) — drives the real stores through their module actions and reads what the
// SHELL reads off `corpusSectionSelection`: is a subject open for the ACTIVE mode, and where a phone lands.
// A CT (not a plain unit test) because the read surface is reactive hooks, and useSyncExternalStore needs a
// real browser render (the character-selection-store.ct.tsx posture).

import { expect, test } from "@playwright/experimental-ct-react";
import { CorpusSelectionProbe } from "./_ct-stories.tsx";

test("select sets the id; clear resets to none", async ({ mount }) => {
  const probe = await mount(<CorpusSelectionProbe />);
  const state = probe.locator("output");
  // Fresh page → nothing selected (the Corpus CONTENT shows the overview home).
  await expect(state).toContainText("corpus=none");

  await probe.getByRole("button", { name: "select corpus character" }).click();
  await expect(state).toContainText("corpus=char_corpus_probe");

  await probe.getByRole("button", { name: "clear corpus selection" }).click();
  await expect(state).toContainText("corpus=none");
});

// A mode switch releases the reader's "close the list" request, or a phone switching from the Explore
// overview into Labels would stay on CONTENT instead of landing on the Labels finder.
test("switching mode releases a closed-list request so the new mode's landing applies", async ({ mount }) => {
  const probe = await mount(<CorpusSelectionProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "close the list" }).click();
  await expect(state).toContainText("overlay=none");

  await probe.getByRole("button", { name: "mode labels" }).click();
  await expect(state).toContainText("mode=labels");
  await expect(state).toContainText("overlay=null");
});
