// CT: the HEAD-BAND REGION CLAIM through the REAL path (`context-bracket.tsx`). A FAKE claimant proves the seam
// with zero rpg involvement:
//
//  - a CLAIMING region takes the pane's identity BAND (under the header row) — and ONLY the band: the bracket
//    renders the header strip, the state rail and the viewport around it, and the section's own header does NOT
//    render beside it ("one slot, three contents — never a second head");
//  - the bracket is handed the FULL resolved tab set (a claim never suppresses resolution) and lands on the
//    `defaultTab` flag exactly as an unclaimed pane does;
//  - a header tab writes the SHARED `contextTab` store — asserted on a probe reading `#state` directly;
//  - a NON-claiming contributor is ignored — the section's own band renders (the §3.3 regression floor);
//  - the shell's own band slot renders NOTHING over a tabs pane, claimed or not.

import { pixelContrast, pixelSurface } from "@orb/testkit/browser/pixel-contrast.ts";
// @orb-waive-file no-test-fabrication(Element): baselined when the gate widened to value casts; burn-down item 906.
import { contrastRatio } from "@orb/tooling/floor/instrument/wcag";
import { expect, test } from "@playwright/experimental-ct-react";
import { ContextMetaRailStory, ContextOwnershipStory, ContextRegionClaimStory, ContextRegionHeaderStory, ContextRegionNoClaimStory } from "../_ct-stories.tsx";

test("a claiming region takes the identity band: its band renders, the section's own does not, the bracket renders around it", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);

  const band = component.locator('[data-slot="context-bracket-band"]');
  await expect(band.getByTestId("fake-band")).toBeVisible();
  await expect(component.getByTestId("section-band")).toHaveCount(0);
  // The shell rendered its ONE column: exactly one tablist (the header strip), one bracket probe handle, and
  // the game state rail as a toolbar of panel content.
  await expect(component.getByRole("tablist")).toHaveCount(1);
  await expect(component.locator("[data-context-bracket]")).toHaveCount(1);
  await expect(component.getByRole("toolbar", { name: "Game state" })).toBeVisible();
  await expect(component.getByRole("tablist", { name: "Chat" })).toBeVisible();
});

test("the bracket is handed the FULL resolved set and lands on the defaultTab flag", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);
  // Every resolved tab crosses — game cells in the state rail, meta tabs in the header strip.
  await expect(component.getByRole("toolbar", { name: "Game state" }).getByRole("button")).toHaveCount(2);
  await expect(component.getByRole("tablist", { name: "Chat" }).getByRole("tab")).toHaveCount(2);
  // `members` is the declared-order first, but `fake.status` flags `defaultTab` — the ONE resolver lands there.
  await expect(component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Status" })).toHaveAttribute("aria-current", "true");
  await expect(component.getByTestId("ctx-body-status")).toBeVisible();
});

test("a header tab writes the SHARED contextTab store (not a local mirror)", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);
  await expect(component.getByTestId("ctx-tab-store")).toHaveText("unset");

  await component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Members", exact: true }).click();

  await expect(component.getByTestId("ctx-tab-store")).toHaveText("members");
  await expect(component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Members", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(component.getByTestId("ctx-body-members")).toBeVisible();
});

test("a NON-claiming region contributor is ignored — the section's own band renders (§3.3 floor)", async ({ mount }) => {
  const component = await mount(<ContextRegionNoClaimStory />);
  await expect(component.getByTestId("fake-band")).toHaveCount(0);
  await expect(component.locator('[data-slot="context-bracket-band"]').getByTestId("section-band")).toBeVisible();
  await expect(component.getByRole("tablist", { name: "Chat" }).getByRole("tab", { name: "Members", exact: true })).toBeVisible();
});

// ── THE OWNERSHIP AXIS, DECODED OUT OF THE FRAMEBUFFER (#874 F1 · #875 F2, side-eye 2026-08-30) ────────
//
// Every one of these was a decision taken in ALPHA space and never checked in PIXEL space: the owning fill
// composited to 1.045:1 and the receded one to 1.001:1 against the pane; the RECEDED kicker came out
// BRIGHTER than the owning one (8.25 vs 8.03) because contrast is measured against each rail's own,
// darker, backdrop; and the locked cell's `opacity: .6` put its caption at 3.54:1 on a control the build
// deliberately does NOT mark `aria-disabled`. `getComputedStyle` can see none of that, and axe scored the
// whole state 100 because its `color-contrast` rule does not composite ancestor `opacity`.
//
// WHAT EACH ARM IS, honestly labelled:
//   · the SURFACE ORDER arm is a FENCE (green before the fix as well as after — the old alphas were
//     ordered, they were just invisible). It pins the ORDER and prints the ratios, so the next "quieter
//     step of the same fill" cannot be credited with an axis it does not carry.
//   · the KICKER arm and the CAPTION arm are DEFECT PROOFS — red on the unmodified source, with the
//     measured numbers recorded beside each expectation. ONE HALF OF THE KICKER ARM IS A FENCE and is
//     labelled so: the HEARTH inversion #861/#875 measured live (8.25 vs 8.03) does NOT reproduce in the
//     shipped Hearth tokens — it was measured in the game room's CARRIED theme (D44), whose neutral ramp is
//     compressed differently. Hearth passed pre-fix; LIGHT was a real red (receded 3.36:1).
const WCAG_TEXT_MIN = 4.5;
/** Two surfaces are "the same material" when their composited medians agree; 1 byte of slack for the
 *  screenshot's own quantisation, not for a fill. */
const SAME_SURFACE_SLACK = 1;

/** THE THREE SHIPPED THEMES, and the arm runs over ALL of them (owner correction, 2026-08-30). The
 *  ownership ORDER is a claim about per-theme TOKEN VALUES, not about a dark/light polarity — a SECOND
 *  dark theme is exactly where a step chosen in alpha space can invert while the first one passes. The
 *  selectors are `theme.css`'s own: `:root` IS Hearth (there is no `[data-theme="hearth"]`), then
 *  `[data-theme="light"]` and `[data-theme="mocha"]`. D71 IMPORTED owner themes are user data and are
 *  deliberately out of pin scope. */
const SHIPPED_THEMES = ["hearth", "light", "mocha"] as const;

/** Hearth is the `:root` default, so its arm carries NO attribute — spelling `data-theme="hearth"` would
 *  silently fall through to the same styles and make the other two arms look verified when they were not. */
function themeAttr(theme: (typeof SHIPPED_THEMES)[number]): Record<string, string> {
  return theme === "hearth" ? {} : { "data-theme": theme };
}

for (const theme of SHIPPED_THEMES) {
  test(`${theme}: FENCE — the header row and band wear the pane's own surface; only the owning state rail is raised`, async ({ mount, page }) => {
    const component = await mount(
      <div {...themeAttr(theme)}>
        <ContextOwnershipStory />
      </div>,
    );
    const [pane, header, band, owning] = await Promise.all([
      pixelSurface(page, component.getByTestId("ctx-pane-surface")),
      pixelSurface(page, component.locator('[data-slot="context-bracket-header"]')),
      pixelSurface(page, component.locator('[data-slot="context-bracket-band"]')),
      pixelSurface(page, component.locator('[data-slot="context-rail"][data-owns="true"]')),
    ]);
    // One shade inside one pane (owner ruling): the header row and the band are the pane, not a raised slab.
    for (const [name, surface] of [
      ["header", header],
      ["band", band],
    ] as const) {
      expect(Math.abs(surface.rgb.r - pane.rgb.r), `${name} ${surface.describe} vs pane ${pane.describe}`).toBeLessThanOrEqual(SAME_SURFACE_SLACK);
      expect(Math.abs(surface.rgb.g - pane.rgb.g)).toBeLessThanOrEqual(SAME_SURFACE_SLACK);
      expect(Math.abs(surface.rgb.b - pane.rgb.b)).toBeLessThanOrEqual(SAME_SURFACE_SLACK);
    }
    // The owning state rail is a step above the pane.
    expect(contrastRatio(owning.rgb, pane.rgb), `owning ${owning.describe} vs pane ${pane.describe}`).toBeGreaterThan(1);
  });

  test(`${theme}: every cell caption clears 4.5:1 — including the LOCKED cell, which is a live control`, async ({ mount, page }) => {
    // RED ON THE UNMODIFIED SOURCE in every theme: the locked `Map` cell wore `opacity-60` on its ROOT,
    // putting its caption at 3.65:1 (Hearth) / 2.67:1 (Light) while its siblings cleared 7:1 — and this cell
    // renounces `aria-disabled` by ruling, so 1.4.3's disabled exemption does not reach it. In LIGHT the
    // receded rail's captions were failing too (3.39:1 at the old `/70`).
    const component = await mount(
      <div {...themeAttr(theme)}>
        <ContextOwnershipStory />
      </div>,
    );
    const captions = component.locator('[data-slot="context-cell-caption"]');
    // A zero here would be a silent pass — the sampler owes its population, on the auto-retrying
    // assertion (a bare `await …count()` samples before the second rail has mounted).
    await expect(captions).toHaveCount(CTX_STATE_STORY_CELLS);
    for (let index = 0; index < CTX_STATE_STORY_CELLS; index += 1) {
      const caption = captions.nth(index);
      // The cells carry a colour TRANSITION, so the decode is POLLED rather than sampled once — a single
      // screenshot can land mid-interpolation on a value that is neither state.
      const name = await caption.innerText();
      await expect
        .poll(async () => (await pixelContrast(page, caption)).ratio, { message: `${name} caption contrast (composited)` })
        .toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
    }
  });
}

test("only the active Game crown fills; inactive host tabs do not advertise selection", async ({ mount }) => {
  const component = await mount(<ContextMetaRailStory paneWidth={640} />);
  const preview = component.getByRole("tab", { name: "Preview", exact: true });
  const game = component.getByRole("tab", { name: "Game", exact: true });
  const activity = component.getByRole("tab", { name: "Activity", exact: true });
  await preview.click();
  await expect(preview).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() => activity.evaluate((element) => getComputedStyle(element.querySelector("svg") as Element).color === getComputedStyle(element).color))
    .toBe(true);
  await expect(game.locator("svg")).toHaveAttribute("fill", "none");
  await game.click();
  await expect(game).toHaveAttribute("aria-selected", "true");
  await expect(game.locator("svg")).toHaveAttribute("fill", "currentColor");
  await preview.click();
  await expect(game.locator("svg")).toHaveAttribute("fill", "none");
});

// ── AN OVERFLOWING STRIP SAYS SO ───────────────────────────────────────────────────────────────────────
// The tab track degrades to a scroll rather than an ellipsis, and nothing else would tell a reader there is
// more: a fade plus a chevron on the hiding edge do. Both ends of the width range are driven, because a point
// measurement never proves a range property.
const STRIP = '[data-slot="context-tab-strip"]';
const STRIP_FADE = '[data-slot="context-rail-fade"]';

test("the header strip marks the edge it is hiding tabs behind — and does not when it fits", async ({ mount }) => {
  const narrow = await mount(<ContextMetaRailStory />);
  const narrowStrip = narrow.locator(STRIP);
  // The five tabs cannot fit 291px at their whole captions, so the track overflows at its END.
  await expect(narrowStrip).toHaveAttribute("data-overflow-end", "true");
  await expect(narrowStrip.locator(STRIP_FADE)).toHaveCount(1);
  // Nothing is hidden at the START yet — the strip has not been scrolled.
  await expect(narrowStrip).toHaveAttribute("data-overflow-start", "false");

  // …and the fade is NOT permanent chrome: at a width the same tabs fit, both edges stand down.
  await narrow.unmount();
  const wide = await mount(<ContextMetaRailStory paneWidth={800} />);
  const wideStrip = wide.locator(STRIP);
  await expect(wideStrip).toHaveAttribute("data-overflow-end", "false");
  await expect(wideStrip).toHaveAttribute("data-overflow-start", "false");
  await expect(wideStrip.locator(STRIP_FADE)).toHaveCount(0);
});

// The gradient alone is unreadable by construction (it fades the fill into transparent), so the chevron is the
// part a reader recognises and an instrument can measure: WCAG 1.4.11 owes it 3:1 against the strip fill.
for (const theme of SHIPPED_THEMES) {
  test(`${theme}: the overflow mark carries a CHEVRON whose ink clears the UI-graphic floor against the strip fill`, async ({ mount, page }) => {
    const component = await mount(
      <div {...themeAttr(theme)}>
        <ContextMetaRailStory />
      </div>,
    );
    const strip = component.locator(STRIP);
    await expect(strip).toHaveAttribute("data-overflow-end", "true");
    const chevron = strip.locator('[data-slot="context-rail-more"]');
    await expect(chevron).toHaveCount(1);
    await expect
      .poll(async () => (await pixelContrast(page, chevron)).ratio, { message: `${theme} overflow chevron vs the strip fill` })
      .toBeGreaterThanOrEqual(UI_GRAPHIC_MIN);
  });
}

/** WCAG 1.4.11 Non-text Contrast — the floor a meaningful graphic owes its adjacent colour. */
const UI_GRAPHIC_MIN = 3;

/** The story's caption census (4 state-rail cells + 2 header tabs) — stated so a story edit that drops a cell cannot quietly
 *  shrink the caption sweep to a green zero. */
const CTX_STATE_STORY_CELLS = 6;

for (const claimed of [true, false]) {
  test(`the shell's band slot renders nothing over a tabs pane (claimed: ${claimed}) — the bracket owns the head`, async ({ mount }) => {
    const component = await mount(<ContextRegionHeaderStory claimed={claimed} />);
    await expect(component).toHaveAttribute("data-testid", "band-slot");
    await expect(component).toBeEmpty();
  });
}
