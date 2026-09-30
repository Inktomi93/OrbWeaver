import { expect, test } from "@playwright/experimental-ct-react";
import { LabelSelectionProbe } from "./_ct-stories.tsx";

test("focus requests are consumed without clearing the selection or list overlay", async ({ mount }) => {
  const probe = await mount(<LabelSelectionProbe />);
  await probe.getByRole("button", { name: "select label", exact: true }).click();
  await probe.getByRole("button", { name: "open list overlay" }).click();
  await probe.getByRole("button", { name: "request label focus" }).click();
  await expect(probe.locator("output")).toHaveText("selected=tag_label_probe focus=tag_label_probe overlay=list");
  await probe.getByRole("button", { name: "consume label focus" }).click();
  await expect(probe.locator("output")).toHaveText("selected=tag_label_probe focus=none overlay=list");
});
