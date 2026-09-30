import { expect, test } from "@playwright/experimental-ct-react";
import { CorpusSelectionProbe, LabelSelectionProbe } from "./_ct-stories.tsx";

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

test("finder selection and clear release the list overlay", async ({ mount }) => {
  const probe = await mount(<LabelSelectionProbe />);
  await probe.getByRole("button", { name: "open list overlay" }).click();
  await probe.getByRole("button", { name: "select label from list" }).click();
  await expect(probe.locator("output")).toHaveText("selected=tag_label_probe focus=none overlay=null");
  await probe.getByRole("button", { name: "open list overlay" }).click();
  await probe.getByRole("button", { name: "clear label" }).click();
  await expect(probe.locator("output")).toHaveText("selected=none focus=none overlay=null");
});
