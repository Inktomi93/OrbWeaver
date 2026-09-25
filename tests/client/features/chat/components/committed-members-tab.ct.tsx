// CT: the committed Members TAB body (committed-members-tab.tsx) — which action seams a room's own shape
// hands to the panel. `members-panel.ct.tsx` covers the panel as a pure component (rows/menu/focus/chips);
// what only THIS mount can prove is the DECISION above it, because the tab is where the room's group-ness
// turns into a present-or-absent seam.
//
// #182 (owner live report 2026-08-18 — "some group stuff is showing up even when not in group"): Mute,
// Talkativeness and "Make X speak next" are inputs to the GROUP SPEAKER ARBITER, and #162's removal of the
// Characters section's `>=2` floor un-hid them in every 1:1 room. They are gated on the room actually having a
// second character now; everything the roster IS (the section, the row, its identity, View character,
// Remove from chat) stays — that half is #162's ruling and these tests pin it so the narrowing can't creep.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CommittedMembersTabStory } from "../_ct-stories.tsx";

const CHARACTER_SECTION = '[data-slot="members-characters"]';
const CHIP_RE = /Talkativeness: Aria/u;

test("a 1:1 room renders the roster but NO group-arbiter controls (#182)", async ({ mount, page }) => {
  const component = await mount(<CommittedMembersTabStory soloCharacters={true} />);

  // #162's half, unchanged: the solo room's Characters section and its seat are here.
  await expect(component.locator(CHARACTER_SECTION)).toBeVisible();
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
// roster shrinking to one character, and a room whose only voice is excluded cannot answer at all. So the UNMUTE stays
// reachable in a solo room — while talkativeness and force-turn, which strand nothing, do not come back.
test("a solo room whose seat is ALREADY muted keeps the unmute (and only the unmute)", async ({ mount, page }) => {
  const component = await mount(<CommittedMembersTabStory soloCharacters={true} mutedSoloSeat={true} />);

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
  const component = await mount(<CommittedMembersTabStory soloCharacters={true} />);
  const characterSection = component.locator(CHARACTER_SECTION);

  const groupDoor = characterSection.getByRole("button", { name: "Saved rosters…" });
  const characterDoor = characterSection.getByRole("button", { name: "Add a character" });
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
  return await component.locator(CHARACTER_SECTION).evaluate((section: HTMLElement) => {
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
    const component = await mount(<CommittedMembersTabStory soloCharacters={true} width={width} />);
    const characterSection = component.locator(CHARACTER_SECTION);

    // The words are the point of the fix — assert them AT each width, not once at a wide mount.
    await expect(characterSection.getByRole("button", { name: "Saved rosters…" })).toBeVisible();
    await expect(characterSection.getByRole("button", { name: "Add a character" })).toBeVisible();

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

// ── THE CROSSOVERS: MEASURED CLIFFS, NOT PINNED WIDTHS (#1044, 2026-09-02) ───────────────────────────
//
// What stood here was five `lines(width) === N` equalities, one of them at 368 — 1.4px above the file's own
// measured 366.6px one-line threshold. `ed55bf193` vendored Geist and the CHARACTERS kicker went 75.70 →
// 79.41px (10.5px uppercase label; the trailing letter-spacing column travels with it), which moved the
// one-line cliff 366.6 → 368.5 and the two-line cliff 284.9 → 283.0. 368 crossed a cliff it was 1.4px away
// from and the pin red on unmodified main with no product code changed — the SECOND time this block has
// been red while its issue was recorded closed. Measured both ways in ONE evaluate (inherited stack vs a
// forced `ui-sans-serif, system-ui, sans-serif`), the fallback arm reproduces 366.6/284.9 exactly, so the
// font pass is the whole delta.
//
// A width that sits a pixel from a cliff pins the FONT, not the layout. So the cliffs are now MEASURED —
// the header is swept in the page at 0.1px resolution — and what is asserted is the law the budget in
// `members-panel.tsx` is actually about:
//   · each cliff is TWO-SIDED at ±0.5px (the wrap mechanism itself, asserted where it happens);
//   · the one-line cliff is reachable INSIDE the pane's range, with headroom, so the widest pane really
//     does show one line — a label that grows past that reds here, at the price;
//   · the two-line cliff is at or below the phone sheet, so a phone never stacks the doors;
//   · and no single door is wider than the narrowest pane — `members-panel.tsx`'s own "come back and
//     re-decide" trigger, which nothing enforced before.
// Line counts are still pinned, but only at the three widths that MEAN something (both pane ends and the
// phone sheet), each of which sits ≥14px from a cliff instead of 1.4.

/** The pane's real content-box ends and the phone sheet, the same three widths the matrix above is built
 *  from: 256 = `--dimension-panel-context`'s 17rem clamp floor − the bracket's `px-row`, 464 = its 30rem
 *  ceiling − the same, ~304 = 100dvw − the same on a 320px phone. */
const PANE_FLOOR = 256;
const PANE_CEILING = 464;
const PHONE_SHEET = 304;
/** The cliff sweep's resolution and the two-sided arm's reach. A cliff read at 0.1px is asserted with a
 *  0.5px probe on each side, so the arms cannot straddle the measurement's own error. */
const CLIFF_STEP = 0.1;
const CLIFF_ARM = 0.5;
/** The sweep starts ABOVE the pane's ceiling so a cliff that has escaped the pane is a measured number in
 *  the failure message rather than a NaN. */
const SWEEP_CEILING = 600;

/** Sweeps the mounted header's own content box to find the narrowest width at which it still takes ≤ N
 *  lines, for N = 1 and N = 2, then measures the line count at an arbitrary width. Sweeping IN THE PAGE
 *  (rather than re-mounting per width) is what makes a 0.1px cliff affordable, and it is the same layout
 *  engine either way — the host is the story's fixed-width `overflow: visible` box. */
async function headerCliffs(component: Locator): Promise<{
  readonly one: number;
  readonly two: number;
  readonly widestDoor: number;
  readonly at: readonly { readonly width: number; readonly lines: number }[];
}> {
  return await component.locator(CHARACTER_SECTION).evaluate(
    (section: HTMLElement, probe: { step: number; arm: number; ceiling: number; widths: readonly number[] }) => {
      const host = section.closest("div[style]") as HTMLElement;
      const restore = host.style.width;
      const header = section.querySelector('[data-slot="members-section-header"]') as HTMLElement;
      const doors = section.querySelector('[data-slot="members-section-doors"]') as HTMLElement;
      const kicker = header.querySelector("span") as HTMLElement;
      const linesAt = (width: number): number => {
        host.style.width = `${width}px`;
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
        return distinct.length;
      };
      // Walk DOWN from a width no header of this shape can need, so each cliff is the last width that
      // still held the line count — the narrowest, not the first sampled. Starting ABOVE the pane's
      // ceiling is deliberate: a cliff that has escaped the pane is then a number in the failure message
      // instead of a NaN.
      let one = Number.NaN;
      let two = Number.NaN;
      for (let width = probe.ceiling; width >= 200; width -= probe.step) {
        const lines = linesAt(width);
        if (lines <= 1) {
          one = width;
        }
        if (lines <= 2) {
          two = width;
        }
      }
      const at = probe.widths.map((width) => ({ width, lines: linesAt(width) }));
      // The arms, read at the cliffs themselves.
      const arms = [one + probe.arm, one - probe.arm, two + probe.arm, two - probe.arm].map((width) => ({ width, lines: linesAt(width) }));
      host.style.width = restore;
      const widestDoor = Math.max(...[...doors.querySelectorAll("button")].map((el) => el.getBoundingClientRect().width));
      return { one, two, widestDoor, at: [...at, ...arms] };
    },
    { step: CLIFF_STEP, arm: CLIFF_ARM, ceiling: SWEEP_CEILING, widths: [PANE_FLOOR, PHONE_SHEET, PANE_CEILING] },
  );
}

test("#912/#1044: the header's wrap cliffs sit inside the pane's range, and each is two-sided", async ({ mount }) => {
  const component = await mount(<CommittedMembersTabStory soloCharacters={true} width={PANE_CEILING} />);
  await expect(component.locator(CHARACTER_SECTION).getByRole("button", { name: "Saved rosters…" })).toBeVisible();

  const cliffs = await headerCliffs(component);
  const linesAt = (width: number): number => cliffs.at.find((sample) => Math.abs(sample.width - width) < 0.001)?.lines ?? -1;

  // THE MECHANISM, asserted where it happens: each cliff wraps one more line half a pixel below itself and
  // holds half a pixel above. A cliff that is not two-sided is a measurement of something else.
  expect(linesAt(cliffs.one + CLIFF_ARM), "one line just above the one-line cliff").toBe(1);
  expect(linesAt(cliffs.one - CLIFF_ARM), "two lines just below it").toBe(2);
  expect(linesAt(cliffs.two + CLIFF_ARM), "two lines just above the two-line cliff").toBe(2);
  expect(linesAt(cliffs.two - CLIFF_ARM), "three lines just below it — the doors stack").toBe(3);

  // THE BUDGET, as inequalities against the pane's real ends rather than equalities at a cliff. The 8px of
  // headroom is a stated margin, not a coincidence: a label change worth less than 8px no longer reds a
  // width pin, and one worth more reds HERE with the cliff in the message.
  expect(cliffs.one, "the header can be ONE line inside the pane's widest content box").toBeLessThanOrEqual(PANE_CEILING - 8);
  expect(cliffs.two, "the doors share a line at the phone sheet — they stack only below it").toBeLessThanOrEqual(PHONE_SHEET);
  // `members-panel.tsx`'s own re-decide trigger, which was prose until now: a single door wider than the
  // narrowest pane would overflow it at every width, and no wrap can save that.
  expect(cliffs.widestDoor, "no single door is wider than the narrowest pane").toBeLessThan(PANE_FLOOR);
});

// The line counts that MEAN something: both pane ends and the phone sheet. Each is ≥14px from a cliff on
// today's tree (cliffs 368.5 / 283.0), which is what the test above keeps true.
const CROSSOVERS = [
  { width: PANE_CEILING, lines: 1 },
  { width: PHONE_SHEET, lines: 2 },
  { width: PANE_FLOOR, lines: 3 },
] as const;

for (const { width, lines } of CROSSOVERS) {
  test(`#912 @${width}: the header takes exactly ${lines} line(s)`, async ({ mount }) => {
    const component = await mount(<CommittedMembersTabStory soloCharacters={true} width={width} />);
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
      const component = await mount(<CommittedMembersTabStory soloCharacters={true} width={width} />);
      const characterSection = component.locator(CHARACTER_SECTION);

      await expect(characterSection.getByRole("button", { name: "Saved rosters…" })).toBeVisible();
      await expect(characterSection.getByRole("button", { name: "Add a character" })).toBeVisible();

      const geometry = await headerGeometry(component);
      expect(geometry.escaped, "no CHARACTERS-header control escapes the pane at a coarse pointer").toBe(0);
      expect(geometry.kickerClipped).toBe(false);
      expect(geometry.doorsTrailBy).toBeLessThan(1);
    });
  }
});

// The Share card's room picker asks for a room's invite dialog through the active-chat store. The host's Members tab
// opens it on mount, and closing it spends the request: a request that outlived its dialog would reopen it at once.
const HOST = { userId: "user_riley", handle: "riley", globalRole: "owner" } satisfies TrpcWireOutput<"sessions.me">;

test.describe("an invite request from another section", () => {
  test("opens the host's invite dialog, and closing it keeps it closed", async ({ mount, page }) => {
    await routeTrpc(page, { "sessions.me": HOST, "invites.listInvites": () => [] });
    await mount(<CommittedMembersTabStory multiHumanCapable={true} inviteRequested={true} />);

    const dialog = page.getByTestId("invite-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);
  });

  // The requested dialog opened with nothing of this tab focused (the picker that asked lives in another section), so
  // Escape must hand focus to the tab's own Invite people button rather than drop it on the page.
  test("Escape from the requested dialog returns focus to Invite people", async ({ mount, page }) => {
    await routeTrpc(page, { "sessions.me": HOST, "invites.listInvites": () => [] });
    const component = await mount(<CommittedMembersTabStory multiHumanCapable={true} inviteRequested={true} />);

    const dialog = page.getByTestId("invite-dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(component.getByRole("button", { name: "Invite people" })).toBeFocused();
  });

  test("control: with no request the dialog waits for Invite people", async ({ mount, page }) => {
    await routeTrpc(page, { "sessions.me": HOST, "invites.listInvites": () => [] });
    const component = await mount(<CommittedMembersTabStory multiHumanCapable={true} />);

    await expect(component.getByRole("button", { name: "Invite people" })).toBeVisible();
    await expect(page.getByTestId("invite-dialog")).toHaveCount(0);
  });
});
