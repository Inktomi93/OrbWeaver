// CT: `<CharacterCardTile>` — the §4.4 row anatomy. Asserts the subtitle ladder (elevatorPitch → tag line
// → handle), the archived badge, the isHiddenOnCard tag suppression, the native-button select body +
// aria-current, the sibling star + Chat actions (disjoint from the body — no nested interactive), and the
// §4.6 bulk-mode checkbox that toggles selection instead of opening the editor.
//
// The star is the shared `RowToggleAction` under owner ruling D11 (list-pane-projection §12): it announces
// as a toggle (`aria-pressed`). Its REST posture is D11's MARKER form since 2026-08-18 (side-eye P1-3): the
// toggle is ALWAYS reveal-gated and the pressed state is carried at rest by the title-line ★ in
// `ListRow.markers` — which is what leaves the trailing cluster entirely hover-revealed, and therefore
// floatable. D11's invariant (pressed state visible at rest) is met in the marker slot; the two never paint
// together.
//
// THE CLUSTER FLOATS OUTSIDE BULK MODE. `actionsFloat` lifts it out of flow at the row's inline end on FINE
// pointers, so the name keeps the row's full width at rest — and the arm is deliberately INERT at rest
// (`pointer-events-none` on the wrapper AND its children, restored on the row's hover/:focus-within), which
// is why the action tests below reveal the row before clicking. That inertness is the ruled behaviour for
// the float arm specifically (an invisible control sitting ON the title text must not be hit-testable); an
// IN-FLOW cluster keeps its live hit target, which is what bulk mode's checkbox relies on.

import { chatWithActionName, rowActionsName, selectActionName } from "@orb/client/lib";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { CharacterCardTileStory } from "../_ct-stories.tsx";

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
    <CharacterCardTileStory elevatorPitch="A wandering cartographer." tags={[{ id: "tag_rpg", name: "rpg", isHiddenOnCard: false }]} />,
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
  const component = await mount(<CharacterCardTileStory handle={castId<CharacterHandle>("aria-nightshade")} />);
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
  // Finding #1: the row body's accessible NAME is the character name ALONE (not "Aria Nightshade <pitch>"
  // run together) — the subtitle/handle ride aria-describedby. So the row is addressable by its exact name.
  const body = component.getByRole("button", { name: "Aria Nightshade", exact: true });
  await expect(body).toHaveAttribute("aria-current", "true");
  await expect(body).toHaveAccessibleName("Aria Nightshade");
});

test("clicking the row body fires onSelect (opens the editor)", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" />);
  await component.locator('[data-slot="list-row-body"]').click();
  await expect(component.getByTestId("selected-id")).toHaveText("char_ct_story");
});

test("the Chat action fires onChat with the character id — a sibling, not nested", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" />);
  // REVEAL FIRST: the cluster floats now (P1-3), and the float arm is inert at rest by construction — the
  // hidden controls sit ON the title text, so a hit test there must reach the row, not a control nobody can
  // see. Hovering the ROW restores `pointer-events` on the whole cluster; that is the seam this step pins.
  await component.locator('[data-slot="list-row-root"]').hover();
  await component.getByRole("button", { name: chatWithActionName("Aria Nightshade"), exact: true }).click();
  await expect(component.getByTestId("chatted-id")).toHaveText("char_ct_story");
  // The action is OUTSIDE the body button — it does NOT also open the editor (disjoint elements).
  await expect(component.getByTestId("selected-id")).toHaveText("");
});

test("the star chip fires onToggleStar (immediate flag toggle)", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" starred={false} />);
  await component.locator('[data-slot="list-row-root"]').hover();
  await component.getByRole("button", { name: "Star Aria Nightshade", exact: true }).click();
  await expect(component.getByTestId("starred-id")).toHaveText("char_ct_story");
});

test("D11 retrofit: the star announces as a TOGGLE (aria-pressed), not a command", async ({ mount }) => {
  const off = await mount(<CharacterCardTileStory name="Aria Nightshade" starred={false} />);
  await expect(off.getByRole("button", { name: "Star Aria Nightshade", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("D11 retrofit: an UNSTARRED star rests hidden (revealed on hover/focus), reversing the shipped always-on posture", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" starred={false} />);
  const star = component.getByRole("button", { name: "Star Aria Nightshade", exact: true });
  await expect(star).toHaveCSS("opacity", "0");
  await expect(star).toHaveClass(REVEAL_ON_HOVER);
  await expect(star).toHaveClass(REVEAL_ON_FOCUS);
});

test("D11 marker form: a STARRED row shows its ★ at rest on the TITLE LINE, and the toggle stays gated", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" starred={true} />);
  // The pressed state is visible at rest — in the marker slot, inside the text column, where it costs the
  // width it is worth instead of pinning a 114px trailing strip (side-eye 2026-08-18 P1-3).
  const marker = component.locator('[data-slot="list-row-markers"]').getByLabel("Starred");
  await expect(marker).toBeVisible();
  const star = component.getByRole("button", { name: "Unstar Aria Nightshade", exact: true });
  await expect(star).toHaveAttribute("aria-pressed", "true");
  // The control that SETS it is reveal-gated at rest — the row never paints two stars.
  await expect(star).toHaveCSS("opacity", "0");
});

test("D11 marker form: the ★ marker YIELDS on reveal, by visibility — the title line cannot reflow", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" starred={true} />);
  const marker = component.locator('[data-slot="list-row-markers"]').getByLabel("Starred");
  const titleRow = component.locator('[data-slot="list-row-title-row"]');
  const restBox = await titleRow.boundingBox();
  await component.locator('[data-slot="list-row-root"]').hover();
  await expect(component.getByRole("button", { name: "Unstar Aria Nightshade", exact: true })).toHaveCSS("opacity", "1");
  // `visibility`, never `display`: the marker's box survives, so the hover boundary cannot slide under a
  // stationary pointer (the measured ~85 crossings/sec oscillator, packages/client/src/components/row-reveal.ts).
  await expect(marker).toHaveCSS("visibility", "hidden");
  await expect.poll(() => titleRow.boundingBox()).toEqual(restBox);
});

test("§4.4 progressive disclosure: the Chat CTA rests hidden, wired to reveal on hover + focus-within", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" />);
  // The reveal keys off the row root's `group`.
  const root = component.locator('[data-slot="list-row-root"]');
  await expect(root).toHaveClass(GROUP_CLASS);
  const chat = component.getByRole("button", { name: chatWithActionName("Aria Nightshade"), exact: true });
  // Rest state: opacity 0 (progressive disclosure — the row is the reading surface, not chrome), with the
  // CSS reveal wired to group-hover + group-focus-within (keyboard parity; rule 4). Deterministic assertion
  // of the mechanism — the live hover paint is confirmed by side-eye at integration.
  await expect(chat).toHaveCSS("opacity", "0");
  await expect(chat).toHaveClass(REVEAL_ON_HOVER);
  await expect(chat).toHaveClass(REVEAL_ON_FOCUS);
});

test("§4.4 the raw-metadata reveal carries handle · tokenSize (mono)", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory handle={castId<CharacterHandle>("aria-nightshade")} name="Aria Nightshade" />);
  // The story stamps tokenSize=128; the reveal shows `handle · tokenSize`.
  await expect(component.getByText("aria-nightshade · 128")).toBeAttached();
});

test("P0 regression: the title column keeps a real width at rest (reveal cluster must not starve it)", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory handle={castId<CharacterHandle>("aria-nightshade")} name="Aria Nightshade" />);
  // The story row is 360px. The regression measured the title at ~0px; it must claim a substantial share.
  await expect.poll(async () => component.locator('[data-slot="list-row-title"]').evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(150);
  // The wide metadata reveal shares the subtitle's ONE grid cell (`list-row-subtitle-stack`) and is
  // `visibility:hidden` at rest — its box is RESERVED on purpose (a hover-keyed display swap is the P0 hover
  // oscillator, packages/client/src/components/row-reveal.ts), and it lives on the subtitle's line, a
  // different row from the title. So it costs the title column nothing: the stack never exceeds the content
  // column it sits in.
  const [stackW, contentW] = await Promise.all([
    component.locator('[data-slot="list-row-subtitle-stack"]').evaluate((el) => el.getBoundingClientRect().width),
    component.locator('[data-slot="list-row-content"]').evaluate((el) => el.getBoundingClientRect().width),
  ]);
  expect(stackW).toBeLessThanOrEqual(contentW);
});

test("P0 regression: the reveal swap does not move the row's layout (the hover-oscillator class)", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory handle={castId<CharacterHandle>("aria-nightshade")} name="Aria Nightshade" />);
  const body = component.locator('[data-slot="list-row-body"]');
  await expect(component.locator('[data-slot="list-row-subtitle-reveal"]')).toHaveCSS("visibility", "hidden");
  const restBox = await body.boundingBox();
  // :focus-within drives the same swap :hover does (deterministic in CT, where :hover is not).
  await body.focus();
  await expect(component.locator('[data-slot="list-row-subtitle-reveal"]')).toHaveCSS("visibility", "visible");
  // Byte-identical geometry rest ⇄ revealed — nothing enters or leaves layout, so the hover boundary cannot
  // slide under a stationary pointer.
  await expect.poll(() => body.boundingBox()).toEqual(restBox);
});

// SUPERSEDED PREMISE, RESTATED (side-eye 2026-08-18 P1-3). This used to assert the revealed metadata never
// OVERLAPS the buttons — true only while the cluster reserved an in-flow strip, which is precisely the
// 114px the newer finding reclaims for the name. The 2026-08-18 review asks for the overlay explicitly
// ("overlay the action cluster on hover/focus, an end-cap over the subtitle line"). What survives is the
// half that was actually about legibility: the revealed line is a real line, and the glyphs that cover its
// tail sit on an OPAQUE backdrop, never directly on text.
test("P1 regression: the revealed metadata is a legible line, and the floated cluster paints its own backdrop", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory handle={castId<CharacterHandle>("mara-soul-check")} name="Mara" />);
  // Reveal deterministically via keyboard focus (group-focus-within) — :focus-within is reliable in CT
  // where :hover is not; focusing the row BODY (the reveal lives in its content column) triggers the swap.
  await component.locator('[data-slot="list-row-body"]').focus();
  // Legible — a real line, not the ~12px sliver the bleed regression squeezed it to.
  await expect.poll(async () => (await component.locator('[data-slot="list-row-subtitle-reveal"]').boundingBox())?.width ?? 0).toBeGreaterThan(60);

  await expect
    .poll(async () => component.locator('[data-slot="list-row-actions"]').evaluate((el: Element) => getComputedStyle(el).backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");
});

test("bulk mode: the row body toggles selection (not open-editor) and shows a checkbox", async ({ mount }) => {
  const component = await mount(<CharacterCardTileStory bulkMode={true} name="Aria Nightshade" />);
  await expect(component.getByRole("checkbox", { name: selectActionName("Aria Nightshade") })).toBeVisible();
  // Clicking the body toggles bulk selection, and does NOT open the editor.
  await component.locator('[data-slot="list-row-body"]').click();
  await expect(component.getByTestId("bulk-id")).toHaveText("char_ct_story");
  await expect(component.getByTestId("selected-id")).toHaveText("");
});

// The lifecycle one-home ruling: card EXPORT homes on this row's kebab (import is the band's ghost; the
// editor carries no lifecycle chrome). Both formats the owner-gated route serves are plain download LINKS
// in ONE submenu — the chat kebab's grammar (`chat-list-surface.ct.tsx`) — because a card that reaches a
// viewer who does not own it 404s at the verb, whichever container it asked for. `.png` is the default arm
// (no `?format`, the ST-parity card with the avatar welded in); `.json` rides `?format=json` and is the
// unwrapped V3 card the import door already accepts.
test("§12 the kebab's Export card submenu links BOTH formats to the owner-gated route", async ({ mount, page }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" />);
  // The floated cluster is inert at rest (P1-3) — reach the kebab the way a user does.
  await component.locator('[data-slot="list-row-root"]').hover();
  await component.getByRole("button", { name: rowActionsName("Aria Nightshade"), exact: true }).click();
  await page.getByRole("menuitem", { name: "Export card" }).click();

  const png = page.getByRole("menuitem", { name: "With avatar (.png)" });
  await expect(png).toHaveAttribute("href", "/api/export/character/char_ct_story");
  await expect(png).toHaveAttribute("download", "");
  const json = page.getByRole("menuitem", { name: "Data only (.json)" });
  await expect(json).toHaveAttribute("href", "/api/export/character/char_ct_story?format=json");
  await expect(json).toHaveAttribute("download", "");
  // The rare/destructive cluster the ruling puts it in — the same menu, not a second home.
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

// #838 — the row kebab is now the `row` SLICE of one vocabulary (`lib/character-actions.ts`), not its own
// hand-spelled list. Its rendered items are unchanged by that move, and this pin is what says so: a literal
// item census, so a registry edit that silently re-orders or re-labels this menu reds here.
test("the row kebab is the vocabulary's `row` slice, in order, destructive last", async ({ mount, page }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" />);
  await component.locator('[data-slot="list-row-root"]').hover();
  await component.getByRole("button", { name: rowActionsName("Aria Nightshade"), exact: true }).click();

  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["Archive", "Duplicate", "Export card", "Delete"]);
});

test("the row kebab's archive verb wears its second face on an archived row", async ({ mount, page }) => {
  const component = await mount(<CharacterCardTileStory archived={true} name="Aria Nightshade" />);
  await component.locator('[data-slot="list-row-root"]').hover();
  await component.getByRole("button", { name: rowActionsName("Aria Nightshade"), exact: true }).click();

  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["Unarchive", "Duplicate", "Export card", "Delete"]);
});

// ── THE COARSE COLLAPSE (#1695, side-eye 2026-09-05 §"At a coarse pointer the character row still paints
// three inline actions") ────────────────────────────────────────────────────────────────────────────
// EVERY FENCE ABOVE IS A FINE-POINTER FENCE — `actionsFloat` is `pointer-fine:` gated, so at a coarse
// pointer the cluster is IN FLOW and permanently visible (`ROW_REVEAL`'s `pointer-coarse:opacity-100`)
// while every icon button sits at the 44-48px touch floor. Measured on the shipped tree at
// `coarse:dpr3:430x740`: Star + Chat + ⋯ charged 156px of a 413px row and
// `Calamity, Doomblade of the Ninth Epoch` clipped in a 195px title lane.
//
// `packages/client/src/components/row-reveal.ts` states the rule: a row's SECONDARY affordances collapse
// into its ONE overflow control at coarse. The star toggle is that secondary — the Chat CTA is the row's
// 1-click core loop (§9c, this row's own standing ruling) and stays a visible target at both pointer
// classes, so the collapse takes the cluster from three boxes to two, not to one.
//
// `hasTouch: true` is what flips `matchMedia("(pointer: coarse)")` in chromium; `page.emulateMedia` has no
// `pointer` feature and CANNOT drive this. The first assertion in each case PROVES the emulation landed
// before any geometry is trusted.

const ANY_STAR_VERB = /^(Star|Unstar) /;
const LONG_NAME = "Calamity, Doomblade of the Ninth Epoch";
const PHONE_WIDTHS = [320, 390, 430] as const;

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true });

  for (const width of PHONE_WIDTHS) {
    test(`@${width}: the star toggle stands down into the kebab and the title lane gets its width back`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const component = await mount(<CharacterCardTileStory name={LONG_NAME} width={width} />);

      // The collapsed control is GONE, not merely invisible (`display:none`, so it leaves the a11y tree too).
      await expect(component.getByRole("button", { name: ANY_STAR_VERB })).toHaveCount(0);
      // The two that survive: the core-loop CTA and the one overflow door.
      await expect(component.getByRole("button", { name: chatWithActionName(LONG_NAME), exact: true })).toBeVisible();
      await expect(component.getByRole("button", { name: rowActionsName(LONG_NAME), exact: true })).toBeVisible();

      // GEOMETRY, not classes. Two touch boxes (48px each) plus the cluster's own gap — never three.
      await expect
        .poll(() => component.locator('[data-slot="list-row-actions"]').evaluate((el: HTMLElement) => el.getBoundingClientRect().width))
        .toBeLessThan(115);
    });

    // THE TITLE LANE'S SHARE, which is what the collapse actually buys. A FRACTION, not a pixel, so it
    // survives a token retune of the avatar box or the row padding — and set BELOW the narrowest measured
    // post-fix value rather than at it (the persona row's precedent): this fences the collapse, it does not
    // pin the pixel.
    //
    // MEASURED on this tree, title width / row width, before → after:
    //   320: 0.306 → 0.475 · 390: 0.431 → 0.569 · 430: 0.484 → 0.617
    // The fraction RISES with width because the row's non-title cost (avatar + padding + the two surviving
    // touch boxes) is fixed, which is exactly why one floor covers all three arms only if it sits under the
    // 320 value. A single-width point measurement would have picked a floor that reds at the narrow end.
    test(`@${width}: the title lane gets a real share of the row back`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const component = await mount(<CharacterCardTileStory name={LONG_NAME} width={width} />);
      const title = component.locator('[data-slot="list-row-title"]');
      const [titleWidth, rowWidth] = await title.evaluate((el: HTMLElement): readonly [number, number] => [
        el.getBoundingClientRect().width,
        (el.closest('[data-slot="list-row-root"]') as HTMLElement).getBoundingClientRect().width,
      ]);
      expect(titleWidth / rowWidth).toBeGreaterThan(0.45);
    });

    // …and the width it bought is READABLE, not merely reserved: a real library name must not ellipsis at a
    // phone width. `truncate` clips by overflow, so the tell is scrollWidth vs clientWidth — polled, because
    // the marker/glyph row beside it settles its own width a frame after the text paints.
    //
    // `LONG_NAME` is deliberately NOT the subject here: 38 characters cannot fit a 320px row at any cluster
    // budget, and a fence that demanded it would be a wish. What the collapse owes is that an ORDINARY name
    // stops paying for a control the phone row was not using.
    test(`@${width}: an ordinary name does not clip`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const component = await mount(<CharacterCardTileStory name="Aria Nightshade" width={width} />);
      const nameText = component.getByText("Aria Nightshade", { exact: true });
      await expect(nameText).toBeVisible();
      await expect.poll(() => nameText.evaluate((el: HTMLElement) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    });

    // THE MARKER SURVIVES THE COLLAPSE. `ROW_REVEAL_SWAP` computes `display:none` at coarse on the premise
    // that the toggle carrying the same datum is permanently visible there — the collapse above DELETES that
    // premise, and a plain `ROW_REVEAL_SWAP` would leave a STARRED row with no star anywhere (the exact bug
    // `ROW_REVEAL_SWAP_COARSE_KEEP` was minted for on the chats row). VISIBLE, not merely attached.
    test(`@${width}: a starred row still shows its ★ — the marker is the only telling left`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const component = await mount(<CharacterCardTileStory name="Aria Nightshade" starred={true} width={width} />);
      await expect(component.locator('[data-slot="list-row-markers"]').getByLabel("Starred")).toBeVisible();
    });

    // …and the VERB is still reachable: exactly one door, inside the kebab, wired to the same seam.
    test(`@${width}: the collapsed star verb is reachable through the kebab, and fires the same seam`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const component = await mount(<CharacterCardTileStory name="Aria Nightshade" starred={false} width={width} />);
      await component.getByRole("button", { name: rowActionsName("Aria Nightshade"), exact: true }).click();
      const item = page.getByRole("menuitem", { name: "Star" });
      await expect(item).toHaveCount(1);
      await item.click();
      await expect(component.getByTestId("starred-id")).toHaveText("char_ct_story");
    });
  }
});

// The FINE half of the same pair — the kebab's coarse-only twin must not double the star at a fine pointer,
// where the inline toggle is the one door. This is the census test above restated for the pair: exactly ONE
// telling per pointer class is what keeps the collapse from becoming double-telling.
test("the coarse star twin is absent from the kebab at a fine pointer", async ({ mount, page }) => {
  const component = await mount(<CharacterCardTileStory name="Aria Nightshade" />);
  await component.locator('[data-slot="list-row-root"]').hover();
  await component.getByRole("button", { name: rowActionsName("Aria Nightshade"), exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Star" })).toHaveCount(0);
});
