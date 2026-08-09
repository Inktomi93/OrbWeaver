// Section-jump tile CT — the tile DERIVES from the section registry (home-section-spec §3.4). What this
// pins is that it is a derivation, not a hand list: the rows ARE the registry minus home, in registry
// order, carrying each section's OWN rail label + its gate-checked placeholder copy as the gloss. The
// Planned badge derives from the same `content` field that carries the `{planned}` marker — and since
// refinery (the last planned member) graduated in R3, the derivation is pinned from the ABSENT side.
// Clicking a row fires the store action (assert the store, never a rendered echo).

import { expect, test } from "@playwright/experimental-ct-react";
import type { SectionId } from "../../../../../packages/client/src/state/shell-store.ts";
import { SECTION_IDS } from "../../../../../packages/client/src/state/shell-store.ts";
import { HomeSectionJumpStory } from "../_ct-stories.tsx";

// The expectation DERIVES from the registry tuple, never a frozen row list: the ORDER and the COUNT are
// `SECTION_IDS` minus home (which never links to itself), and the labels come from a record tsc proves
// TOTAL over the tuple. A new section is therefore a COMPILE error here (add its rail label) rather than a
// silently-stale literal — which is exactly how this froze at seven rows when `databank` joined the rail.
const RAIL_LABELS: Record<Exclude<SectionId, "home">, string> = {
  chats: "Chats",
  characters: "Characters",
  corpus: "Corpus",
  config: "Configuration",
  databank: "Databank",
  presets: "Presets",
  refinery: "Refinery",
  analytics: "Analytics",
};
const EXPECTED = SECTION_IDS.filter((id): id is Exclude<SectionId, "home"> => id !== "home").map((id) => RAIL_LABELS[id]);

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

test("no Planned badge survives a graduation — the badge derives from `content`, so it vanished the day refinery shipped", async ({ mount }) => {
  const home = await mount(<HomeSectionJumpStory />);

  const tile = home.locator('[data-home-tile="home.jump"]');
  // The registry's last DECLARED-PLANNED member (refinery) graduated in R3. The badge derives from the
  // same `content` field that carried the `{planned}` marker, so ZERO badges is the self-cleaning
  // guarantee working — a count here would only ever rise again if a new planned section joins, at which
  // point this assertion is the compile-adjacent reminder to flip it back to a positive pin.
  await expect(tile.getByText("Planned")).toHaveCount(0);
});

test("clicking a jump row fires setActiveSection — assert the STORE, not a rendered echo", async ({ mount }) => {
  const home = await mount(<HomeSectionJumpStory />);
  const probe = home.locator("output");
  await expect(probe).not.toHaveText("section=presets");

  await home.getByRole("button", { name: "Presets" }).click();
  await expect(probe).toHaveText("section=presets");
});
