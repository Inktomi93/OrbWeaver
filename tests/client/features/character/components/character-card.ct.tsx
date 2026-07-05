// CT: `<CharacterCard>` — avatar-fallback initials, name, tag chips, the archived badge, and the
// isHiddenOnCard tag suppression (CharacterSummary.tags carries pending-excluded, accepted tags only —
// this asserts the CARD also honors each tag's own isHiddenOnCard flag, not just the upstream filter).

import { expect, test } from "@playwright/experimental-ct-react";
import { CharacterCardStory } from "../_ct-stories";

test("renders the name and falls back to initials with no avatar", async ({ mount }) => {
  const component = await mount(<CharacterCardStory name="Aria Nightshade" />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("AN")).toBeVisible();
});

test("renders visible tag chips but suppresses an isHiddenOnCard tag", async ({ mount }) => {
  const component = await mount(
    <CharacterCardStory
      tags={[
        { id: "tag_visible", name: "rpg", isHiddenOnCard: false },
        { id: "tag_hidden", name: "secret-note", isHiddenOnCard: true },
      ]}
    />,
  );
  await expect(component.getByText("rpg")).toBeVisible();
  await expect(component.getByText("secret-note")).toHaveCount(0);
});

test("shows the Archived badge when archived", async ({ mount }) => {
  const archived = await mount(<CharacterCardStory archived={true} />);
  await expect(archived.getByText("Archived")).toBeVisible();
});

test("hides the Archived badge when not archived", async ({ mount }) => {
  const notArchived = await mount(<CharacterCardStory archived={false} />);
  await expect(notArchived.getByText("Archived")).toHaveCount(0);
});

test("marks the row aria-pressed when selected", async ({ mount }) => {
  const component = await mount(<CharacterCardStory selected={true} />);
  await expect(component.getByRole("button", { pressed: true })).toBeVisible();
});

test("the start-chat action fires onStartChat with the character id", async ({ mount }) => {
  const component = await mount(<CharacterCardStory name="Aria Nightshade" />);
  await component
    .getByRole("button", { name: "Start chat with Aria Nightshade", exact: true })
    .click();
  await expect(component.getByTestId("started-id")).toHaveText("char_ct_story");
});

test("start-chat does NOT also toggle the card's select (stopPropagation)", async ({ mount }) => {
  const component = await mount(<CharacterCardStory name="Aria Nightshade" />);
  await component
    .getByRole("button", { name: "Start chat with Aria Nightshade", exact: true })
    .click();
  // The seam fired, but the card's own select was NOT triggered by the nested button's click.
  await expect(component.getByTestId("started-id")).toHaveText("char_ct_story");
  await expect(component.getByTestId("toggled-id")).toHaveText("");
});
