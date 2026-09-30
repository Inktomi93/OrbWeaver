// SectionContent CT: a section inside the keep-mounted window survives leaving and returning, so the rail
// swap back is a reveal, not a fresh mount of the whole section.

import { expect, test } from "@playwright/experimental-ct-react";
import { SectionContentKeepMountedStory } from "../_ct-stories.tsx";

test("a kept section is revealed on return, not mounted again", async ({ mount }) => {
  const component = await mount(<SectionContentKeepMountedStory />);
  await expect(component.getByTestId("probe-home")).toHaveText("home mount 1");

  await component.getByRole("button", { name: "go chats" }).click();
  const chatsMount = await component.getByTestId("probe-chats").textContent();
  await component.getByRole("button", { name: "go home" }).click();
  await component.getByRole("button", { name: "go chats" }).click();

  await expect(component.getByTestId("probe-chats")).toBeVisible();
  await expect(component.getByTestId("probe-chats")).toHaveText(chatsMount ?? "unread");
  await component.getByRole("button", { name: "go home" }).click();
  await expect(component.getByTestId("probe-home")).toHaveText("home mount 1");
});
