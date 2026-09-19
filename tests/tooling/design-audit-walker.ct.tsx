// The hit-area arithmetic of the design-audit in-page fact walker (tooling/src/ui-audit/ops/walker.ts).
// The walker is a raw JS STRING evaluated in the probe page, so a real browser is the only tier that can
// prove it: `elementFromPoint`, layout geometry and pointer-conditional `::before` touch targets do not
// exist in jsdom, and a stubbed DOM would be a lying proof.
//
// WHAT IS PINNED (2026-08-16, the walker's last known false-positive class): ownership is per COMPOSITE,
// not per element. A Base UI Slider's real drag target is the whole `h-control-sm` control row — a mouse
// press at the row's top edge, 60px from the thumb, moves the value — but the outward probe lands on
// `[data-slot=slider-indicator]`, a SIBLING of the thumb inside the same control. Before the widening,
// `ownsPoint` accepted only identity/containment, stalled there, and reported a fine-pointer P1 at 22px on
// a 32px row. The paired control arm is the reason the widening is not a blanket: two genuine neighbouring
// buttons must still measure as sub-targets.
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { Finding, RawSamples } from "../../tooling/src/ui-audit/index.ts";
import { COLLECT_SAMPLES_JS, collectFindings } from "../../tooling/src/ui-audit/index.ts";
import {
  WalkerAccentBorderStory,
  WalkerAriaHiddenVisualStory,
  WalkerBelowTheFoldStory,
  WalkerBoxCarriedIsolatedControlStory,
  WalkerCapsTrackingStory,
  WalkerCastRowStory,
  WalkerClippedInflowControlStory,
  WalkerCoarseTouchFloorStory,
  WalkerDimmedContrastStory,
  WalkerDuplicateDoorStory,
  WalkerDuplicateSlotStory,
  WalkerFinePointerFloorStory,
  WalkerForwardingLabelStory,
  WalkerGradientBackdropStory,
  WalkerListRowCardStory,
  WalkerListRowDoorStory,
  WalkerListRowSelectionStory,
  WalkerNeighbourButtonsStory,
  WalkerPaintLayerStory,
  WalkerProgrammaticFocusDoorStory,
  WalkerPseudoCarriedIsolatedGlyphStory,
  WalkerPseudoPromotionStory,
  WalkerReadingMeasureStory,
  WalkerRowWrappedGlyphStory,
  WalkerScreenReaderOnlyStory,
  WalkerSliderCompositeStory,
  WalkerTooltipHintStory,
  WalkerTranslucentTintStory,
  WalkerTruncationAffordanceStory,
  WalkerViewportEdgeTargetStory,
} from "./_ct-stories.tsx";

/** The `unreachable-hint` census row (#2452) — the fields this file reads, not the whole sample. */
interface UnreachableHint {
  readonly describesDecision: string | null;
  readonly describedByResolved: number;
}

interface TapTarget {
  readonly selector: string;
  readonly width: number;
  readonly height: number;
  /** The #797 lower-bound flag: the outward probe ring was cut by a viewport edge. */
  readonly extentTruncated?: boolean;
}

/** Run the REAL walker string in the mounted page and return its tap-target census.
 *
 *  No harness-chrome filter: the CT provider tree used to mount a toast viewport on every stage, and its
 *  `toast-viewport` selector had to be dropped from the census. The harness stopped mounting a global
 *  outlet in #247, and none of these stories renders one, so nothing is filtered — and a filter kept past
 *  its cause would silently hide a real story control that happened to match. */
async function tapTargets(page: Page): Promise<readonly TapTarget[]> {
  const samples = (await page.evaluate(COLLECT_SAMPLES_JS)) as { readonly tapTargets: readonly TapTarget[] };
  return samples.tapTargets;
}

/** The smallest measured side across every censused control whose selector names `match` — the number a
 *  sub-target finding is minted from. */
function smallestSide(targets: readonly TapTarget[], match: string): number {
  const hits = targets.filter((t) => t.selector.includes(match));
  // Naming the whole census in the failure message: a zero here means the walker never SAW the control
  // (a skipped aria-hidden twin, a changed data-slot), which is a different defect from a wrong number.
  expect(hits.length, `the walker censused no control matching ${match} — saw: ${targets.map((t) => t.selector).join(" | ")}`).toBeGreaterThan(0);
  return Math.min(...hits.map((t) => Math.min(t.width, t.height)));
}

// The fine-pointer floor the walker's consumers judge against (design-audit-checks.ts) — the slider row is
// h-control-sm (32px fine), so a correct measurement clears it and 22 does not.
const FINE_POINTER_FLOOR = 24;

test("a slider's effective target is its whole control row, not the box the sibling probe stalls on", async ({ mount, page }) => {
  await mount(<WalkerSliderCompositeStory />);
  const targets = await tapTargets(page);

  // The censused control is Base UI's native range input INSIDE the thumb (the thumb div itself carries no
  // tabindex, so INTERACTIVE_SELECTOR never matches it) — pinned here because "which element the walker
  // actually flags" is the premise the arithmetic below rests on, and it is not the one you would guess.
  expect(targets.length, `expected exactly one product control on the slider stage — saw: ${targets.map((t) => t.selector).join(" | ")}`).toBe(1);
  const measured = Math.min(targets[0]?.width ?? 0, targets[0]?.height ?? 0);

  // The regression this exists for: 22px (the r=11 probe ring — the last radius whose hit was the thumb
  // itself) was the reported number, and it minted a fine-pointer P1 on a control that is 32px tall.
  expect(measured).toBeGreaterThan(22);
  expect(measured).toBeGreaterThanOrEqual(FINE_POINTER_FLOOR);
});

// ── #1067: the ladder must be able to CONFIRM the floor it judges ───────────────────────────────────
// `HIT_PROBE_RADII` grows the extent outward one radius at a time, so the numbers it can publish are
// exactly `2 x radius`. With `[11, 16, 22]` the reachable verdicts were 22 / 32 / 44 — and the
// fine-pointer floor the checks judge against is 24, which is not on that list. A control owning 24–31px
// (every @orb/ui selection control at `pointer: fine`: an 18px box under a 28px `::before`) therefore
// measured 22 and minted a P1 it could never clear at any size short of 32. Measured on the character
// library's bulk mode: `10 affected of 10 judged; short side 22px`, on rows whose compositor ring answers
// `self` to +/-13px. The rung at 12 is what makes the floor expressible; the negative arm is what keeps a
// genuine 22px control failing.
test("#1067: a 28px pseudo-carried selection control measures its real extent, and a 22px box still fails", async ({ mount, page }) => {
  await mount(<WalkerFinePointerFloorStory />);
  const targets = await tapTargets(page);

  expect(
    smallestSide(targets, "checkbox-root"),
    "a checkbox's fine-pointer ::before is 28px — the ladder must be able to say so instead of capping at the 22px rung",
  ).toBeGreaterThanOrEqual(FINE_POINTER_FLOOR);
  expect(
    smallestSide(targets, "under-floor-box"),
    "a plain 22px box-carried button is genuinely under the floor — the new rung must not credit it",
  ).toBeLessThan(FINE_POINTER_FLOOR);
});

// ── #1829: the ladder's TOP rung has to be landable, not just listed ────────────────────────────────
// #1067 put a rung under every floor. It did not make the top one reachable: the ring was sampled AT the
// radius, and a target of extent exactly `2r` occupies `[c - r, c + r)`, so `c + r` is the neighbour's
// first pixel. 44 is both the top rung and TAP_COARSE_WARN_PX, so every `size-touch-target` control
// published 32 and filed a P2 no design change could clear — measured live as `P2, 11 of 11, short side
// 32px` on the eleven Backup & Restore checkboxes at `--mobile --viewport 430x860` (side-eye 2026-09-06),
// on a ring that answers `self` at +/-21.5px and where a real mouse click there toggles the box.
const COARSE_WARN_FLOOR = 44;

test.describe("#1829 coarse touch floor", () => {
  // The floor is pointer-CONDITIONAL (D62): at a fine pointer the same checkbox owes 24px and its 28px
  // pseudo clears it, so only a coarse context can see this at all.
  test.use({ hasTouch: true });

  test("a checkbox whose coarse ::before is exactly 44px is published as 44, not as the rung below it", async ({ mount, page }) => {
    await mount(<WalkerCoarseTouchFloorStory />);
    const targets = await tapTargets(page);
    expect(
      smallestSide(targets, "checkbox-root"),
      "the coarse ::before is 44x44 and the control owns every pixel of it — a probe that cannot say 44 files a P2 forever",
    ).toBeGreaterThanOrEqual(COARSE_WARN_FLOOR);
  });

  test("the inset is not a free rung: a box-carried 40px control is still under the coarse floor", async ({ mount, page }) => {
    await mount(<WalkerCoarseTouchFloorStory />);
    const targets = await tapTargets(page);
    expect(
      smallestSide(targets, "coarse-under-floor-box"),
      "40px is a genuine near-miss with no pseudo to carry it — recovering a target's last owned pixel must not promote it",
    ).toBeLessThan(COARSE_WARN_FLOOR);
  });
});

test("two genuine neighbours stay sub-targets — the widening is per composite, never a blanket", async ({ mount, page }) => {
  await mount(<WalkerNeighbourButtonsStory />);
  const targets = await tapTargets(page);

  // Each button is a real, separately-offered control 4px from the other. Neither may inherit the row.
  for (const testid of ["neighbour-a", "neighbour-b"]) {
    expect(smallestSide(targets, testid), `${testid} must still measure as a sub-target`).toBeLessThan(FINE_POINTER_FLOOR);
  }
});

// ── #662/#665: box- vs pseudo-carried ancestor credit ────────────────────────────────────────────────
// Before the fix, `ownsPoint`'s ancestor clause (and `sharedCompositeOwns`'s own static-wrapper credit)
// made a control ALONE in a padded wrapper structurally un-failable: walking outward always landed back
// on the wrapper, so the census reported the full 44px floor no matter how small the control's real box
// was. Both directions are pinned: the box-carried stage must now FAIL (measure its own tiny box), and
// the pseudo-carried stage — the ancestor clause's one legitimate purpose — must still PASS.

test("#662/#665: a box-carried control alone in a padded wrapper measures its OWN box, not the wrapper", async ({ mount, page }) => {
  await mount(<WalkerBoxCarriedIsolatedControlStory />);
  const measured = smallestSide(await tapTargets(page), "box-carried-isolated");

  // The regression this exists for: the unconditional ancestor clause reported 44 here regardless of the
  // control's real 16x16 box. A correct measurement is close to the box, never the wrapper's fabricated
  // floor.
  expect(measured, "a plain 16px button must not borrow its padded wrapper's extent").toBeLessThan(FINE_POINTER_FLOOR);
});

test("#662/#665: an overflowing ::before pseudo still carries the floor when its control is isolated", async ({ mount, page }) => {
  await mount(<WalkerPseudoCarriedIsolatedGlyphStory />);
  const measured = smallestSide(await tapTargets(page), "pseudo-carried-isolated");

  // The ancestor clause's MINTED purpose (the pseudo has no DOM node of its own) must survive the fix —
  // this is the one shape ancestor-credit exists for, and closing #662/#665 must not also close this.
  expect(measured, "a glyph button's overflowing ::before must still reach the fine-pointer floor").toBeGreaterThanOrEqual(FINE_POINTER_FLOOR);
});

// ── #807: credit only FORWARDING ancestors (owner ruling 2026-08-30) ─────────────────────────────
// The composite/pseudo ancestor credit published a 44x44 target for the Settings→Plugins capability
// control while the compositor said a PARAGRAPH owned the right-hand ring point and the row did not
// toggle. A pseudo-carried control needs no ancestor to speak for it — elementFromPoint inside an
// overflowing hit pseudo returns its ORIGINATING element — so the credit only ever added the lie.
//
// THE DISCRIMINATING ARM MOVED AT #2300, and the reason is the finding. With ancestor credit scoped to
// the pseudo's MEASURED rect, the live geometry this story was built from (prose at the row's +30px) no
// longer discriminates: those pixels are past the glyph's real reach at every root scale, so the
// row-wrapped glyph and the isolated one now measure the SAME — which is the truth, and which used to be
// hidden because the isolated arm was inflated by wrapper credit rather than the row-wrapped one being
// deflated by prose. Both facts are asserted: the live arm must EQUAL the isolated one, and a tight arm
// whose prose actually covers pixels the pseudo reaches must cap BELOW it. Dropping the second would
// leave #807's ruling with no arm that can fail.
test("#807: a control whose outward ring is owned by non-forwarding prose loses the composite credit", async ({ mount, page }) => {
  await mount(<WalkerRowWrappedGlyphStory />);
  const targets = await tapTargets(page);
  const alone = smallestSide(targets, "glyph-alone");
  const tight = smallestSide(targets, "glyph-in-tight-row");

  expect(
    tight,
    `the capability-row shape must measure the pixels it OWNS, not the row's — the prose over its ring forwards nothing. alone=${alone} tight=${tight}`,
  ).toBeLessThan(alone);
});

test("#2300: prose BEYOND the pseudo's measured reach takes nothing away — the live +30px arm equals the isolated one", async ({ mount, page }) => {
  await mount(<WalkerRowWrappedGlyphStory />);
  const targets = await tapTargets(page);
  const alone = smallestSide(targets, "glyph-alone");
  const inRow = smallestSide(targets, "glyph-in-row");

  // Before geometry-scoped credit these differed — and the difference was the isolated arm's fabrication,
  // not the row's loss. A probe that reports a smaller target for a control nothing overlaps is measuring
  // its wrapper.
  expect(inRow, `alone=${alone} inRow=${inRow}`).toBe(alone);
});

test("#807 does not disarm the probe: an isolated pseudo-carried glyph keeps its full extent", async ({ mount, page }) => {
  await mount(<WalkerRowWrappedGlyphStory />);
  // #662/#665's surviving half, asserted in the SAME mount as the row-wrapped arm: narrowing the credit
  // must not turn every glyph button back into a bare-box sub-target.
  expect(
    smallestSide(await tapTargets(page), "glyph-alone"),
    "a glyph button alone with its overflowing ::before still reaches the fine-pointer floor",
  ).toBeGreaterThanOrEqual(FINE_POINTER_FLOOR);
});

test("a list-row wrapper around its one control is not a nested card, while a real inner panel remains red", async ({ mount, page }) => {
  await mount(<WalkerListRowCardStory />);
  const findings = collectFindings(await samplesOf(page));
  const nested = selectorsFor(findings, "nested-card");

  expect(nested, "the sanctioned list-row wrapper is the button's visual host, not another decorative card").not.toContain("[data-testid=list-row-wrapper]");
  expect(nested, "a genuinely decorative inner panel must remain the defect control").toContain("[data-testid=real-nested-card]");
});

/** The walker's whole raw sample set for the mounted stage. */
async function samplesOf(page: Page): Promise<RawSamples> {
  return (await page.evaluate(COLLECT_SAMPLES_JS)) as RawSamples;
}

// ── A finding must be LOCATABLE (issue #148 item 5) ──────────────────────────────────────────────
// `data-slot` names a COMPONENT KIND, not an element: one live audit returned six findings all reading
// `[data-slot=text]` plus one `[data-slot=button]` — nobody could tell them apart, let alone find them, so
// two real text-overflow defects were unforwardable. An anchor is only an anchor if it resolves to ONE node.
test("a selector the walker reports resolves to exactly one element, even when data-slot repeats", async ({ mount, page }) => {
  await mount(<WalkerDuplicateSlotStory />);
  const samples = await samplesOf(page);

  const reported = samples.textStyles.filter((t) => t.tag === "span").map((t) => t.selector);
  expect(reported.length, `expected the walker to censuse both spans — saw ${JSON.stringify(reported)}`).toBe(2);
  expect(new Set(reported).size, `both spans reported the SAME selector ${JSON.stringify(reported[0])} — neither can be found`).toBe(2);
  const counts = await Promise.all(reported.map(async (selector) => ({ selector, count: await page.locator(selector).count() })));
  for (const { selector, count } of counts) {
    expect(count, `${selector} does not name exactly one element`).toBe(1);
  }
});

// ── The ratified micro-caps voice is not a tracking defect (issue #148 item 4) ────────────────────
// 0.08em on caps IS the density-spec §2.3 label voice. The rule already exempted `text-transform:
// uppercase`; it could not see caps that were TYPED, which render identically — so the kicker voice was
// flagged wherever the caps came from the content instead of the stylesheet.
function trackingFindings(samples: RawSamples): Finding[] {
  return collectFindings(samples).filter((f) => f.rule === "wide-tracking");
}

test("wide-tracking exempts the ratified caps kicker — typed caps as well as transformed", async ({ mount, page }) => {
  await mount(<WalkerCapsTrackingStory />);
  const findings = trackingFindings(await samplesOf(page));

  const flagged = findings.map((f) => f.selector);
  expect(flagged, `the caps kicker voice must not be a tracking finding — got ${JSON.stringify(flagged)}`).not.toContain("[data-testid=kicker-transformed]");
  expect(flagged, `typed caps render the same pixels as transformed caps — got ${JSON.stringify(flagged)}`).not.toContain("[data-testid=kicker-literal]");
});

test("wide-tracking still fires on sentence-case running text — the exemption is caps, not tracking", async ({ mount, page }) => {
  await mount(<WalkerCapsTrackingStory />);
  const findings = trackingFindings(await samplesOf(page));

  expect(
    findings.map((f) => f.selector),
    "0.08em on ordinary prose is the defect this rule exists for and must survive the exemption",
  ).toContain("[data-testid=tracked-prose]");
});

/** Every selector the given rule was reported against on the mounted stage. */
function selectorsFor(findings: readonly Finding[], rule: string): string[] {
  return findings.filter((f) => f.rule === rule).map((f) => f.selector);
}

// ── Ancestor opacity dims the FOREGROUND (issue #188) ─────────────────────────────────────────────
// CSS opacity composites a whole subtree over what is behind it, so text inside an `opacity: 0.6` group is
// painted as a BLEND of its color and the backdrop — `style.color` still reads the undimmed rgb. The live home
// surface's two "waiting on:" lines measured 3.68:1 that way under snap's --contrast (which tags `dimmed
// α0.60`) while design-audit reported nothing at all. The two instruments must agree.
test("text dimmed by an ancestor's opacity fails contrast on the composited color, not the authored one", async ({ mount, page }) => {
  await mount(<WalkerDimmedContrastStory />);
  const findings = collectFindings(await samplesOf(page));

  const flagged = selectorsFor(findings, "contrast");
  expect(flagged, `an α0.6 group over a near-black backdrop paints ~3.9:1 — got ${JSON.stringify(findings.map((f) => `${f.rule} ${f.selector}`))}`).toContain(
    "[data-testid=dimmed-line]",
  );
  const dimmedFinding = findings.find((f) => f.rule === "contrast" && f.selector === "[data-testid=dimmed-line]");
  expect(dimmedFinding?.value, "the finding must say the ratio was measured on a dimmed foreground, the way snap's --contrast does").toContain("dimmed");
});

test("the SAME color at full opacity still passes — the composite is the defect, not the color", async ({ mount, page }) => {
  await mount(<WalkerDimmedContrastStory />);
  const findings = collectFindings(await samplesOf(page));

  expect(selectorsFor(findings, "contrast"), "rgb(180,180,185) on rgb(16,16,20) is ~9:1 undimmed — flagging it would be a false positive").not.toContain(
    "[data-testid=undimmed-line]",
  );
});

// ── A translucent tint is not a backdrop (issue #188) ─────────────────────────────────────────────
// The backdrop walk took the first background-color with alpha > 0.1 and DISCARDED the alpha, so a chat list
// row's 10%-alpha selected tint measured as a saturated orange surface — 1.14:1 plus a gray-on-color finding
// against a color nothing on screen is painted. snap's --contrast composites down to the first opaque base for
// exactly this reason (its own 1.11-vs-2.6 false FAIL); the two instruments must agree about what is behind a
// glyph.
test("text over a 10%-alpha tint is measured against the COMPOSITE, not the tint's own color", async ({ mount, page }) => {
  await mount(<WalkerTranslucentTintStory />);
  const findings = collectFindings(await samplesOf(page));

  const onLine = findings.filter((f) => f.selector === "[data-testid=tinted-row-subtitle]");
  expect(onLine, `light text over a near-black base reads ~11:1 — every color finding here is fiction: ${JSON.stringify(onLine)}`).toEqual([]);
});

// ── The accent-border rule must SEE the colors this codebase can produce (issue #188) ─────────────
// Tokens-only law means every authored color reaches the page as `oklch(...)`, and getComputedStyle passes that
// spelling straight through. A rgb-regex-only sampler therefore reads `null` for every border color on the tree
// and the whole `side-tab` / `border-accent-on-rounded` family is structurally dead — measured live: a 3px
// oklch left border on a 10px-radius home card produced zero findings.
test("a thick oklch accent edge on a rounded card fires BOTH tells — the §6 absolute bans", async ({ mount, page }) => {
  await mount(<WalkerAccentBorderStory />);
  const findings = collectFindings(await samplesOf(page));

  const seen = JSON.stringify(findings.map((f) => `${f.rule} ${f.selector}`));
  expect(selectorsFor(findings, "side-tab"), `an oklch accent edge is still an accent edge — got ${seen}`).toContain("[data-testid=accent-card-oklch]");
  expect(selectorsFor(findings, "border-accent-on-rounded"), `a 3px edge on a 10px radius fights the corner on ANY side — got ${seen}`).toContain(
    "[data-testid=accent-card-oklch]",
  );
});

test("the rgb-authored twin fires identically, and a hairline neutral card stays clean", async ({ mount, page }) => {
  await mount(<WalkerAccentBorderStory />);
  const findings = collectFindings(await samplesOf(page));

  expect(selectorsFor(findings, "side-tab")).toContain("[data-testid=accent-card-rgb]");
  expect(selectorsFor(findings, "border-accent-on-rounded")).toContain("[data-testid=accent-card-rgb]");
  const neutral = findings.filter((f) => f.selector === "[data-testid=neutral-card]" && (f.rule === "side-tab" || f.rule === "border-accent-on-rounded"));
  expect(neutral, "a hairline achromatic border on a radius is the sanctioned elevation recipe").toEqual([]);
});

// ── The RATIFIED ListRow selection accent, and the exemption that must not widen (issue #485) ─────
// OWNER RULED 2026-08-22: the ListRow selected-row left ember bar stands as shipped, so design-audit carries
// a SCOPED exemption for it. The exemption is a two-halved predicate — the primitive's own slot AND
// `data-selected` — because a one-halved version is exactly how an exemption eats the rule it lives in: keyed
// on the slot alone it would licence every list row to wear a decorative accent edge at rest, and keyed on
// the state alone it would licence any selected box anywhere. Both negative halves are pinned below.
function accentRulesOn(findings: readonly Finding[], testId: string): string[] {
  return findings
    .filter((f) => f.selector === `[data-testid=${testId}]` && (f.rule === "side-tab" || f.rule === "border-accent-on-rounded"))
    .map((f) => f.rule);
}

test("the selected ListRow's left ember bar is exempt on BOTH of the primitive's carriers", async ({ mount, page }) => {
  await mount(<WalkerListRowSelectionStory />);
  const findings = collectFindings(await samplesOf(page));

  const seen = JSON.stringify(findings.map((f) => `${f.rule} ${f.selector}`));
  expect(accentRulesOn(findings, "ratified-selected-body"), `the default rowTint arm is the ratified idiom — got ${seen}`).toEqual([]);
  expect(accentRulesOn(findings, "ratified-selected-root"), `the whole-row rowTint arm is the same idiom — got ${seen}`).toEqual([]);
});

test("the exemption did not widen: an unselected row, a selected non-row, and a plain card all still fire BOTH tells", async ({ mount, page }) => {
  await mount(<WalkerListRowSelectionStory />);
  const findings = collectFindings(await samplesOf(page));

  const seen = JSON.stringify(findings.map((f) => `${f.rule} ${f.selector}`));
  for (const testId of ["unselected-row-accent", "selected-not-a-list-row", "plain-accent-card"]) {
    const rules = accentRulesOn(findings, testId);
    expect(rules, `${testId} is not the ratified idiom and must still be judged — got ${seen}`).toContain("side-tab");
    expect(rules, `${testId} still fights its own corner radius — got ${seen}`).toContain("border-accent-on-rounded");
  }
});

// ── The screen-reader-only state paints nothing, so the paint rules must not judge it ─────────────
// The shell's skip link wears the app-wide `sr-only` posture on EVERY surface, and at rest it computes
// `position:absolute; overflow:hidden; clip-path:inset(50%); white-space:nowrap` — a 26x32 box with
// clientWidth 24 and a nowrap scrollWidth of 70. text-overflow read that as a 46px spill and tap-target
// read the box as a 26px target: two P1s per surface against pixels nobody paints, which is what made
// `--fail-on P1` untrustworthy for the whole rail sweep. The skip is a COMPUTED-STATE test, which is what
// keeps the revealed (`not-sr-only`) arm and every ordinary clipped control judged.
test("neither sr-only spelling is a text-overflow finding — clipped content spills nowhere", async ({ mount, page }) => {
  await mount(<WalkerScreenReaderOnlyStory />);
  const findings = collectFindings(await samplesOf(page));

  const flagged = selectorsFor(findings, "text-overflow");
  const seen = JSON.stringify(flagged);
  expect(flagged, `clip-path: inset(50%) hides the box — a spill measured inside it is fiction. got ${seen}`).not.toContain("[data-testid=sr-skip-modern]");
  expect(flagged, `clip: rect(0,0,0,0) is the legacy spelling of the same state. got ${seen}`).not.toContain("[data-testid=sr-skip-legacy]");
  expect(flagged, `a line inside a clipped live region paints no pixels either — hidden-ness inherits. got ${seen}`).not.toContain(
    "[data-testid=sr-nested-line]",
  );
});

test("the revealed arm and an ordinary clipped box still fire text-overflow — the rule stays alive", async ({ mount, page }) => {
  await mount(<WalkerScreenReaderOnlyStory />);
  const findings = collectFindings(await samplesOf(page));

  const flagged = selectorsFor(findings, "text-overflow");
  const seen = JSON.stringify(flagged);
  expect(flagged, `focus-visible:not-sr-only drops the clip — a focused skip link that overflows is a real defect. got ${seen}`).toContain(
    "[data-testid=revealed-skip]",
  );
  expect(flagged, `overflow:hidden WITHOUT a collapsing clip is the ordinary truncation defect. got ${seen}`).toContain("[data-testid=visible-overflow]");
});

// ── truncation is a DEFECT only without an affordance (#825) ──────────────────────────────────────
// The rule fired on `scrollWidth > clientWidth` alone and minted a P1 against the topbar chat title —
// `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`, scrollWidth 201 / clientWidth 116 — i.e.
// against the house's own correct truncation idiom, on a surface where it would have fired on every
// truncating label (docs/reviews/side-eye/2026-08-30-this-chat-cls.md §6 retraction 6 / §9-I1). Both
// directions are pinned here: the silences AND the bare clip that must still fire, because a rule that
// only learns to shut up is a deleted rule.
test("a truncation that PAINTS its ellipsis is not a finding — on the node or on the clipping ancestor", async ({ mount, page }) => {
  await mount(<WalkerTruncationAffordanceStory />);
  const findings = collectFindings(await samplesOf(page));

  const flagged = selectorsFor(findings, "text-overflow");
  const seen = JSON.stringify(flagged);
  expect(flagged, `text-overflow:ellipsis IS the truncation affordance — this is the shipped idiom. got ${seen}`).not.toContain(
    "[data-testid=ellipsis-truncated]",
  );
  expect(flagged, `the app's real shape puts the clip+ellipsis on the wrapper and the text in an inline child. got ${seen}`).not.toContain(
    "[data-testid=inline-in-ellipsis-clip]",
  );
  expect(flagged, `a title carrying the FULL value is the other honest affordance — the value is one hover away. got ${seen}`).not.toContain(
    "[data-testid=titled-clip]",
  );
});

test("a bare clip with no ellipsis and no full-value affordance still fires — both arms", async ({ mount, page }) => {
  await mount(<WalkerTruncationAffordanceStory />);
  const findings = collectFindings(await samplesOf(page));

  const flagged = selectorsFor(findings, "text-overflow");
  const seen = JSON.stringify(flagged);
  expect(flagged, `overflow:hidden with no ellipsis cuts the string mid-word and says nothing. got ${seen}`).toContain("[data-testid=clipped-no-affordance]");
  expect(flagged, `the inline arm keeps the same law: a bare clipping wrapper is still a defect. got ${seen}`).toContain("[data-testid=inline-in-bare-clip]");
});

test("a label erased to 0px stays #816's family — the two rules never double-report", async ({ mount, page }) => {
  await mount(<WalkerTruncationAffordanceStory />);
  const findings = collectFindings(await samplesOf(page));

  const seen = JSON.stringify(findings.map((f) => `${f.rule} ${f.selector}`));
  expect(selectorsFor(findings, "truncated-to-nothing"), `a name at 0px is GONE, not truncated. got ${seen}`).toContain("[data-testid=erased-label]");
  expect(selectorsFor(findings, "text-overflow"), `an ellipsis on a zero-width box paints nothing — it is not this rule's silence. got ${seen}`).not.toContain(
    "[data-testid=erased-label]",
  );
});

test("an sr-only control is not a tap target, while a 20px visible button still is", async ({ mount, page }) => {
  await mount(<WalkerScreenReaderOnlyStory />);
  const findings = collectFindings(await samplesOf(page));

  const flagged = selectorsFor(findings, "tap-target");
  const seen = JSON.stringify(flagged);
  expect(flagged, `a clipped stub offers the pointer nothing to hit or miss. got ${seen}`).not.toContain("[data-testid=sr-skip-modern]");
  expect(flagged, `same state, legacy spelling. got ${seen}`).not.toContain("[data-testid=sr-skip-legacy]");
  expect(flagged, `a 20x20 offered control is under the 24px fine-pointer floor and must still fail. got ${seen}`).toContain("[data-testid=visible-subtarget]");
});

test("the a11y lens keeps seeing what the paint lens drops — a nameless sr-only control still fails", async ({ mount, page }) => {
  await mount(<WalkerScreenReaderOnlyStory />);
  const findings = collectFindings(await samplesOf(page));

  expect(
    selectorsFor(findings, "aria-name"),
    `a screen-reader-only control lives or dies by its name — got ${JSON.stringify(findings.map((f) => `${f.rule} ${f.selector}`))}`,
  ).toContain("[data-testid=sr-nameless]");
});

// ── A fixed art layer is not visible to an ancestor walk (issue #218) ─────────────────────────────
// The app paints its wallpaper as a FIXED, contentless sibling over the near-black body base, and the chat
// transcript's reading plate is 65% translucent. Compositing the plate onto that base produced
// rgb(160,157,155) — a color no pixel on screen has — and 28 P1 contrast findings on one transcript at
// 3.16:1 where snap's pixel sample reads 4.94:1. The walker's own law is that these two instruments must
// not disagree about what is behind a glyph, so the walk must now REFUSE rather than fabricate: the runner
// (design-audit.ts) settles an unresolved backdrop from real pixels, or says NO VERDICT out loud.
test("text over a translucent plate with a fixed art layer behind it gets NO css-resolved contrast verdict", async ({ mount, page }) => {
  await mount(<WalkerPaintLayerStory />);
  const findings = collectFindings(await samplesOf(page));

  const onLine = findings.filter((f) => f.selector === "[data-testid=plate-line]");
  expect(onLine, `the DOM walk cannot know what the wallpaper paints — every verdict here is fabricated: ${JSON.stringify(onLine)}`).toEqual([]);
});

test("an opaque card with nothing painting over it is still judged — the refusal is not a mute", async ({ mount, page }) => {
  await mount(<WalkerPaintLayerStory />);
  const findings = collectFindings(await samplesOf(page));

  expect(
    selectorsFor(findings, "contrast"),
    `rgb(74,74,80) on rgb(24,24,28) is ~2:1 and its base carries no paint layer — got ${JSON.stringify(findings.map((f) => `${f.rule} ${f.selector}`))}`,
  ).toContain("[data-testid=card-line]");
});

// ── A gradient's color space is not its format either (issue #189) ────────────────────────────────
// `parseGradientStops` matched rgb()/hex only, so an oklch-authored gradient — the ONLY spelling a
// tokens-only tree produces — yielded zero stops, `resolveBackdrop` fell through to `image-indeterminate`,
// and every glyph over it minted a false P1 `text-over-art` against a backdrop whose colors are fully
// known. Latent when filed (no such surface on home or the chat room), and the exact sibling of the
// border/contrast family that 7ad597e6d fixed with the canvas normalizer.
test("a legible oklch gradient backdrop mints nothing — its stops are known, so there is no art to bleed over", async ({ mount, page }) => {
  await mount(<WalkerGradientBackdropStory />);
  const findings = collectFindings(await samplesOf(page));

  const onLine = findings.filter((f) => f.selector === "[data-testid=oklch-gradient-line]" && (f.rule === "text-over-art" || f.rule === "contrast"));
  expect(onLine, `near-white copy over a dark oklch ramp reads >13:1 against both stops — every finding here is fiction: ${JSON.stringify(onLine)}`).toEqual(
    [],
  );
});

test("an illegible oklch gradient fails as a WORST-STOP ratio, not as an indeterminate refusal", async ({ mount, page }) => {
  await mount(<WalkerGradientBackdropStory />);
  const findings = collectFindings(await samplesOf(page));

  const bled = findings.find((f) => f.selector === "[data-testid=oklch-gradient-bled]" && f.rule === "text-over-art");
  const seen = JSON.stringify(findings.map((f) => `${f.rule} ${f.severity} ${f.selector} ${f.value}`));
  expect(bled, `near-white copy on a near-white oklch ramp is the bled-over-art defect — got ${seen}`).toBeDefined();
  expect(bled?.severity, "a parsed gradient that fails is a P0 verdict; the P1 flavour is the indeterminate refusal").toBe("P0");
  expect(bled?.value, `the value must name the measured worst stop — an unparsed gradient cannot produce one. got ${seen}`).toContain("worst-stop");
});

test("the rgb-authored twin stays clean — the normalizer widened the parse, it did not change the math", async ({ mount, page }) => {
  await mount(<WalkerGradientBackdropStory />);
  const findings = collectFindings(await samplesOf(page));

  const onLine = findings.filter((f) => f.selector === "[data-testid=rgb-gradient-line]" && (f.rule === "text-over-art" || f.rule === "contrast"));
  expect(onLine, `the rgb ramp was never blind and its contrast is the same ~14:1 — got ${JSON.stringify(onLine)}`).toEqual([]);
});

// ── aria-hidden is an ACCESSIBILITY fact, not a paint one (issue #253) ────────────────────────────
// The text walk skipped every `aria-hidden` subtree outright, and `aria-hidden` also sat inside the
// type-floor's code-context exemption. So three baseline findings (wide-tracking, line-length,
// undersized-ui-text on the facet preview) VANISHED from the scan the day #230 marked that preview
// aria-hidden — correctly, for naming — while it still rendered at 10.5px / 0.84px tracking / 1,283 chars.
// Sighted users read what the scanner had stopped looking at. The split these two tests pin: the VISUAL
// families judge rendered pixels regardless of the accessibility tree, and the NAME/target families keep
// skipping aria-hidden, because that is where the attribute really decides the answer.
test("the visual families judge aria-hidden text — pixels do not consult the accessibility tree", async ({ mount, page }) => {
  await mount(<WalkerAriaHiddenVisualStory />);
  const findings = collectFindings(await samplesOf(page));
  const seen = JSON.stringify(findings.map((f) => `${f.rule} ${f.selector}`));

  expect(selectorsFor(findings, "contrast"), `rgb(56,56,62) on rgb(16,16,20) is ~1.3:1 whether or not it is announced — got ${seen}`).toContain(
    "[data-testid=hidden-low-contrast]",
  );
  expect(selectorsFor(findings, "text-below-ramp"), `a 9px aria-hidden paragraph is still 9px of paint — got ${seen}`).toContain(
    "[data-testid=hidden-below-ramp]",
  );
  expect(selectorsFor(findings, "wide-tracking"), `0.08em on sentence-case prose is the tracking defect, announced or not — got ${seen}`).toContain(
    "[data-testid=hidden-tracked-prose]",
  );
  expect(selectorsFor(findings, "undersized-ui-text"), `a 10px control label is below the 11px functional floor — got ${seen}`).toContain(
    "[data-testid=hidden-small-control]",
  );
});

test("the name/target census still skips aria-hidden — the split is per rule FAMILY, not global", async ({ mount, page }) => {
  await mount(<WalkerAriaHiddenVisualStory />);
  const targets = await tapTargets(page);
  const findings = collectFindings(await samplesOf(page));

  expect(
    targets.map((t) => t.selector).filter((s) => s.includes("hidden-small-control")),
    "an aria-hidden button is not an offered target: the tap-target census is an ACCESSIBILITY question and must keep its skip",
  ).toEqual([]);
  expect(
    findings.filter((f) => f.selector === "[data-testid=shown-legible-line]"),
    `the announced, legible control line must stay clean — a widened walk that flags it is a false-positive factory. got ${JSON.stringify(findings.map((f) => `${f.rule} ${f.selector}`))}`,
  ).toEqual([]);
});

// ── The dual-home lens, runtime half (issue #252) ─────────────────────────────────────────────────
// The static gate censuses tRPC call sites per rail section and cannot see a REGISTRY-RENDERED action: one
// call site behind N rendered slots. That is exactly the founding complaint's shape — "new chat lives in
// three places", all three calling one shared state action, which no call-site census can count as three.
// This lens counts what the USER sees: the same (role, accessible name) offered more than once on one plane.
// Its false-positive class is per-datum repetition, and the second test is the arm that keeps it honest.
test("one action offered from three unrelated places on one plane is ONE finding naming all three", async ({ mount, page }) => {
  await mount(<WalkerDuplicateDoorStory />);
  const findings = collectFindings(await samplesOf(page));
  const seen = JSON.stringify(findings.map((f) => `${f.rule} ${f.value}`));

  const doors = findings.filter((f) => f.rule === "duplicate-action-door");
  expect(doors.length, `three doors to one verb is one finding about one verb, not three — got ${seen}`).toBe(1);
  expect(doors[0]?.value, `the name key folds case and trailing punctuation, so "New chat"/"new chat"/"New chat…" are one door — got ${seen}`).toBe(
    '3x button "new chat"',
  );
  expect(doors[0]?.message, "the finding must name every door, or a reader cannot decide which one to delete").toContain(" AND ");
});

test("per-datum repeats and same-role-different-name controls are not duplicate doors", async ({ mount, page }) => {
  await mount(<WalkerDuplicateDoorStory />);
  const findings = collectFindings(await samplesOf(page));
  const values = findings.filter((f) => f.rule === "duplicate-action-door").map((f) => f.value);

  expect(values.join(" "), 'three list rows each offering "Open" are three chats, not three doors — flagging them makes the lens useless').not.toContain(
    '"open"',
  );
  expect(values.join(" "), "a button whose name differs is a different door — the key is (role, NAME), never role alone").not.toContain('"import a card"');
});

// ── Sibling rows of one list are ONE home, however their subtrees diverge (issue #851) ────────────
// The identical-path fingerprint above assumes per-datum rows render an identical chain. A row with a
// conditional wrapper does not: measured live on the transcript at `--mobile`, two messages reached their
// "More message actions" button through `theme-scope` and `message-content-column`, and the rule reported
// two homes for a plain per-row action. Desktop hid it (only the hovered row's cluster is offered), so the
// rule was set to fire on every virtualized list precisely at coarse pointer. The two controls in the same
// mount are what keep the exclusion from being a blanket.
test("three list rows whose subtrees diverge are one per-datum home, not a duplicate door", async ({ mount, page }) => {
  await mount(<WalkerListRowDoorStory />);
  const findings = collectFindings(await samplesOf(page));
  const values = findings.filter((f) => f.rule === "duplicate-action-door").map((f) => f.value);

  expect(
    values.join(" "),
    `one action cluster per message row is per-datum repetition however differently the rows are wrapped — got ${JSON.stringify(values)}`,
  ).not.toContain('"more message actions"');
});

test("the sibling-row fold does not disarm the rule: one action twice in a row, and two homes outside the list, still fire", async ({ mount, page }) => {
  await mount(<WalkerListRowDoorStory />);
  const findings = collectFindings(await samplesOf(page));
  const values = findings.filter((f) => f.rule === "duplicate-action-door").map((f) => f.value);

  expect(values, 'a header AND a footer "Copy message" INSIDE one row are two homes — rows fold, doors within a row do not').toContain(
    '2x button "copy message"',
  );
  expect(values, "a topbar and a tray door to one verb are untouched by any list reasoning").toContain('2x button "pin this chat"');
});

// ── Programmatic focus wrappers are census nodes, not action doors (issue #370) ───────────────────
// Modal/command primitives use generic tabindex=-1 wrappers as imperative focus targets. They remain
// relevant to the focus and accessibility censuses, but inherited descendant text does not turn them into
// user actions. The paired native buttons keep the duplicate detector's real bite in the same mounted tree.
test("nested generic tabindex=-1 focus wrappers stay censused without becoming duplicate action doors", async ({ mount, page }) => {
  await mount(<WalkerProgrammaticFocusDoorStory />);
  const samples = await samplesOf(page);
  const findings = collectFindings(samples);

  const focusSelectors = ["[data-testid=focus-wrapper-outer]", "[data-testid=focus-wrapper-inner]"];
  expect(
    samples.accessibleNames.filter((sample) => focusSelectors.includes(sample.selector)).map((sample) => sample.selector),
    "programmatic focus wrappers remain in the accessibility census",
  ).toEqual(focusSelectors);
  expect(
    samples.tabIndexes.filter((sample) => focusSelectors.includes(sample.selector)),
    "programmatic focus wrappers remain in the tabindex census",
  ).toEqual(focusSelectors.map((selector) => ({ selector, tabIndex: -1 })));
  expect(
    findings.filter((finding) => finding.rule === "duplicate-action-door" && finding.value.includes('generic "programmatic focus target"')),
    "generic tabindex=-1 wrappers expose no user action and must not become duplicate doors",
  ).toEqual([]);
});

test("two real same-role same-name buttons still produce exactly one duplicate-action-door finding", async ({ mount, page }) => {
  await mount(<WalkerProgrammaticFocusDoorStory />);
  const findings = collectFindings(await samplesOf(page));
  const duplicates = findings.filter((finding) => finding.rule === "duplicate-action-door" && finding.value === '2x button "duplicate action"');

  expect(duplicates.length, "the programmatic-wrapper exclusion must not weaken true duplicate detection").toBe(1);
  expect(duplicates[0]?.message).toContain("[data-testid=duplicate-action-primary]");
  expect(duplicates[0]?.message).toContain("[data-testid=duplicate-action-secondary]");
});

// ── The NEGATIVE-OVERFLOW arm (issue #444, paid for by #439) ───────────────────────────────────────
// The rule used to judge POSITIONED children only, so an ordinary in-flow control pushed out of a clip
// by a `nowrap justify-end` row was invisible to it — and `snap --expect-no-overflow` printed
// `PASS overflow=0x0` on the same frame, because a LEFT spill is negative and `scrollWidth` is a
// positive-only measure. A per-child rect comparison was the only thing that ever saw it, so it is now
// what the rule does. The healthy twin in the same mount is the false-positive fence: a scroll pane
// (with a control scrolled out of view), an sr-only stub, and an absolute badge inside the padding are
// exactly what a naive sweep over-reports.
test("an in-flow control cut by its clipping container is a P1 finding naming the side and the spill", async ({ mount, page }) => {
  await mount(<WalkerClippedInflowControlStory />);
  const samples = await samplesOf(page);
  const census = JSON.stringify(samples.clippedOverflows);

  const cut = samples.clippedOverflows.find((entry) => entry.selector.includes("clip-dialog"));
  expect(cut, `the justify-end footer puts "Blank chat" outside the dialog's LEFT edge — census: ${census}`).toBeDefined();
  expect(cut?.flow, "an ordinary in-flow button, not a positioned escape-seeker").toBe("in-flow");
  expect(cut?.side, "the spill is NEGATIVE — the side scrollWidth cannot see").toBe("left");
  expect(cut?.spillPx ?? 0, `#439 measured 27-35px; anything under the 2px tolerance would be sub-pixel noise — census: ${census}`).toBeGreaterThan(16);
  expect(cut?.childSelector).toContain("clip-blank");

  const finding = collectFindings(samples).find((f) => f.rule === "clipped-overflow" && f.selector.includes("clip-dialog"));
  expect(finding?.severity, "a mangled half-visible control is a P1; an escape-seeking tooltip stays P2").toBe("P1");
  expect(finding?.value).toContain("left by");
});

// ── The READING MEASURE is measured, not guessed (issue #464) ──────────────────────────────────────
// line-length divided the box width by `fontSize × 0.5` and called the quotient "chars". Geist's real
// '0' advance is 0.573em, so every measure came out ~15% long and the rule filed an "~86 chars" P3
// against the home resume snippet — a paragraph that is 75.0 REAL characters, i.e. exactly
// `--reading-measure: 75ch`. The instrument was indicting the house's own ratified measure. The boxes
// below are sized in `ch`, so the browser itself supplies the ground truth in whatever font resolves.
// …AND THE UNIT IT IS MEASURED IN IS NOT THE UNIT THE LAW COUNTS (#1183, the #1145 owner ruling). CSS `ch`
// is the '0' advance; a character of running prose is ~2/3 of one, so a 75ch box holds ~113 law-characters
// and a "75" ceiling compared against a `ch` count passed a 117-character paragraph on the home surface
// while the rule printed `affected=0`. Both numbers are real; the rule now measures BOTH and judges each
// arm against the token that governs it.
test("the walker measures BOTH units, and a law-character is narrower than a CSS ch", async ({ mount, page }) => {
  await mount(<WalkerReadingMeasureStory />);
  const samples = await samplesOf(page);
  const sample = samples.textStyles.find((s) => s.selector.includes("measure-75ch-prose"));

  expect(sample, `censused: ${samples.textStyles.map((s) => s.selector).join(" | ")}`).toBeDefined();
  const chWidthPx = sample?.chWidthPx ?? 0;
  const glyphAdvancePx = sample?.glyphAdvancePx ?? 0;
  expect(chWidthPx, "a zero advance means the canvas measurement never happened").toBeGreaterThan(0);
  expect(glyphAdvancePx, "the law-character denominator must be measured too, not defaulted").toBeGreaterThan(0);
  expect(Math.round((sample?.rectWidth ?? 0) / chWidthPx), "the box is 75ch by construction").toBe(75);
  // The ruling's measured range on Geist is 1.43–1.56; the band is wide enough for whatever face the CT
  // harness resolves and still narrow enough that a rule reading one unit for the other cannot pass it.
  const ratio = chWidthPx / glyphAdvancePx;
  expect(ratio, `one CSS ch must be MORE than one law-character (measured ${String(ratio)})`).toBeGreaterThan(1.2);
  expect(ratio, `…and not absurdly more (measured ${String(ratio)})`).toBeLessThan(2);
});

test("the prose measure is judged in characters and the transcript in ch — the same 75ch box, two verdicts", async ({ mount, page }) => {
  await mount(<WalkerReadingMeasureStory />);
  const findings = collectFindings(await samplesOf(page)).filter((f) => f.rule === "line-length");
  const named = findings.map((f) => `${f.selector} => ${f.value}`).join(" | ");

  expect(findings.map((f) => f.selector).join(" | "), `the ratified PROSE measure must never be a finding (#464's surviving half). got ${named}`).not.toContain(
    "measure-47ch-prose",
  );
  expect(
    findings.map((f) => f.selector).join(" | "),
    `a message bubble at its own ratified token is not a finding — the transcript keeps the wide measure. got ${named}`,
  ).not.toContain("measure-75ch-transcript");

  const prose = findings.find((f) => f.selector.includes("measure-75ch-prose"));
  expect(prose, `a 75ch TEACHING paragraph is ~113 characters and IS the finding. got ${named}`).toBeDefined();
  expect(prose?.value, "both units print, because confusing them is the defect").toMatch(/^\d+ characters \(75 CSS ch\)\/line$/u);
});

test("a prose VOICE on a non-prose tag is judged, while its chrome twin is excluded by name", async ({ mount, page }) => {
  await mount(<WalkerReadingMeasureStory />);
  const samples = await samplesOf(page);
  const findings = collectFindings(samples).filter((f) => f.rule === "line-length");
  const named = findings.map((f) => f.selector).join(" | ");

  expect(
    findings.find((f) => f.selector.includes("measure-gloss-voice")),
    `a gloss is copy read in lines. got ${named}`,
  ).toBeDefined();
  expect(named, "the widening is the reading voices, not every voiced node — a datum's label is chrome").not.toContain("measure-label-voice");
  // The walker's half of it: the voice must be read from the element ITSELF, never inherited, or every
  // nested span of a voiced paragraph enrols as its own reading line.
  const gloss = samples.textStyles.find((s) => s.selector.includes("measure-gloss-voice"));
  expect(gloss?.ownVoice).toBe("gloss");
  expect(samples.textStyles.find((s) => s.selector.includes("measure-75ch-transcript"))?.readingSurface).toBe(true);
  expect(samples.textStyles.find((s) => s.selector.includes("measure-75ch-prose"))?.readingSurface).toBe(false);
});

// ── A PROMOTION CARRIED BY A PSEUDO (#1172) ───────────────────────────────────────────────────────
// `promoted-layer-offset` called getComputedStyle with no pseudo argument, so the #1154 shell-pane glass —
// a `::before` fill layer — left the census silently: `candidates=1` became `candidates=0`, which prints
// exactly like a surface that has nothing to promote. jsdom cannot answer any of this; the pseudo's
// generated content, its resolved inset and the host's containing-block status are all real-browser facts.
test("a pseudo-carried promotion is censused, judged and named — and the element arm is untouched", async ({ mount, page }) => {
  await mount(<WalkerPseudoPromotionStory />);
  const samples = await samplesOf(page);
  const census = samples.relationalAccounting?.["promoted-layer-offset"];
  const seen = samples.promotedLayerOffsets?.map((p) => p.selector).join(" | ") ?? "";

  expect(census, "the census row must exist at all").toBeDefined();
  expect(census?.carried?.["pseudo"], `the pseudo cohort must be COUNTED, not merely present. census=${JSON.stringify(census)}`).toBe(2);
  const carried = samples.promotedLayerOffsets?.find((p) => p.selector.includes("pseudo-promoted"));
  expect(carried, `the pseudo-carried layer must be judged. saw: ${seen}`).toBeDefined();
  expect(carried?.selector, "the subject is the HOST with the pseudo named — that is where the repair goes").toContain("::before");
  expect(carried?.promotion).toBe("backdrop-filter");
  expect(Math.abs(carried?.topDeviceFrac ?? 0), "the host sits on a half pixel by construction").toBeGreaterThan(0.4);
  // The element arm, unchanged: the same defect carried the original way is still judged the original way.
  const element = samples.promotedLayerOffsets?.find((p) => p.selector.includes("element-promoted"));
  expect(element, `the element arm must not have moved. saw: ${seen}`).toBeDefined();
  expect(element?.pseudo, "an element-carried promotion names no pseudo").toBeUndefined();

  const findings = collectFindings(samples).filter((f) => f.rule === "promoted-layer-offset");
  expect(findings.length, `both layers land off the grid and both are findings. got ${JSON.stringify(findings.map((f) => f.selector))}`).toBeGreaterThan(0);
});

test("an in-flow pseudo whose box cannot be derived is WITHHELD by name, never judged off the host's rect", async ({ mount, page }) => {
  await mount(<WalkerPseudoPromotionStory />);
  const samples = await samplesOf(page);
  const census = samples.relationalAccounting?.["promoted-layer-offset"];

  expect(census?.withheld["pseudoBoxUnmeasurable"], `an underivable pseudo box fails loud. census=${JSON.stringify(census)}`).toBe(1);
  expect(
    samples.promotedLayerOffsets?.map((p) => p.selector).join(" | "),
    "and it is NOT in the judged set — a landing measured off the wrong box is the other half of the lie",
  ).not.toContain("pseudo-inflow");
  // #987's settlement identity still closes over the widened census.
  expect(census?.candidates).toBe(
    (census?.judged ?? 0) + Object.values(census?.withheld ?? {}).reduce((a, b) => a + b, 0) + Object.values(census?.excluded ?? {}).reduce((a, b) => a + b, 0),
  );
});

// ── BELOW THE FOLD IS NOT UNREACHABLE (issue #653) ────────────────────────────────────────────────
// The interactive census required viewport intersection for tapTargets, actionDoors AND controlAspects,
// so every control merely scrolled out of sight fell out of three verdict families at once — and the run
// printed `findings=0`, which is what a clean surface prints. Measured on the surface that named the row
// (the chat "This chat" tab at 430x932): NO document scroll at all, an inner scroller of clientHeight 515
// over scrollHeight 2261, ~20 sized controls at top 1073..2374, zero of them censused.
//
// The fix is to SCROLL, not to relax: the tap-target extent is a `document.elementFromPoint` probe, which
// is a viewport-coordinate API, so measuring an off-screen control's box instead would trade a false clean
// for a false measurement. These five tests pin both halves of that — the defect fires, the healthy twins
// stay silent WHILE PRESENT in the census, the pseudo-element extent still measures correctly (only
// possible if the reveal really put the control on screen), the genuinely unreachable control is COUNTED
// rather than dropped, and the sweep leaves every scroll position where it found it.
test.describe("below-the-fold census reach", () => {
  // Short enough that a control 900px down an inner scroller is genuinely outside the viewport — on a
  // default-tall CT page it would already intersect and the stage would prove nothing.
  test.use({ viewport: { width: 520, height: 420 } });

  test("a 413x16 control below the fold is a tap-target finding — it was invisible to three rule families before", async ({ mount, page }) => {
    await mount(<WalkerBelowTheFoldStory />);
    const samples = await samplesOf(page);
    const findings = collectFindings(samples);
    const seen = JSON.stringify(samples.tapTargets);

    expect(
      samples.tapTargets.map((t) => t.selector).join(" | "),
      `the below-fold control must be CENSUSED at all — that is the whole defect. got ${seen}`,
    ).toContain("below-fold-subtarget");
    expect(selectorsFor(findings, "tap-target"), `16px is under the 24px fine-pointer floor. census: ${seen}`).toContain("[data-testid=below-fold-subtarget]");
  });

  test("a healthy below-fold control is censused and stays silent — the reveal did not become a finding factory", async ({ mount, page }) => {
    await mount(<WalkerBelowTheFoldStory />);
    const samples = await samplesOf(page);
    const findings = collectFindings(samples);

    expect(
      samples.tapTargets.map((t) => t.selector).join(" | "),
      "silence is only evidence when the control was looked at — a 48x48 control must be IN the census",
    ).toContain("below-fold-healthy");
    expect(selectorsFor(findings, "tap-target"), "48x48 clears every floor; flagging it would make the widened census useless").not.toContain(
      "[data-testid=below-fold-healthy]",
    );
  });

  test("a revealed control's hit extent is still measured by the compositor, not read off its box", async ({ mount, page }) => {
    await mount(<WalkerBelowTheFoldStory />);
    const samples = await samplesOf(page);

    // A 20x20 box wearing a 52px `::after`. Reading the BOX would report 20 and mint a false sub-target;
    // only a probe taken while the control is genuinely in the viewport reports the real extent. This is
    // the fence against "fixing" the blindness by dropping the viewport requirement instead of scrolling.
    expect(smallestSide(samples.tapTargets, "below-fold-extent"), `census: ${JSON.stringify(samples.tapTargets)}`).toBeGreaterThanOrEqual(FINE_POINTER_FLOOR);
  });

  test("an unreachable control is COUNTED, not dropped — the census publishes its own denominator", async ({ mount, page }) => {
    await mount(<WalkerBelowTheFoldStory />);
    const samples = await samplesOf(page);
    const reach = samples.censusReach;

    expect(reach, "a census with no reach counters states no denominator, which is the defect one level up").toBeDefined();
    // ONE reveal, not three: the sweep scrolls to the first control it cannot see and the rest of the
    // cluster comes into view with it, which is exactly why the sweep costs screens rather than elements.
    expect(reach?.revealed ?? 0, "the below-fold cluster sits ~900px down an inner scroller and must have been scrolled to").toBeGreaterThanOrEqual(1);
    expect((reach?.onScreen ?? 0) + (reach?.revealed ?? 0), "all four in-document controls must end up measured").toBe(4);
    expect(reach?.skippedOffViewport ?? 0, "a fixed control at 300vw scrolls nowhere — it must be counted, not silently dropped").toBeGreaterThanOrEqual(1);
    expect(reach?.budgetExhausted, "this stage is nowhere near the reveal budget").toBe(false);
    expect(samples.tapTargets.map((t) => t.selector).join(" | "), "an off-canvas phantom is offered to nobody and must not mint a finding").not.toContain(
      "off-canvas-phantom",
    );
  });

  test("the sweep puts every scroller back — the text samples' viewport boxes must survive it", async ({ mount, page }) => {
    await mount(<WalkerBelowTheFoldStory />);
    const host = page.locator("[data-testid=fold-scroll-host]");
    await host.evaluate((el) => {
      el.scrollTop = 120;
    });

    await samplesOf(page);

    // ops/pixels.ts screenshots the page AFTER the walk to settle unresolved backdrops against the boxes
    // the text census recorded. A sweep that left the surface scrolled would re-point every one of those
    // samples at the wrong pixels — a contrast verdict measured against someone else's background.
    expect(await host.evaluate((el) => el.scrollTop), "the reveal sweep must restore the scroll position it borrowed").toBe(120);
  });
});

// ── THE VIEWPORT EDGE IS A FRAME LIMIT, NOT AN OWNERSHIP VERDICT (issue #797) ─────────────────────
// `document.elementFromPoint` answers `null` outside the viewport, and `ownsPoint` read that null as "some
// other element owns this pixel". So a control straddling an edge lost every outward probe, the extent
// collapsed to its bare border box, and the census minted a phantom sub-target P1. Measured on
// Settings→Plugins: 18 P1s at the default viewport, p1=0 at `--viewport 1280x2200` from an IDENTICAL
// element census (1364/125), with the ±21px four-cardinal ground truth showing the control owning a full
// 44×44 ring. A target size that changes with the window height is not a fact about the design.
//
// Both directions, and the fence: the recentrable control must be MEASURED at its real extent (not merely
// suppressed), the unrecentrable one must be REFUSED rather than reported as its box, and a genuinely
// undersized control in the same mount must still fire.
test.describe("viewport-edge probe frame (#797)", () => {
  // Short enough that "the bottom edge" is a place a control can be parked deterministically.
  test.use({ viewport: { width: 520, height: 420 } });

  /** Park the ringed control so its box straddles the bottom viewport edge: top at `clientHeight - 12`,
   *  i.e. centre 3px above the edge and every outward probe (11/16/22px) past it. The host is fixed and
   *  exactly viewport-tall, so this offset is the viewport's own geometry, not the CT page's layout. */
  async function parkAtBottomEdge(page: Page): Promise<void> {
    await page.locator("[data-testid=cbtt-edge-host]").evaluate((el) => {
      el.scrollTop = 600 - (el.clientHeight - 12);
    });
  }

  test("a 44px ring straddling the bottom edge is RE-CENTRED and measured, not read off its 18px box", async ({ mount, page }) => {
    await mount(<WalkerViewportEdgeTargetStory />);
    await parkAtBottomEdge(page);
    const targets = await tapTargets(page);

    // The regression in one number: every probe fell past `innerHeight`, so the extent walk reported the
    // bare 18×18 border box for a control whose `::after` owns 44×44 — a P1 nobody could act on.
    expect(smallestSide(targets, "edge-recentrable"), `census: ${JSON.stringify(targets)}`).toBeGreaterThanOrEqual(44);
  });

  test("an edge-clipped control that cannot be re-centred has its verdict WITHHELD and counted, not minted from its box", async ({ mount, page }) => {
    await mount(<WalkerViewportEdgeTargetStory />);
    await parkAtBottomEdge(page);
    const samples = await samplesOf(page);
    const seen = JSON.stringify(samples.tapTargets);

    // It stays IN the census — dropping it would trade a false positive for a false clean — but its
    // measurement is marked a lower bound, and no sub-target finding may be minted from a lower bound.
    expect(samples.tapTargets.map((t) => t.selector).join(" | "), `census: ${seen}`).toContain("edge-fixed-ring");
    expect(
      samples.tapTargets.find((t) => t.selector.includes("edge-fixed-ring"))?.extentTruncated,
      `a fixed control clipped by the edge can never be re-centred: its ring is unaskable, so 18×18 is "at least", not "is". census: ${seen}`,
    ).toBe(true);
    expect(selectorsFor(collectFindings(samples), "tap-target"), `census: ${seen}`).not.toContain("[data-testid=edge-fixed-ring]");
    // Silence is only honest when it is COUNTED: a withheld verdict must read as "could not measure", never
    // as "measured, and fine" — the same law that makes `skippedOffViewport` a published number.
    expect(samples.censusReach?.frameTruncated ?? 0, `reach: ${JSON.stringify(samples.censusReach)}`).toBeGreaterThanOrEqual(1);
  });

  test("a genuinely 18px control with no ring still fires — the frame guard is not a mute", async ({ mount, page }) => {
    await mount(<WalkerViewportEdgeTargetStory />);
    await parkAtBottomEdge(page);
    const samples = await samplesOf(page);

    expect(
      samples.tapTargets.map((t) => t.selector).join(" | "),
      `the real defect must be IN the census — a refusal that swallowed it would trade a false positive for a false clean. census: ${JSON.stringify(samples.tapTargets)}`,
    ).toContain("edge-real-subtarget");
    expect(selectorsFor(collectFindings(samples), "tap-target"), "18px is under the 24px fine-pointer floor").toContain("[data-testid=edge-real-subtarget]");
  });
});

// ── A FORWARDING LABEL IS PART OF THE TARGET (issue #797, the census's second lie) ─────────────────
// A `<label for=...>` activates its control from anywhere inside it, so the label's box IS the control's
// target — that is what WCAG 2.5.5/2.5.8 measure. The probe credited self / pseudo-element / composite
// hits only, so the checkbox-leading full-row consent pattern read as a bare 16px box wherever it is used.
// The three negative arms are what keep the credit from becoming a blanket: the association is read from
// the DOM's own `el.labels`, and a pixel inside the label owned by ANOTHER control is that control's.
test("a 16px checkbox inside a 44px forwarding label measures the label's target, not its own box", async ({ mount, page }) => {
  await mount(<WalkerForwardingLabelStory />);
  const targets = await tapTargets(page);

  expect(smallestSide(targets, "forwarded-checkbox"), `census: ${JSON.stringify(targets)}`).toBeGreaterThanOrEqual(44);
});

test("label credit does not widen: no label, a label naming another control, and a shared label all still fire", async ({ mount, page }) => {
  await mount(<WalkerForwardingLabelStory />);
  const samples = await samplesOf(page);
  const flagged = selectorsFor(collectFindings(samples), "tap-target");
  const seen = JSON.stringify(samples.tapTargets);

  expect(flagged, `a 16px checkbox nothing forwards to is the defect this rule exists for. census: ${seen}`).toContain("[data-testid=unlabelled-checkbox]");
  expect(
    flagged,
    `\`for\` names a different control, so the DOM gives this checkbox no labels at all — crediting it would licence every label-shaped wrapper. census: ${seen}`,
  ).toContain("[data-testid=misdirected-checkbox]");
  expect(flagged, `the "Manage" button's pixels belong to the button; what is left of the shared label is under the floor. census: ${seen}`).toContain(
    "[data-testid=shared-label-checkbox]",
  );
});

test("the healthy twin produces no clipped-overflow finding — scroll panes, sr-only stubs and padded badges are not cuts", async ({ mount, page }) => {
  await mount(<WalkerClippedInflowControlStory />);
  const samples = await samplesOf(page);

  expect(
    samples.clippedOverflows.filter((entry) => entry.selector.includes("healthy") || entry.childSelector.includes("healthy")),
    `a wrapping footer cuts nothing, a scroller SANCTIONS content outside its box (including the control scrolled out of view), an sr-only stub paints no pixels, and a badge in the padding is inside the clip — census: ${JSON.stringify(samples.clippedOverflows)}`,
  ).toEqual([]);
});

// ── #816: the two collision families, at the mount that produced them ─────────────────────────────
// A whole mobile UX review passed clean over both (census 420, reached 21, zero P0/P1/P2) while a
// screenshot caught them instantly: a cast NAME painted at 0px, and a rules badge whose own centre
// hit-tests to the Start button 48px away. Both are BROWSER facts — `scrollWidth` against a collapsed
// `clientWidth`, and `elementFromPoint` over real flex geometry — so this is the tier that can prove
// them; the node suite pins the same families through the real CLI over file:// fixtures.

/** Every finding the REAL walker + the REAL checks produce for the mounted page. */
async function findingsFor(page: Page): Promise<readonly Finding[]> {
  const samples = (await page.evaluate(COLLECT_SAMPLES_JS)) as RawSamples;
  return collectFindings(samples);
}

test("#816: the 366px cast row erases its name and puts the badge on the Start button — both are findings", async ({ mount, page }) => {
  await mount(<WalkerCastRowStory badges={2} />);
  // GEOMETRY RECEIPT, not just a rule name: this is what the review measured by hand.
  const geometry = await page.evaluate(() => {
    const nameEl = document.querySelector('[data-testid="cast-name"]');
    const badgeEl = document.querySelector('[data-testid="cast-badge-1"]');
    if (!(nameEl instanceof HTMLElement && badgeEl instanceof HTMLElement)) {
      return null;
    }
    const box = badgeEl.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      nameRendered: Math.round(nameEl.getBoundingClientRect().width),
      nameNatural: nameEl.scrollWidth,
      hitTestId: hit instanceof HTMLElement ? (hit.dataset["testid"] ?? hit.tagName.toLowerCase()) : null,
    };
  });
  expect(geometry?.nameRendered, "the name is painted at zero width").toBeLessThanOrEqual(1);
  expect(geometry?.nameNatural, "…while its content is a real string").toBeGreaterThan(20);
  expect(geometry?.hitTestId, "and the badge's own centre belongs to the Start button").toBe("cast-start");

  const findings = await findingsFor(page);

  const erased = findings.filter((f) => f.rule === "truncated-to-nothing");
  expect(erased, "the cast name renders at 0px with ~57px of content — the row cannot say which cast it is").toHaveLength(1);
  expect(erased[0]?.value, "the finding must carry the erased string and the size of the loss").toContain("Spire Trio");
  expect(erased[0]?.severity).toBe("P1");

  const obscured = findings.filter((f) => f.rule === "obscured-target");
  expect(obscured.length, "a badge painted over the Start button is a mis-tap, not a layout preference").toBeGreaterThan(0);
  expect(
    obscured.some((f) => f.value.includes("hits") && /button|cast-start/u.test(f.value)),
    `the press must be reported as landing on the button: ${obscured.map((f) => f.value).join(" | ")}`,
  ).toBe(true);
});

test("#816: the same row without the badges keeps its name and its hit test — neither rule fires on the healthy arm", async ({ mount, page }) => {
  await mount(<WalkerCastRowStory badges={0} />);
  const findings = await findingsFor(page);
  expect(
    findings.filter((f) => f.rule === "truncated-to-nothing"),
    "the name has room here — flagging it would make the rule un-passable",
  ).toEqual([]);
  expect(
    findings.filter((f) => f.rule === "obscured-target"),
    "nothing is painted over anything",
  ).toEqual([]);
  const nameWidth = await page.evaluate(() => Math.round(document.querySelector('[data-testid="cast-name"]')?.getBoundingClientRect().width ?? 0));
  expect(nameWidth, "the clean arm must actually render the name, or its silence proves nothing").toBeGreaterThan(20);
});

// ── #2452: the two attributes `unreachable-hint` reads are EMITTED BY THE SHIPPED SEAL ──────────────
// The Node-side proofs (tests/tooling/ui-audit/index.int.test.ts) drive hand-written HTML that SPELLS
// `data-base-ui-tooltip-trigger` and `data-tooltip-describes`. That proves the checker's thresholds and
// nothing about whether `@orb/ui`'s Tooltip still publishes either one — a rename in the seal or a Base
// UI upgrade would leave every one of those proofs green while the rule went blind on the real app
// (RULE-AUTHORING.md step 1/2). This mounts the real component and reads the real census.
test("the real @orb/ui Tooltip publishes the census's two attributes, one row per seal decision", async ({ mount, page }) => {
  await mount(<WalkerTooltipHintStory />);
  const samples = (await page.evaluate(COLLECT_SAMPLES_JS)) as { readonly unreachableHints?: readonly UnreachableHint[] };
  const hints = samples.unreachableHints ?? [];

  // A zero here is "the walker never saw a tooltip trigger" — the blind case, which must never read as clean.
  expect(hints.length, `the census saw no tooltip trigger at all — samples: ${JSON.stringify(hints)}`).toBe(3);
  const decisions = hints.map((hint) => hint.describesDecision).sort((left, right) => String(left).localeCompare(String(right)));
  expect(decisions, "the seal's three decisions must be distinguishable in the DOM").toStrictEqual(["caller", "name", "self"]);

  // …and the DESCRIBED one is the only one whose description actually resolves at rest, which is the
  // fact the rule's exclusion turns on.
  const described = hints.find((hint) => hint.describesDecision === "self");
  expect(described?.describedByResolved).toBeGreaterThan(0);
  expect(hints.find((hint) => hint.describesDecision === "name")?.describedByResolved).toBe(0);
  expect(hints.find((hint) => hint.describesDecision === "caller")?.describedByResolved).toBe(0);
});
