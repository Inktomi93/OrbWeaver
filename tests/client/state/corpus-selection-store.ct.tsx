// corpus-selection store CT — drives the hook-backed store through its module actions and asserts the
// read hook reflects each transition (the Corpus LIST/dossier selection drives the Corpus CONTENT; kept
// distinct from the Characters editor selection). A CT (not a plain unit test) because the store's only
// read surface is the reactive `useSelectedCorpusCharacterId` hook — useSyncExternalStore needs a real
// browser render (the character-selection-store.ct.tsx posture).

import { expect, test } from "@playwright/experimental-ct-react";
import { CorpusSelectionProbe } from "./_ct-stories.tsx";

test("select sets the id; clear resets to none", async ({ mount }) => {
  const probe = await mount(<CorpusSelectionProbe />);
  const state = probe.locator("output");
  // Fresh page → nothing selected (the Corpus CONTENT shows the overview home).
  await expect(state).toHaveText("corpus=none");

  await probe.getByRole("button", { name: "select corpus character" }).click();
  await expect(state).toHaveText("corpus=char_corpus_probe");

  await probe.getByRole("button", { name: "clear corpus selection" }).click();
  await expect(state).toHaveText("corpus=none");
});
