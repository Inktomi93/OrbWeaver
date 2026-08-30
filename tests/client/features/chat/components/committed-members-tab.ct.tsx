// CT: the committed Members TAB body (committed-members-tab.tsx) — which action seams a room's own shape
// hands to the panel. `members-panel.ct.tsx` covers the panel as a pure component (rows/menu/focus/chips);
// what only THIS mount can prove is the DECISION above it, because the tab is where the room's group-ness
// turns into a present-or-absent seam.
//
// #182 (owner live report 2026-08-18 — "some group stuff is showing up even when not in group"): Mute,
// Talkativeness and "Make X speak next" are inputs to the GROUP SPEAKER ARBITER, and #162's removal of the
// Cast section's `>=2` floor un-hid them in every 1:1 room. They are gated on the room actually having a
// second character now; everything the roster IS (the section, the row, its identity, View character,
// Remove from chat) stays — that half is #162's ruling and these tests pin it so the narrowing can't creep.

import { expect, test } from "@playwright/experimental-ct-react";
import { CommittedMembersTabStory } from "../_ct-stories.tsx";

const CAST = '[data-slot="members-cast"]';
const CHIP_RE = /Talkativeness: Aria/u;

test("a 1:1 room renders the roster but NO group-arbiter controls (#182)", async ({ mount, page }) => {
  const component = await mount(<CommittedMembersTabStory soloCast={true} />);

  // #162's half, unchanged: the solo room's Cast section and its seat are here.
  await expect(component.locator(CAST)).toBeVisible();
  const row = component.getByRole("button", { name: "Aria — character" });
  await expect(row).toBeVisible();

  // The arbiter's three knobs are ABSENT — no inline cluster, no weight chip.
  await expect(component.getByRole("button", { name: "Mute Aria" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: CHIP_RE })).toHaveCount(0);

  // …and none of the three appear in the row's canonical action home either, while the two controls that
  // are about the ROSTER (not the arbiter) still do.
  await row.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "View character" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Remove Aria from chat" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Mute Aria" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Talkativeness…" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Make Aria speak next" })).toHaveCount(0);
});

test("a GROUP room still gets all three arbiter controls (the counter-arm)", async ({ mount, page }) => {
  const component = await mount(<CommittedMembersTabStory />);

  await expect(component.getByRole("button", { name: CHIP_RE })).toBeVisible();
  await expect(component.getByRole("button", { name: "Mute Aria" })).toHaveCount(1);

  await component.getByRole("button", { name: "Aria — character" }).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Mute Aria" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Talkativeness…" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Make Aria speak next" })).toBeVisible();
});

// The door mute opens must not lock from the inside: a seat muted while the room was a group survives the
// cast shrinking to one, and a room whose only voice is excluded cannot answer at all. So the UNMUTE stays
// reachable in a solo room — while talkativeness and force-turn, which strand nothing, do not come back.
test("a solo room whose seat is ALREADY muted keeps the unmute (and only the unmute)", async ({ mount, page }) => {
  const component = await mount(<CommittedMembersTabStory soloCast={true} mutedSoloSeat={true} />);

  await expect(component.getByRole("button", { name: "Aria — character, muted" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Unmute Aria" })).toHaveCount(1);

  await component.getByRole("button", { name: "Aria — character, muted" }).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Unmute Aria" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Talkativeness…" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Make Aria speak next" })).toHaveCount(0);
});

// ── #848: the CAST header's two add-doors are DISCRIMINABLE without hover ─────────────────────────────
//
// Shipped, the header offered "Add cast…" (108×32, opens a dialog titled "Saved casts") and, 4px away, an
// UNLABELLED person-plus glyph (34×34, `aria-label="Add a character"`) that adds one character — two
// person-glyph affordances in one row, one of them mute, after #490-8 had established exactly ONE
// add-character door (side-eye 2026-08-30 P2). Both tap targets already passed; the defect is that a cold
// reader cannot tell them apart. The discriminator is a VISIBLE noun on each — "cast" vs "character".
test("#848: both CAST add-doors carry a visible word, and the two words are different nouns", async ({ mount }) => {
  const component = await mount(<CommittedMembersTabStory soloCast={true} />);
  const cast = component.locator(CAST);

  const groupDoor = cast.getByRole("button", { name: "Add cast…" });
  const characterDoor = cast.getByRole("button", { name: "Add a character" });
  // VISIBLE text, not the accessible name — the empty string was the whole defect on the second door.
  await expect(groupDoor).toHaveText(/cast/iu);
  await expect(characterDoor).toHaveText(/character/iu);
  // …and the accessible name still CONTAINS the visible label (WCAG 2.5.3) on the door that gained one.
  await expect(characterDoor).toHaveAccessibleName("Add a character");
});

// A wide mount agrees with an overflow bug, so the door cluster is measured at the CONTEXT-PANE FLOOR
// (320px). Two labelled buttons plus the "Cast" kicker have to share that row without either escaping the
// pane — the failure mode a second visible label is most likely to introduce.
test("#848: at the 320px pane floor both doors stay inside the pane", async ({ mount }) => {
  const component = await mount(<CommittedMembersTabStory soloCast={true} width={320} />);
  const cast = component.locator(CAST);

  const overflow = await cast.evaluate((section: HTMLElement) => {
    const bounds = section.getBoundingClientRect();
    return [...section.querySelectorAll("button")]
      .map((el) => el.getBoundingClientRect())
      .filter((box) => box.right > bounds.right + 0.5 || box.left < bounds.left - 0.5).length;
  });
  expect(overflow, "no CAST-header control escapes the pane at its narrowest real width").toBe(0);
});
