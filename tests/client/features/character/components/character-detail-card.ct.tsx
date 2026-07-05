// CT: `<CharacterDetailCard>` (ux-flow-revamp J9) — the read-only detail render (name, description,
// conditional creator-notes, tags, archived badge), the Start-chat seam firing the character id, and the
// Edit action staying DISABLED (the editor is a later lane — the card must not imply it exists).

import { expect, test } from "@playwright/experimental-ct-react";
import { CharacterDetailCardStory } from "../_ct-stories";

test("renders the name + description", async ({ mount }) => {
  const component = await mount(
    <CharacterDetailCardStory name="Aria Nightshade" description="A wandering cartographer." />,
  );
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("A wandering cartographer.")).toBeVisible();
});

test("hides creator notes when absent", async ({ mount }) => {
  const without = await mount(<CharacterDetailCardStory creatorNotes={null} />);
  await expect(without.getByText("Creator notes")).toHaveCount(0);
});

test("shows creator notes when present", async ({ mount }) => {
  const withNotes = await mount(<CharacterDetailCardStory creatorNotes="Imported from ST." />);
  await expect(withNotes.getByText("Creator notes")).toBeVisible();
  await expect(withNotes.getByText("Imported from ST.")).toBeVisible();
});

test("shows the Archived badge when archived", async ({ mount }) => {
  const archived = await mount(<CharacterDetailCardStory archived={true} />);
  await expect(archived.getByText("Archived")).toBeVisible();
});

test("Start chat fires onStartChat with the character id", async ({ mount }) => {
  const component = await mount(<CharacterDetailCardStory name="Aria Nightshade" />);
  await component
    .getByRole("button", { name: "Start chat with Aria Nightshade", exact: true })
    .click();
  await expect(component.getByTestId("started-id")).toHaveText("char_ct_detail");
});

test("the Edit action is disabled (the editor is a later lane)", async ({ mount }) => {
  const component = await mount(<CharacterDetailCardStory />);
  await expect(component.getByRole("button", { name: "Edit" })).toBeDisabled();
});
