// CT: the group-config form (group-config-form.tsx, P3). PURE + immediate-commit — seeded with
// DEFAULT_GROUP_CONFIG, each control writes the WHOLE rebuilt config through `onSave` (the story renders
// the last saved config into the `group-config-saved` readout). Proves: the output discriminator switches
// the arm (+ re-derives the coupled speakerTags default), the always-visible toggles commit, and the
// Advanced disclosure reveals policy / member-visibility / auto-mode (with card-scope on per-speaker).

import { expect, test } from "@playwright/experimental-ct-react";
import { GroupConfigFormStory } from "../_ct-stories";

const SAVED = '[data-testid="group-config-saved"]';

test("renders the output discriminator + the always-visible toggles", async ({ mount }) => {
  const component = await mount(<GroupConfigFormStory />);

  await expect(component.getByRole("button", { name: "Per-speaker" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Narrator" })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Label each speaker" })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Group nudge" })).toBeVisible();
});

test("switching output to narrator rebuilds the arm + re-derives the coupled speakerTags default", async ({
  mount,
}) => {
  const component = await mount(<GroupConfigFormStory />);

  await component.getByRole("button", { name: "Narrator" }).click();

  // The whole object is rebuilt onto the narrator arm; speakerTags' default couples to narrator (true).
  await expect(component.locator(SAVED)).toContainText('"output":"narrator"');
  await expect(component.locator(SAVED)).toContainText('"speakerTags":true');
});

test("toggling group-nudge commits the whole config", async ({ mount }) => {
  const component = await mount(<GroupConfigFormStory />);

  // DEFAULT groupNudge is true → toggle off.
  await component.getByRole("switch", { name: "Group nudge" }).click();
  await expect(component.locator(SAVED)).toContainText('"groupNudge":false');
});

test("the Advanced disclosure reveals policy · member-visibility · auto-mode", async ({
  mount,
}) => {
  const component = await mount(<GroupConfigFormStory />);

  // Hidden at rest (progressive disclosure).
  await expect(component.getByRole("combobox", { name: "Who speaks each round" })).toHaveCount(0);

  await component.getByRole("button", { name: "Advanced" }).click();

  await expect(component.getByRole("combobox", { name: "Who speaks each round" })).toBeVisible();
  await expect(
    component.getByRole("combobox", { name: "How much of each member the others see" }),
  ).toBeVisible();
  await expect(component.getByRole("switch", { name: "Auto-mode" })).toBeVisible();
  // Card-scope shows on the per-speaker default (narrator has no per-speaker card scope).
  await expect(component.getByRole("switch", { name: "Scoped cards" })).toBeVisible();
});
