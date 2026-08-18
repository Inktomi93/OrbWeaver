// The hit-area arithmetic of the design-audit in-page fact walker (scripts/probes/design-audit-walker.ts).
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
import type { Finding, RawSamples } from "../../scripts/probes/design-audit-checks.ts";
import { collectFindings } from "../../scripts/probes/design-audit-checks.ts";
import { COLLECT_SAMPLES_JS } from "../../scripts/probes/design-audit-walker.ts";
import {
  WalkerAccentBorderStory,
  WalkerCapsTrackingStory,
  WalkerDimmedContrastStory,
  WalkerDuplicateSlotStory,
  WalkerNeighbourButtonsStory,
  WalkerSliderCompositeStory,
  WalkerTranslucentTintStory,
} from "./_ct-stories.tsx";

interface TapTarget {
  readonly selector: string;
  readonly width: number;
  readonly height: number;
}

// The CT provider tree mounts a toast viewport on every stage; it is harness chrome, not the story.
const HARNESS_CHROME = "toast-viewport";

/** Run the REAL walker string in the mounted page and return its tap-target census, harness chrome
 *  dropped. */
async function tapTargets(page: Page): Promise<readonly TapTarget[]> {
  const samples = (await page.evaluate(COLLECT_SAMPLES_JS)) as { readonly tapTargets: readonly TapTarget[] };
  return samples.tapTargets.filter((t) => !t.selector.includes(HARNESS_CHROME));
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
