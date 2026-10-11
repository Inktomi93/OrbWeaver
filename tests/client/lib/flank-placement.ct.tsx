// CT: the room's flank verdicts are ONE answer for every reader — the property that keeps the plugin column and
// everything that follows it from disagreeing about where the panels are.
import { expect, test } from "@playwright/experimental-ct-react";
import { FlankPlacementProbe } from "./flank-placement.fixtures.tsx";

test("every reader sees the room's verdict change together", async ({ mount }) => {
  const component = await mount(<FlankPlacementProbe />);
  await expect(component.getByLabel("inline host")).toHaveText("true");
  await expect(component.getByLabel("header host")).toHaveText("true");

  await component.getByRole("button", { name: "Room narrows" }).click();
  await expect(component.getByLabel("inline host")).toHaveText("false");
  await expect(component.getByLabel("header host")).toHaveText("false");

  await component.getByRole("button", { name: "Room widens" }).click();
  await expect(component.getByLabel("inline host")).toHaveText("true");
  await expect(component.getByLabel("header host")).toHaveText("true");
});

test("the plugin host's answer reaches the room, and withdrawing it leaves no panels", async ({ mount }) => {
  const component = await mount(<FlankPlacementProbe />);
  await expect(component.getByLabel("host", { exact: true })).toHaveText("false/false");

  await component.getByRole("button", { name: "Host announces" }).click();
  await expect(component.getByLabel("host", { exact: true })).toHaveText("true/true");

  await component.getByRole("button", { name: "Host withdraws" }).click();
  await expect(component.getByLabel("host", { exact: true })).toHaveText("false/false");
});
