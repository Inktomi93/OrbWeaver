// CT: `<CharacterCardTile>` — the §4.4 row anatomy. Asserts the subtitle ladder (elevatorPitch → tag line
// → handle), the archived badge, the isHiddenOnCard tag suppression, the native-button select body +
// aria-current, the sibling star + Chat actions (disjoint from the body — no nested interactive), and the
// §4.6 bulk-mode checkbox that toggles selection instead of opening the editor.

import { expect, test } from "@playwright/experimental-ct-react";
import { CharacterCardTileStory } from "../_ct-stories";

const GROUP_CLASS = /group/;
const REVEAL_ON_HOVER = /group-hover:opacity-100/;
const REVEAL_ON_FOCUS = /group-focus-within:opacity-100/;

test("renders the name and falls back to initials with no avatar", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("AN")).toBeVisible();
});

test("subtitle ladder: the elevatorPitch wins over the tag line and handle", async ({ mount }) => {
  const component = await mount(
    <CharacterCardTileStory
      elevatorPitch="A wandering cartographer."
      tags={[{ id: "tag_rpg", name: "rpg", isHiddenOnCard: false }]}
    />,
  );
  await expect(component.getByText("A wandering cartographer.")).toBeVisible();
});

test("subtitle ladder: falls back to the tag line, suppressing hidden tags", async ({ mount }) => {
  const component = await mount(
    <CharacterCardTileStory
      tags={[
        { id: "tag_visible", name: "rpg", isHiddenOnCard: false },
        { id: "tag_hidden", name: "secret-note", isHiddenOnCard: true },
      ]}
    />,
  );
  await expect(component.getByText("rpg")).toBeVisible();
  await expect(component.getByText("secret-note")).toHaveCount(0);
});

test("subtitle ladder: falls back to the handle when no pitch and no tags", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory handle="aria-nightshade" />);
  // Exact — the hover metadata reveal also contains the handle (`aria-nightshade · 128`); the subtitle is
  // the bare handle.
  await expect(component.getByText("aria-nightshade", { exact: true })).toBeVisible();
});

test("shows the Archived badge when archived", async ({ mount }) => {
  const archived = await mount(<CharacterCardTileStory archived={true} />);
  await expect(archived.getByText("Archived")).toBeVisible();
});

test("hides the Archived badge when not archived", async ({ mount }) => {
  const notArchived = await mount(<CharacterCardTileStory archived={false} />);
  await expect(notArchived.getByText("Archived")).toHaveCount(0);
});

test("marks the row aria-current when selected", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" selected={true} />);
  // The ListRow body is a native <button> carrying aria-current (the row-selection grammar); its
  // accessible name is the title + subtitle, so locate it by its data-slot rather than an exact name.
  const body = component.locator('[data-slot="list-row-body"]');
  await expect(body).toHaveAttribute("aria-current", "true");
});

test("clicking the row body fires onSelect (opens the editor)", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" />);
  await component.locator('[data-slot="list-row-body"]').click();
  await expect(component.getByTestId("selected-id")).toHaveText("char_ct_story");
});

test("the Chat action fires onChat with the character id — a sibling, not nested", async ({
  mount,
}) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" />);
  await component.getByRole("button", { name: "Chat with Aria Nightshade", exact: true }).click();
  await expect(component.getByTestId("chatted-id")).toHaveText("char_ct_story");
  // The action is OUTSIDE the body button — it does NOT also open the editor (disjoint elements).
  await expect(component.getByTestId("selected-id")).toHaveText("");
});

test("the star chip fires onToggleStar (immediate flag toggle)", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" starred={false} />);
  await component.getByRole("button", { name: "Star Aria Nightshade", exact: true }).click();
  await expect(component.getByTestId("starred-id")).toHaveText("char_ct_story");
});

test("§4.4 progressive disclosure: the Chat CTA rests hidden, wired to reveal on hover + focus-within", async ({
  mount,
}) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" />);
  // The reveal keys off the row root's `group`.
  const root = component.locator('[data-slot="list-row-root"]');
  await expect(root).toHaveClass(GROUP_CLASS);
  const chat = component.getByRole("button", { name: "Chat with Aria Nightshade", exact: true });
  // Rest state: opacity 0 (progressive disclosure — the row is the reading surface, not chrome), with the
  // CSS reveal wired to group-hover + group-focus-within (keyboard parity; rule 4). Deterministic assertion
  // of the mechanism — the live hover paint is confirmed by side-eye at integration.
  await expect(chat).toHaveCSS("opacity", "0");
  await expect(chat).toHaveClass(REVEAL_ON_HOVER);
  await expect(chat).toHaveClass(REVEAL_ON_FOCUS);
});

test("§4.4 the raw-metadata reveal carries handle · tokenSize (mono)", async ({ mount }) => {
  const component = await mount(
    <CharacterCardTileStory handle="aria-nightshade" name="Aria Nightshade" />,
  );
  // The story stamps tokenSize=128; the reveal shows `handle · tokenSize`.
  await expect(component.getByText("aria-nightshade · 128")).toBeAttached();
});

test("P0 regression: the title column keeps a real width at rest (reveal cluster must not starve it)", async ({
  mount,
}) => {
  const component = await mount(
    <CharacterCardTileStory handle="aria-nightshade" name="Aria Nightshade" />,
  );
  // The story row is 360px. The regression measured the title at ~0px; it must claim a substantial share.
  const titleW = await component
    .locator('[data-slot="list-row-title"]')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(titleW).toBeGreaterThan(150);
  // The wide metadata reveal is display:none at rest → ZERO layout, so it cannot steal the column.
  const metaW = await component
    .getByText("aria-nightshade · 128")
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(metaW).toBe(0);
});

test("P1 regression: the revealed metadata is legible and NEVER overlaps the action buttons", async ({
  mount,
}) => {
  const component = await mount(<CharacterCardTileStory handle="mara-soul-check" name="Mara" />);
  // Reveal deterministically via keyboard focus (group-focus-within) — :focus-within is reliable in CT
  // where :hover is not; focusing the row BODY (the reveal lives in its content column) triggers the swap.
  await component.locator('[data-slot="list-row-body"]').focus();
  const revealBox = await component.locator('[data-slot="list-row-subtitle-reveal"]').boundingBox();
  const starBox = await component
    .getByRole("button", { name: "Star Mara", exact: true })
    .boundingBox();
  const chatBox = await component
    .getByRole("button", { name: "Chat with Mara", exact: true })
    .boundingBox();

  const revealWidth = revealBox?.width ?? 0;
  const revealRight = (revealBox?.x ?? 0) + revealWidth;
  // Legible — a real line, not the ~12px sliver the bleed regression squeezed it to.
  expect(revealWidth).toBeGreaterThan(60);
  // No overlap: the reveal lives in the content column, the buttons in `actions` — its right edge is at or
  // left of each button's left edge (a null button box fails via -Infinity, never a skipped assertion).
  expect(revealRight).toBeLessThanOrEqual(starBox?.x ?? Number.NEGATIVE_INFINITY);
  expect(revealRight).toBeLessThanOrEqual(chatBox?.x ?? Number.NEGATIVE_INFINITY);
});

test("bulk mode: the row body toggles selection (not open-editor) and shows a checkbox", async ({
  mount,
}) => {
  const component = await mount(<CharacterCardTileStory bulkMode={true} name="Aria Nightshade" />);
  await expect(component.getByRole("checkbox", { name: "Select Aria Nightshade" })).toBeVisible();
  // Clicking the body toggles bulk selection, and does NOT open the editor.
  await component.locator('[data-slot="list-row-body"]').click();
  await expect(component.getByTestId("bulk-id")).toHaveText("char_ct_story");
  await expect(component.getByTestId("selected-id")).toHaveText("");
});
