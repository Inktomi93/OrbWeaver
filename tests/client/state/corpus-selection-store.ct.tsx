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

// THE PHONE LANDING IS A DECLARED POLICY, NEVER A FABRICATED SELECTION (D271): Explore and Labels land on
// their finder, Insights on its dashboard — and none of the three opens a subject to get there.
test("each mode declares its phone landing, and none fakes a selection to reach it", async ({ mount }) => {
  const probe = await mount(<CorpusSelectionProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("mode=explore");
  await expect(state).toContainText("open=false landing=list");

  await probe.getByRole("button", { name: "mode insights" }).click();
  await expect(state).toContainText("mode=insights");
  await expect(state).toContainText("open=false landing=content");
  await expect(state).toContainText("insights=none");

  await probe.getByRole("button", { name: "mode labels" }).click();
  await expect(state).toContainText("mode=labels");
  await expect(state).toContainText("open=false landing=list");
  await expect(state).toContainText("label=none");
});

// BACK RESTORATION PER MODE: each mode keeps its own subject, the shell's Back clears only the active one,
// and switching back to a mode restores the subject it had.
test("Back clears only the active mode's subject, and each mode restores its own", async ({ mount }) => {
  const probe = await mount(<CorpusSelectionProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select corpus character" }).click();
  await probe.getByRole("button", { name: "mode labels" }).click();
  await probe.getByRole("button", { name: "open label" }).click();
  await expect(state).toContainText("mode=labels");
  await expect(state).toContainText(/label=tag_\w+ open=true/u);

  await probe.getByRole("button", { name: "back" }).click();
  await expect(state).toContainText("label=none open=false");
  // Explore's dossier was never the active subject, so Back left it alone.
  await expect(state).toContainText("corpus=char_corpus_probe");

  await probe.getByRole("button", { name: "mode explore" }).click();
  await expect(state).toContainText("mode=explore");
  await expect(state).toContainText("corpus=char_corpus_probe");
  await expect(state).toContainText("open=true");

  await probe.getByRole("button", { name: "mode insights" }).click();
  await probe.getByRole("button", { name: "drill insights character" }).click();
  await expect(state).toContainText(/insights=character_\w+ label=none open=true landing=content/u);
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

// THE ANALYTICS HEAL (D271): a device that still remembers `activeSection:"analytics"` lands in Corpus with
// Insights active — not on the born default, and not on Explore. Seeded before the page's JS runs, because
// the shell store rehydrates at module init.
test("a persisted Analytics section heals to Corpus Insights", async ({ mount, page }) => {
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      "orb:shell",
      JSON.stringify({ state: { activeSection: "analytics", panelOverrides: { analytics: { list: "docked" } } }, version: 2 }),
    );
  });
  await page.reload();

  const probe = await mount(<CorpusSelectionProbe />);
  const state = probe.locator("output");
  await expect(state).toContainText("section=corpus mode=insights");
  await expect(state).toContainText("landing=content");
});

// The control for the heal above: a live section id is not a retired one, so it moves no mode.
test("a persisted live section leaves the Corpus mode at Explore", async ({ mount, page }) => {
  await page.addInitScript(() => {
    globalThis.localStorage.setItem("orb:shell", JSON.stringify({ state: { activeSection: "corpus", panelOverrides: {} }, version: 2 }));
  });
  await page.reload();

  const probe = await mount(<CorpusSelectionProbe />);
  await expect(probe.locator("output")).toContainText("section=corpus mode=explore");
});
