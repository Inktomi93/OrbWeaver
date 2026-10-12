// CT: the #791 composer arg-hint strip's own contract — no offers renders no strip, offers render as
// role="option" rows in a named inline listbox, and picking a row reports THAT offer through onPick (the
// id-match the leaf does before it calls back, so the composer stays a dumb `/<id> <insert>` setter).

import { expect, test } from "@playwright/experimental-ct-react";
import { ComposerArgHintStripStory } from "../_ct-stories.tsx";

test("no offers renders no arg strip", async ({ mount }) => {
  const component = await mount(<ComposerArgHintStripStory empty={true} />);
  await expect(component.getByRole("listbox", { name: "Command arguments" })).toHaveCount(0);
});

test("offers render as options and picking one reports that offer", async ({ mount }) => {
  const component = await mount(<ComposerArgHintStripStory />);

  await expect(component.getByRole("listbox", { name: "Command arguments" })).toBeVisible();
  await expect(component.getByRole("option")).toHaveCount(2);
  await expect(component.getByRole("option", { name: "tone" })).toBeVisible();

  await component.getByRole("option", { name: "count" }).click();
  await expect(component.getByTestId("picked-offer")).toHaveText("count");
});
