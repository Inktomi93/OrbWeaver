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
import type { Locator } from "@playwright/test";
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

// ── #848: the CHARACTERS header's two add-doors are DISCRIMINABLE without hover ────────────────────────
//
// Shipped, the header offered "Add cast…" (108×32, opens a dialog titled "Saved casts") and, 4px away, an
// UNLABELLED person-plus glyph (34×34, `aria-label="Add a character"`) that adds one character — two
// person-glyph affordances in one row, one of them mute, after #490-8 had established exactly ONE
// add-character door (side-eye 2026-08-30 P2). Both tap targets already passed; the defect is that a cold
// reader cannot tell them apart. The discriminator is a VISIBLE noun on each — "roster" vs "character".
//
// A NOUN WAS NOT ENOUGH (#899 N6, the post-fix drive; retargeted to "roster" vocabulary #902 C1): "cast"
// was insider vocabulary for a STORED GROUP, and beside "a character" it read as the same verb on a
// vaguer noun — the reviewer's own cold read was that one of them "creates a new one", which NEITHER door
// does. So the group door names what it opens: a roster you SAVED earlier. Both doors' accessible names
// are still their visible text.
//
// AND IT SAYS "SAVED" ON THE BUTTON AGAIN (#912, owner-ruled 2026-08-30). #902 C1 compressed this label to
// "Rosters…" to buy back a 320px overflow; see the width block below for why that trade was void. The pin
// is deliberately on the FULL spelling: re-compressing it must red here, not pass quietly.
test("#848/#899 N6: both CHARACTERS add-doors carry a visible word, and each says what it opens", async ({ mount }) => {
  const component = await mount(<CommittedMembersTabStory soloCast={true} />);
  const cast = component.locator(CAST);

  const groupDoor = cast.getByRole("button", { name: "Saved rosters…" });
  const characterDoor = cast.getByRole("button", { name: "Add a character" });
  // VISIBLE text, not the accessible name — the empty string was the whole defect on the second door.
  await expect(groupDoor).toHaveText(/saved rosters/iu);
  await expect(characterDoor).toHaveText(/character/iu);
  // …and the accessible name IS the visible label on both (WCAG 2.5.3 by construction, no `aria-label`).
  await expect(characterDoor).toHaveAccessibleName("Add a character");
  await expect(groupDoor).toHaveAccessibleName("Saved rosters…");
  // The two words a cold reader compares are DIFFERENT — neither is a prefix of the other, which the old
  // pair ("Add cast…" / "Add a character") failed on the noun alone.
  await expect(groupDoor).not.toHaveText(/^Add a character$/u);
});

// ── THE HEADER'S WIDTH MATRIX (#912, owner-ruled 2026-08-30) ─────────────────────────────────────────
//
// A POINT MEASUREMENT NEVER PROVED THIS. The pin that stood here ran at ONE width (320) and its comment
// explained a label compression: #902 C1 grew the kicker "Cast"→"Characters" and paid the deficit by
// shortening the saved-roster door to "Rosters…". MEASURED: the deficit was the KICKER's (29.2→75.7px,
// +46.5) and the removed word "Saved " was worth 36.8px, so the cluster STILL escaped a 320px pane by
// 9.75px — this very test was RED on main at 79e8ffb1f while the issue that caused it was recorded closed.
// The label was spent for nothing; the constraint was that the header could not WRAP.
//
// So the pins run at the MATRIX ENDS and at both crossovers, at BOTH pointer classes, and they assert the
// two properties that actually matter: nothing escapes the pane, and the doors keep their whole words.
// The measured budget lives in `members-panel.tsx`'s header — read it before changing either label.
//
// The ends are the real content box of the pane this panel lives in (the context bracket's `px-row` off
// the pane track): 256px = `--dimension-panel-context`'s 17rem clamp floor; 464px = its 30rem ceiling.
// The phone sheet (100dvw) lands inside that range, so the coarse arm reuses the same widths.
const MATRIX = [256, 288, 320, 368, 464] as const;

/** Every control's overflow past the section box, plus the header's line structure and its doors' edge. */
async function headerGeometry(component: Locator): Promise<{
  readonly escaped: number;
  readonly lines: number;
  readonly doorsTrailBy: number;
  readonly kickerClipped: boolean;
}> {
  return await component.locator(CAST).evaluate((section: HTMLElement) => {
    const bounds = section.getBoundingClientRect();
    const header = section.querySelector('[data-slot="members-section-header"]') as HTMLElement;
    const doors = section.querySelector('[data-slot="members-section-doors"]') as HTMLElement;
    const kicker = header.querySelector("span") as HTMLElement;
    // LINE COUNT FROM VERTICAL CENTRES, not tops: every flex line here is `align="center"`, so items
    // SHARING a line share a centre while their tops differ by their own heights (the kicker's line box is
    // 13px, a control's is 32-48). Clustered with a 2px tolerance so sub-pixel layout never splits a line.
    const centres = [kicker, ...doors.querySelectorAll("button")].map((el) => {
      const box = el.getBoundingClientRect();
      return (box.top + box.bottom) / 2;
    });
    const distinct: number[] = [];
    for (const centre of centres) {
      if (!distinct.some((c) => Math.abs(c - centre) < 2)) {
        distinct.push(centre);
      }
    }
    return {
      escaped: [...section.querySelectorAll("button")]
        .map((el) => el.getBoundingClientRect())
        .filter((box) => box.right > bounds.right + 0.5 || box.left < bounds.left - 0.5).length,
      lines: distinct.length,
      doorsTrailBy: bounds.right - doors.getBoundingClientRect().right,
      kickerClipped: kicker.scrollWidth > kicker.clientWidth + 1,
    };
  });
}

for (const width of MATRIX) {
  test(`#912 @${width}: nothing escapes the pane, the doors trail it, and both keep their whole words`, async ({ mount }) => {
    const component = await mount(<CommittedMembersTabStory soloCast={true} width={width} />);
    const cast = component.locator(CAST);

    // The words are the point of the fix — assert them AT each width, not once at a wide mount.
    await expect(cast.getByRole("button", { name: "Saved rosters…" })).toBeVisible();
    await expect(cast.getByRole("button", { name: "Add a character" })).toBeVisible();

    const geometry = await headerGeometry(component);
    expect(geometry.escaped, "no CHARACTERS-header control escapes the pane").toBe(0);
    // TRUNCATION IS A GEOMETRY FACT — the ruled kicker must never be the thing that gives.
    expect(geometry.kickerClipped, "the 'Characters' kicker is never clipped").toBe(false);
    // The doors TRAIL at every width. This is the `ms-auto` in `SectionHeader`: with `justify="between"`
    // instead, a wrapped door line has one item and lands at flex-START, so the cluster changed edge
    // partway down this matrix. Sub-pixel tolerance only.
    expect(geometry.doorsTrailBy, "the door cluster sits at the section's trailing edge").toBeLessThan(1);
  });
}

// THE CROSSOVERS, stated as line counts so the budget in `members-panel.tsx` is enforced and not merely
// written down. ONE line needs ≥366.6px, TWO ≥284.9, and below that the two doors stack — a label change
// that moves a threshold reds HERE, at the price, instead of as an overflow one width later.
const CROSSOVERS = [
  { width: 464, lines: 1 },
  { width: 368, lines: 1 },
  { width: 320, lines: 2 },
  { width: 288, lines: 2 },
  { width: 256, lines: 3 },
] as const;

for (const { width, lines } of CROSSOVERS) {
  test(`#912 @${width}: the header takes exactly ${lines} line(s)`, async ({ mount }) => {
    const component = await mount(<CommittedMembersTabStory soloCast={true} width={width} />);
    expect((await headerGeometry(component)).lines).toBe(lines);
  });
}

// THE COARSE ARM. Every assertion above is a FINE-pointer assertion, and a narrow viewport renders a
// layout no phone produces. `hasTouch: true` is what flips `matchMedia("(pointer: coarse)")` in chromium
// (the persona-panel-row.ct.tsx precedent); `page.emulateMedia` has no `pointer` feature and cannot drive
// it. MEASURED: the coarse touch floor costs this header HEIGHT (a control row grows 32→48px), not WIDTH —
// both doors are text buttons already past the 44px floor — so the crossovers are the same widths. That is
// a measurement, not an assumption, which is why the ends are re-run here rather than reasoned about.
test.describe("coarse pointer", () => {
  test.use({ hasTouch: true });

  for (const width of [256, 464] as const) {
    test(`#912 @${width} coarse: nothing escapes the pane and both doors keep their whole words`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const component = await mount(<CommittedMembersTabStory soloCast={true} width={width} />);
      const cast = component.locator(CAST);

      await expect(cast.getByRole("button", { name: "Saved rosters…" })).toBeVisible();
      await expect(cast.getByRole("button", { name: "Add a character" })).toBeVisible();

      const geometry = await headerGeometry(component);
      expect(geometry.escaped, "no CHARACTERS-header control escapes the pane at a coarse pointer").toBe(0);
      expect(geometry.kickerClipped).toBe(false);
      expect(geometry.doorsTrailBy).toBeLessThan(1);
    });
  }
});
