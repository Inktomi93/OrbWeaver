// Section-jump tile CT — the tile DERIVES from the section registry (home-section-spec §3.4). What this
// pins is that it is a derivation, not a hand list: the rows ARE the registry minus home, in registry
// order, carrying each section's OWN rail label + its gate-checked placeholder copy as the gloss, and a
// DECLARED-PLANNED section (refinery) renders its Planned badge from the same `content` field that
// carries the marker. Clicking a row fires the store action (assert the store, never a rendered echo).

import { expect, test } from "@playwright/experimental-ct-react";
import { HomeSectionJumpStory } from "../_ct-stories";

// The registry order, minus home (which never links to itself).
const EXPECTED = ["Chats", "Characters", "Corpus", "World Info", "Presets", "Refinery", "Analytics"];

test("the jump rows ARE the section registry minus home, in registry order", async ({ mount }) => {
  const home = await mount(<HomeSectionJumpStory />);

  const tile = home.locator('[data-home-tile="home.jump"]');
  const rows = tile.getByRole("button");
  await expect(rows).toHaveCount(EXPECTED.length);
  await Promise.all(EXPECTED.map(async (label, index) => await expect(rows.nth(index)).toHaveAccessibleName(label)));
  await expect(tile.getByRole("button", { name: "Home" })).toHaveCount(0);
});

test("each row borrows its section's own placeholder copy as the gloss", async ({ mount }) => {
  const home = await mount(<HomeSectionJumpStory />);

  const tile = home.locator('[data-home-tile="home.jump"]');
  // Side-agnostic copy: on this tile there is no "left" at all, which is why the chats section's own
  // placeholder stopped saying it.
  await expect(tile.getByText("Your conversations live here — pick a thread from your chats, or start a new one.")).toBeVisible();
  await expect(tile.getByText("Score → rewrite → analyze a character card without drifting from your original.")).toBeVisible();
});

test("a row's gloss WRAPS to two clamped lines — a nowrap ellipsis would cut the sentence that is the row's content", async ({ mount }) => {
  const home = await mount(<HomeSectionJumpStory />);

  const gloss = home.locator('[data-home-tile="home.jump"] [data-slot="list-row-subtitle"]').first();
  const style = await gloss.evaluate((el) => {
    const s = globalThis.getComputedStyle(el);
    return { clamp: s.webkitLineClamp, whitespace: s.whiteSpace, lines: el.getClientRects().length };
  });
  expect(style.clamp).toBe("2");
  expect(style.whitespace).not.toBe("nowrap");
});

test("a DECLARED-PLANNED section renders its Planned badge — derived from `content`, not a second list", async ({ mount }) => {
  const home = await mount(<HomeSectionJumpStory />);

  const tile = home.locator('[data-home-tile="home.jump"]');
  // Exactly one planned section today (refinery); the badge disappears by itself the day it ships.
  await expect(tile.getByText("Planned")).toHaveCount(1);
});

test("clicking a jump row fires setActiveSection — assert the STORE, not a rendered echo", async ({ mount }) => {
  const home = await mount(<HomeSectionJumpStory />);
  const probe = home.locator("output");
  await expect(probe).not.toHaveText("section=presets");

  await home.getByRole("button", { name: "Presets" }).click();
  await expect(probe).toHaveText("section=presets");
});
