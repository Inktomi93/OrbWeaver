// Section-jump tile CT — the tile DERIVES from the section registry. What this
// pins is that it is a derivation, not a hand list: the rows ARE the registry minus home, in registry
// order, carrying each section's OWN rail label + its gate-checked placeholder copy as the gloss. The
// Planned badge derives from the same `content` field that carries the `{planned}` marker — and since
// refinery (the last planned member) graduated in R3, the derivation is pinned from the ABSENT side.
// Clicking a row fires the store action (assert the store, never a rendered echo).

import { expect, test } from "@playwright/experimental-ct-react";
import { CONFIG_SECTION_LABEL } from "../../../../../packages/client/src/features/config/lib/config-copy.ts";
import type { SectionId } from "../../../../../packages/client/src/state/section-ids.ts";
import { SECTION_IDS } from "../../../../../packages/client/src/state/section-ids.ts";
import { HomeSectionJumpStory } from "../_ct-stories.tsx";

// The expectation DERIVES from the registry tuple, never a frozen row list: the ORDER and the COUNT are
// `SECTION_IDS` minus home (which never links to itself), and the labels come from a record tsc proves
// TOTAL over the tuple. A new section is therefore a COMPILE error here (add its rail label) rather than a
// silently-stale literal — which is exactly how this froze at seven rows when `databank` joined the rail.
const RAIL_LABELS: Record<Exclude<SectionId, "home">, string> = {
  chats: "Chats",
  characters: "Characters",
  corpus: "Corpus",
  config: CONFIG_SECTION_LABEL,
  extensions: "Extensions",
  databank: "Databank",
  presets: "Presets",
  refinery: "Refinery",
  analytics: "Analytics",
};
const EXPECTED = SECTION_IDS.filter((id): id is Exclude<SectionId, "home"> => id !== "home").map((id) => RAIL_LABELS[id]);

/** The chats section's own gate-checked `placeholder.description` — the copy that left the COLUMN with the
 *  pill rail and came back on the pill itself (side-eye 2026-08-16 F10). */
const CHATS_GLOSS = "Your conversations live here — pick a thread from your chats, or start a new one.";

test("the jump rows ARE the section registry minus home, in registry order", async ({ mount }) => {
  const home = await mount(<HomeSectionJumpStory />);

  const tile = home.locator('[data-home-tile="home.jump"]');
  const rows = tile.getByRole("button");
  await expect(rows).toHaveCount(EXPECTED.length);
  await Promise.all(EXPECTED.map(async (label, index) => await expect(rows.nth(index)).toHaveAccessibleName(`Go to ${label}`)));
  await expect(tile.getByRole("button", { name: "Go to Home" })).toHaveCount(0);
});

test("#102: the destinations are a WRAPPING PILL RAIL, and the teaching gloss is gone from home", async ({ mount }) => {
  // The rows carried each section's `placeholder.description` as a two-line gloss, which made the
  // NAVIGATION block the tallest thing in the hearth column — seven sentences competing with the rooms
  // the page exists to get you back into. The owner-picked variant C replaced them with a pill rail.
  // This pin is BOTH halves, because half of it is a deliberate LOSS someone will otherwise "restore":
  // the copy is not on home any more, and the pills are pills (full radius, wrapping, in one row).
  const home = await mount(<HomeSectionJumpStory />);

  const tile = home.locator('[data-home-tile="home.jump"]');
  await expect(tile.getByText(CHATS_GLOSS, { exact: true })).toHaveCount(0);
  await expect(tile.locator('[data-slot="list-row-subtitle"]')).toHaveCount(0);

  const rail = await tile.getByRole("button", { name: "Go to Chats" }).evaluate((el) => {
    const s = globalThis.getComputedStyle(el);
    const parent = el.parentElement;
    return {
      radius: Number.parseFloat(s.borderTopLeftRadius),
      height: el.getBoundingClientRect().height,
      wraps: parent === null ? "" : globalThis.getComputedStyle(parent).flexWrap,
    };
  });
  // `rounded-full` resolves to a huge radius; the control step is a handful of px. Asserting "≥ half the
  // pill's own height" is the shape claim (a capsule) rather than a brittle 9999.
  await expect
    .poll(
      async () =>
        (
          await tile.getByRole("button", { name: "Go to Chats" }).evaluate((el) => {
            const s = globalThis.getComputedStyle(el);
            const parent = el.parentElement;
            return {
              radius: Number.parseFloat(s.borderTopLeftRadius),
              height: el.getBoundingClientRect().height,
              wraps: parent === null ? "" : globalThis.getComputedStyle(parent).flexWrap,
            };
          })
        ).radius,
    )
    .toBeGreaterThanOrEqual(rail.height / 2);
  await expect
    .poll(
      async () =>
        (
          await tile.getByRole("button", { name: "Go to Chats" }).evaluate((el) => {
            const s = globalThis.getComputedStyle(el);
            const parent = el.parentElement;
            return {
              radius: Number.parseFloat(s.borderTopLeftRadius),
              height: el.getBoundingClientRect().height,
              wraps: parent === null ? "" : globalThis.getComputedStyle(parent).flexWrap,
            };
          })
        ).wraps,
    )
    .toBe("wrap");
});

// ── RED-FIRST (#102 review F10): the insider names are not stranded ─────────────────────────────────
// "Corpus", "Refinery" and "Configuration" are insider names on the LANDING surface, and the pill rail
// shipped them with title, aria-label and aria-describedby all null — nothing to hover, nothing announced.
// The gloss is back in the two channels that cost zero layout, and the VISIBLE word still owns the name
// (WCAG 2.5.3: an aria-label of the description would break voice control).
test("#102-F10 every jump pill carries its section's gloss — as a tooltip AND as an accessible description", async ({ mount }) => {
  const home = await mount(<HomeSectionJumpStory />);

  const chats = home.locator('[data-home-tile="home.jump"]').getByRole("button", { name: "Go to Chats" });
  await expect(chats).toHaveAttribute("title", CHATS_GLOSS);
  await expect(chats).toHaveAccessibleDescription(CHATS_GLOSS);
  // …and the pill's NAME still CONTAINS the visible word (WCAG 2.5.3 label-in-name; voice control still
  // matches on it) rather than being replaced by the sentence. The verb prefix arrived on the 2026-08-17
  // rail sweep (P3-19): a bare "Chats" collided with the rail nav's own `aria-label="Chats"`, so two
  // buttons on one screen shared a name and `snap --map` could mint no unique semantic selector for any
  // of the seven pills — all of them fell back to a DOM path.
  await expect(chats).toHaveAccessibleName("Go to Chats");
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

  await home.getByRole("button", { name: "Go to Presets" }).click();
  await expect(probe).toHaveText("section=presets");
});
