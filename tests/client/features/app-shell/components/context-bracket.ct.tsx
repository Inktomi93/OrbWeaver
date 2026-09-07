// CT: the HEAD-BAND REGION CLAIM through the REAL path (HUD-1 §3.1/§3.2 as re-shaped by the context
// bracket, #860 — `context-bracket.tsx`). A FAKE claimant proves the seam with zero rpg involvement:
//
//  - a CLAIMING region takes the pane's HEAD BAND — and ONLY the band: the shell's bracket renders the
//    rails, the viewport and the ground around it, and the section's own header does NOT render beside it
//    ("one slot, three contents — never a second head");
//  - the bracket is handed the FULL resolved tab set (a claim never suppresses resolution) and lands on the
//    `defaultTab` flag exactly as an unclaimed pane does;
//  - a rail cell writes the SHARED `contextTab` store — asserted on a probe reading `#state` directly
//    ([[assert-the-mutation-fired]]);
//  - a NON-claiming contributor is ignored — the section's own band renders (the §3.3 regression floor);
//  - the shell's own band slot renders NOTHING over a tabs pane, claimed or not.

import { contrastRatio } from "@orb/tooling/_shared/wcag";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { pixelContrast, pixelSurface } from "../../../../support/browser/pixel-contrast.ts";
import { ContextMetaRailStory, ContextOwnershipStory, ContextRegionClaimStory, ContextRegionHeaderStory, ContextRegionNoClaimStory } from "../_ct-stories.tsx";

test("a claiming region takes the head band: its band renders, the section's own does not, the bracket renders around it", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);

  const band = component.locator('[data-slot="context-bracket-band"]');
  await expect(band.getByTestId("fake-band")).toBeVisible();
  await expect(component.getByTestId("section-band")).toHaveCount(0);
  // The shell rendered its ONE column — no tablist anywhere, one bracket probe handle.
  await expect(component.getByRole("tablist")).toHaveCount(0);
  await expect(component.locator("[data-context-bracket]")).toHaveCount(1);
  await expect(component.getByRole("toolbar", { name: "Game state" })).toBeVisible();
  await expect(component.getByRole("toolbar", { name: "Chat" })).toBeVisible();
});

test("the bracket is handed the FULL resolved set and lands on the defaultTab flag", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);
  // Every resolved tab crosses — game AND meta, split into their rails.
  await expect(component.getByRole("toolbar", { name: "Game state" }).getByRole("button")).toHaveCount(2);
  await expect(component.getByRole("toolbar", { name: "Chat" }).getByRole("button")).toHaveCount(1);
  // `members` is the declared-order first, but `fake.status` flags `defaultTab` — the ONE resolver lands there.
  await expect(component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Status" })).toHaveAttribute("aria-current", "true");
  await expect(component.getByTestId("ctx-body-status")).toBeVisible();
});

test("a rail cell writes the SHARED contextTab store (not a local mirror)", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);
  await expect(component.getByTestId("ctx-tab-store")).toHaveText("unset");

  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Members", exact: true }).click();

  await expect(component.getByTestId("ctx-tab-store")).toHaveText("members");
  await expect(component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Members", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(component.getByTestId("ctx-body-members")).toBeVisible();
});

test("a NON-claiming region contributor is ignored — the section's own band renders (§3.3 floor)", async ({ mount }) => {
  const component = await mount(<ContextRegionNoClaimStory />);
  await expect(component.getByTestId("fake-band")).toHaveCount(0);
  await expect(component.locator('[data-slot="context-bracket-band"]').getByTestId("section-band")).toBeVisible();
  await expect(component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Members", exact: true })).toBeVisible();
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
  test(`${theme}: FENCE — the composited surface order is band == owning rail > receded rail == pane`, async ({ mount, page }) => {
    const component = await mount(
      <div {...themeAttr(theme)}>
        <ContextOwnershipStory />
      </div>,
    );
    const [pane, band, owning, receded] = await Promise.all([
      pixelSurface(page, component.getByTestId("ctx-pane-surface")),
      pixelSurface(page, component.locator('[data-slot="context-bracket-band"]')),
      pixelSurface(page, component.locator('[data-slot="context-rail"][data-owns="true"]')),
      pixelSurface(page, component.locator('[data-slot="context-rail"][data-owns="false"]')),
    ]);
    const owningStep = contrastRatio(owning.rgb, pane.rgb);
    const recededStep = contrastRatio(receded.rgb, pane.rgb);
    // The band and the owning rail are ONE material — the mock's `--raised` on `.band` and `.rail.own`.
    expect(Math.abs(band.rgb.r - owning.rgb.r), `band ${band.describe} vs owning ${owning.describe}`).toBeLessThanOrEqual(SAME_SURFACE_SLACK);
    expect(Math.abs(band.rgb.g - owning.rgb.g)).toBeLessThanOrEqual(SAME_SURFACE_SLACK);
    expect(Math.abs(band.rgb.b - owning.rgb.b)).toBeLessThanOrEqual(SAME_SURFACE_SLACK);
    // The receded rail IS the pane (the mock draws no `.rail.recede` fill), and the owning one is a step
    // above both. The step is small by the artboard's own palette — the assertion is the ORDER.
    expect(recededStep, `receded ${receded.describe} vs pane ${pane.describe}`).toBeLessThan(owningStep);
    expect(owningStep, `owning ${owning.describe} vs pane ${pane.describe}`).toBeGreaterThan(1);
  });

  test(`${theme}: the OWNING rail's kicker reads louder than the receded one's, and both clear 4.5:1`, async ({ mount, page }) => {
    // RED ON THE UNMODIFIED SOURCE in LIGHT (the receded kicker at 3.36:1, under the floor) — a real,
    // unmeasured failure, because the light theme's `muted-foreground` carries only ~6.8:1 of headroom over
    // the sidebar and an alpha eats it. In HEARTH the order held pre-fix (see the header note).
    const component = await mount(
      <div {...themeAttr(theme)}>
        <ContextOwnershipStory />
      </div>,
    );
    const kicker = (owns: string): Locator =>
      component.locator(`[data-slot="context-rail"][data-owns="${owns}"] [data-slot="context-rail-kicker"] span`).first();
    const [owning, receded] = await Promise.all([pixelContrast(page, kicker("true")), pixelContrast(page, kicker("false"))]);

    expect(receded.ratio, `receded kicker ${receded.describe} vs owning kicker ${owning.describe}`).toBeLessThan(owning.ratio);
    expect(receded.ratio, `receded kicker ${receded.describe}`).toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
    expect(owning.ratio, `owning kicker ${owning.describe}`).toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
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

// ── #878 F17: THE RAIL'S TRAIL IS NOT A SEVENTH CELL ───────────────────────────────────────────────────
test("#878 F17: the rail's trail actions are separated from the cell track by a rule", async ({ mount }) => {
  // The host kebab sat INSIDE the cell row — a 34×34 glyph with no caption, beside captioned cells, in a
  // rail whose law is "icon + caption always" (#208). It reads as a cell that forgot its word. It is not a
  // cell (it selects no view) and must not take a caption, so the separation is the fix.
  const component = await mount(<ContextMetaRailStory paneWidth={640} withTrail={true} />);
  const foot = component.locator('[data-slot="context-rail"][data-edge="bottom"]');
  const rule = foot.locator('[data-slot="separator"]');
  await expect(rule).toHaveCount(1);
  await expect(rule).toHaveAttribute("aria-hidden", "true");
  // It sits BETWEEN the cell track and the trail — the geometry is what makes it a separation and not an
  // ornament parked at one end.
  const [trackBox, ruleBox, trailBox] = await Promise.all([
    component.getByRole("toolbar", { name: "Chat" }).boundingBox(),
    rule.boundingBox(),
    foot.getByRole("button", { name: "Fake trail" }).boundingBox(),
  ]);
  if (trackBox === null || ruleBox === null || trailBox === null) {
    throw new Error("expected the foot rail's track, rule and trail to be laid out");
  }
  expect(ruleBox.x).toBeGreaterThanOrEqual(trackBox.x + trackBox.width);
  expect(trailBox.x).toBeGreaterThanOrEqual(ruleBox.x + ruleBox.width);
});

// ── #875 F7/F8: AN OVERFLOWING RAIL SAYS SO ────────────────────────────────────────────────────────────
// The fold is count-gated to six cells (right, after #861's ragged 3+2) and the track degrades to a scroll
// (right by ruling) — and nothing answered the case where the scroll is the ONLY arm and it silently
// clips. Measured live at 1024×768: `scrollWidth 316` vs `clientWidth 290`, and "Activity" painted as
// "Acti" cut at the pane's edge with no ellipsis, no scrollbar, no fade. Both ends of the width range are
// driven here, because a point measurement never proves a range property.
const RAIL_FADE = '[data-slot="context-rail-fade"]';

test("#875 F7/F8: the meta rail marks the edge it is hiding content behind — and does not when it fits", async ({ mount }) => {
  const narrow = await mount(<ContextMetaRailStory />);
  const narrowRail = narrow.locator('[data-slot="context-rail"][data-edge="bottom"]');
  // The five cells cannot fit 291px at their whole captions, so the track overflows at its END.
  await expect(narrowRail).toHaveAttribute("data-overflow-end", "true");
  await expect(narrowRail.locator(RAIL_FADE)).toHaveCount(1);
  // Nothing is hidden at the START yet — the rail has not been scrolled.
  await expect(narrowRail).toHaveAttribute("data-overflow-start", "false");

  // …and the fade is NOT permanent chrome: at a width the same five cells fit, both edges stand down.
  await narrow.unmount();
  const wide = await mount(<ContextMetaRailStory paneWidth={640} />);
  const wideRail = wide.locator('[data-slot="context-rail"][data-edge="bottom"]');
  await expect(wideRail).toHaveAttribute("data-overflow-end", "false");
  await expect(wideRail).toHaveAttribute("data-overflow-start", "false");
  await expect(wideRail.locator(RAIL_FADE)).toHaveCount(0);
});

// ── #899 N9: THE OVERFLOW MARK IS READABLE AS A MARK, NOT AS THE PANEL'S EDGE ──────────────────────────
// The gradient half was correct and unreadable BY CONSTRUCTION: it fades the rail's own fill into
// transparent, so it can have no contrast against the surface it sits on, and at both firing sites the
// first read was still a chopped word. The chevron is the part a reader recognises — and the part an
// instrument can measure, which is exactly why the receipt asks for its contrast against the rail fill.
for (const theme of SHIPPED_THEMES) {
  test(`${theme}: the overflow mark carries a CHEVRON whose ink clears the UI-graphic floor against the rail fill`, async ({ mount, page }) => {
    const component = await mount(
      <div {...themeAttr(theme)}>
        <ContextMetaRailStory />
      </div>,
    );
    const rail = component.locator('[data-slot="context-rail"][data-edge="bottom"]');
    await expect(rail).toHaveAttribute("data-overflow-end", "true");
    const chevron = rail.locator('[data-slot="context-rail-more"]');
    await expect(chevron).toHaveCount(1);
    // WCAG 1.4.11 — a non-text graphic that carries meaning owes 3:1 against its adjacent colour, which
    // here IS the rail fill the fade blends into. Composited, not computed: the mark sits ON the gradient.
    await expect
      .poll(async () => (await pixelContrast(page, chevron)).ratio, { message: `${theme} overflow chevron vs the rail fill` })
      .toBeGreaterThanOrEqual(UI_GRAPHIC_MIN);
  });
}

/** WCAG 1.4.11 Non-text Contrast — the floor a meaningful graphic owes its adjacent colour. */
const UI_GRAPHIC_MIN = 3;

/** The story's cell census (4 game + 2 meta) — stated so a story edit that drops a cell cannot quietly
 *  shrink the caption sweep to a green zero. */
const CTX_STATE_STORY_CELLS = 6;

for (const claimed of [true, false]) {
  test(`the shell's band slot renders nothing over a tabs pane (claimed: ${claimed}) — the bracket owns the head`, async ({ mount }) => {
    const component = await mount(<ContextRegionHeaderStory claimed={claimed} />);
    await expect(component).toHaveAttribute("data-testid", "band-slot");
    await expect(component).toBeEmpty();
  });
}
