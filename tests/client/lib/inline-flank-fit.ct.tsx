// CT: the room's inline-flank verdict is ONE answer for every reader — the property that keeps the inline host
// and the header host from both holding a plugin frame.
import { expect, test } from "@playwright/experimental-ct-react";
import { InlineFlankFitProbe } from "./inline-flank-fit.fixtures.tsx";

test("every reader sees the room's verdict change together", async ({ mount }) => {
  const component = await mount(<InlineFlankFitProbe />);
  await expect(component.getByLabel("inline host")).toHaveText("true");
  await expect(component.getByLabel("header host")).toHaveText("true");

  await component.getByRole("button", { name: "Room narrows" }).click();
  await expect(component.getByLabel("inline host")).toHaveText("false");
  await expect(component.getByLabel("header host")).toHaveText("false");

  await component.getByRole("button", { name: "Room widens" }).click();
  await expect(component.getByLabel("inline host")).toHaveText("true");
  await expect(component.getByLabel("header host")).toHaveText("true");
});
