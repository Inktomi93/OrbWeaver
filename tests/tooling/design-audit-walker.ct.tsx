// The hit-area arithmetic of the design-audit in-page fact walker (tooling/src/ui-audit/ops/walker.ts).
// The walker is a raw JS STRING evaluated in the probe page, so a real browser is the only tier that can
// prove it: `elementFromPoint`, layout geometry and pointer-conditional `::after` touch targets do not
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
  WalkerCapsTrackingStory,
  WalkerClippedInflowControlStory,
  WalkerDimmedContrastStory,
  WalkerDuplicateDoorStory,
  WalkerDuplicateSlotStory,
  WalkerGradientBackdropStory,
  WalkerListRowCardStory,
  WalkerListRowSelectionStory,
  WalkerNeighbourButtonsStory,
  WalkerPaintLayerStory,
  WalkerProgrammaticFocusDoorStory,
  WalkerReadingMeasureStory,
  WalkerScreenReaderOnlyStory,
  WalkerSliderCompositeStory,
  WalkerTranslucentTintStory,
} from "./_ct-stories.tsx";

interface TapTarget {
  readonly selector: string;
  readonly width: number;
  readonly height: number;
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

test("two genuine neighbours stay sub-targets — the widening is per composite, never a blanket", async ({ mount, page }) => {
  await mount(<WalkerNeighbourButtonsStory />);
  const targets = await tapTargets(page);

  // Each button is a real, separately-offered control 4px from the other. Neither may inherit the row.
  for (const testid of ["neighbour-a", "neighbour-b"]) {
    expect(smallestSide(targets, testid), `${testid} must still measure as a sub-target`).toBeLessThan(FINE_POINTER_FLOOR);
  }
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
test("the walker measures a real character advance — a 75ch box reads as 75 characters, not 86", async ({ mount, page }) => {
  await mount(<WalkerReadingMeasureStory />);
  const samples = await samplesOf(page);
  const sample = samples.textStyles.find((s) => s.selector.includes("measure-75ch"));

  expect(sample, `censused: ${samples.textStyles.map((s) => s.selector).join(" | ")}`).toBeDefined();
  const chWidthPx = sample?.chWidthPx ?? 0;
  expect(chWidthPx, "a zero advance means the canvas measurement never happened").toBeGreaterThan(0);
  // The whole defect in one number: the real advance is WIDER than the guessed half-em, so the guess
  // over-counted characters. Geist measures 0.573em.
  expect(chWidthPx / (sample?.fontSizePx ?? 1), `measured advance ratio was ${chWidthPx / (sample?.fontSizePx ?? 1)}`).toBeGreaterThan(0.5);
  expect(Math.round((sample?.rectWidth ?? 0) / chWidthPx), "the box is 75ch by construction").toBe(75);
});

test("a line at the ratified 75ch measure is clean while a genuinely over-long one still fires", async ({ mount, page }) => {
  await mount(<WalkerReadingMeasureStory />);
  const findings = collectFindings(await samplesOf(page)).filter((f) => f.rule === "line-length");

  expect(findings.map((f) => f.selector).join(" | "), "the ratified reading measure must never be a finding — that was the #464 defect").not.toContain(
    "measure-75ch",
  );
  const long = findings.find((f) => f.selector.includes("measure-110ch"));
  expect(long, `the rule must stay alive: got ${JSON.stringify(findings)}`).toBeDefined();
  expect(long?.value, "and it reports REAL characters now").toBe("110 chars/line");
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

test("the healthy twin produces no clipped-overflow finding — scroll panes, sr-only stubs and padded badges are not cuts", async ({ mount, page }) => {
  await mount(<WalkerClippedInflowControlStory />);
  const samples = await samplesOf(page);

  expect(
    samples.clippedOverflows.filter((entry) => entry.selector.includes("healthy") || entry.childSelector.includes("healthy")),
    `a wrapping footer cuts nothing, a scroller SANCTIONS content outside its box (including the control scrolled out of view), an sr-only stub paints no pixels, and a badge in the padding is inside the clip — census: ${JSON.stringify(samples.clippedOverflows)}`,
  ).toEqual([]);
});
