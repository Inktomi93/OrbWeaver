// The TOUCH-FLOOR measuring kit — `elementFromPoint` hit sweeps and run pitch, for CTs that judge whether a
// coarse-pointer control is actually hittable.
//
// WHY IT IS NOT A BOUNDING BOX. Our floorless Button sizes (`inline`/`glyph-*`) carry their ≥44px coarse hit
// area on an OVERFLOWING `::before` (`::after` is the CTA ring's layer — the
// readers here probe BOTH), so the visible box and the target are DIFFERENT SHAPES — and when such a
// control is repeated in a wrapping run, the pseudo is clipped by the gap it shares with the next cell and
// the floor silently is not delivered. A `boundingBox()` assertion is blind to exactly that defect (a 32px icon
// cell can report a 37px effective target on a 38px pitch). Only `elementFromPoint`
// sees it, and only if you WALK OUT from the centre rather than sampling it.
//
// TWO INSTRUMENTS, because neither alone states the claim:
//   · {@link hitBoxes} — the effective target per control. Correct for a run whose controls are SEPARATED
//     (each pseudo sits inside its own cell); on a perfectly TILED run it under-reports by one, because the
//     boundary sample resolves to whichever of two abutting neighbours wins it.
//   · {@link measurePitch} — centre-to-centre spacing, which has no boundary to share. This is the exact
//     floor claim for a tiled run; pair it with `hitBoxes` to prove the pseudo is not clipped BELOW the pitch.
//
// And the floor itself is {@link touchFloorPx} — the RESOLVED token, never a hardcoded 44. It bites: the CT
// harness's rendering context is not the app's, and a literal both fails correct fixes and survives a token
// retune.

import type { Locator, Page } from "@playwright/test";
import { pseudoHitEnvelope, readPseudoGeometry, walkFrom } from "../iso/hit-extent-walk.ts";

/** One control's effective hit target, in CSS px. */
export interface HitBox {
  readonly x: number;
  readonly y: number;
}

/** A Button `inline`/`glyph-*` hit pseudo's resolved box. This intentionally names `::before`:
 * the hit surface lives there so `::after` can remain the CTA paint layer. An unresolved dimension is an
 * absent measurement, so this refuses instead of turning `auto` into a zero-sized target. */
/** The effective box for Button arms that may carry their floor either in their own border box or in
 * `::before`. A box that already clears the floor needs no pseudo; a smaller box must have a measurable
 * pseudo and therefore inherits {@link beforeHitBox}'s refusal. */
/**
 * One `--spacing-*` custom property resolved to REAL px by the browser, at the document root.
 *
 * NEVER `parseFloat(getComputedStyle(x).getPropertyValue("--spacing-…")) * 16`. That spelling is wrong on
 * two independent counts: a custom property's computed value is its authored TOKEN STREAM, so
 * (a) the `--spacing-*` family is clamped and the stream reads `round(up, 2.75rem, 1px)` — NaN
 * to `parseFloat`, and every downstream comparison silently vacuous — and (b) the `* 16` is a lie
 * for any reader with `--font-scale` off 1. A throwaway probe makes the ENGINE do the arithmetic, so it is
 * correct under the belt, the font scale, the pointer arm and the density scope alike.
 */
function resolveSpacingPx(page: Page, cssVar: string): Promise<number> {
  return page.evaluate((name: string) => {
    const probe = document.createElement("div");
    // PADDING, not width, and out of flow: a probe appended inside a flex container is a FLEX ITEM whose
    // `width` is only a base size the layout may shrink (measured: a 34px token read back 19.05px inside a
    // Button). Padding is never flex-adjusted, and `position: absolute` keeps the probe from moving the
    // very geometry the caller is about to assert.
    probe.style.position = "absolute";
    probe.style.paddingTop = `var(${name})`;
    document.body.append(probe);
    const px = Number.parseFloat(getComputedStyle(probe).paddingTop);
    probe.remove();
    return px;
  }, cssVar);
}

/** {@link resolveSpacingPx} inside a LOCATOR's inherited scope — `--spacing-field/row/block/section` are
 *  rebound per density tier (`packages/ui/src/styles/tiers.css`), so a root-scoped read answers for the
 *  wrong tier inside a `data-density` subtree. */
/** The live `--spacing-touch-target`, in px. Pointer-CONDITIONAL (44 coarse / 28 fine) — read it only after
 *  asserting the coarse emulation landed, or it answers for the wrong pointer class. */
export function touchFloorPx(page: Page): Promise<number> {
  return resolveSpacingPx(page, "--spacing-touch-target");
}

/** A control's reachable extent on one axis — walked out from its centre with `elementFromPoint` until the
 *  point stops resolving inside it.
 *
 *  THE RULE ITSELF IS NOT HERE: it is `tests/support/iso/hit-extent-walk.ts`, the one home shared with the
 *  ui-audit instrument proof (`tests/tooling/ui-audit/ops/walker/hit-extent.int.test.ts`), so the two
 *  cannot drift into separate predicates. Read that file for the ownership clauses, the geometry scoping
 *  and the declared limits.
 *
 *  TWO PAGE ROUND TRIPS, NOT ONE, and the reason is a budget rather than a preference: the geometry read
 *  and the walk are separate serialisable functions because a single self-contained one carrying the whole
 *  algorithm scores 79 against the cognitive-complexity budget of 15, and the arithmetic between them is
 *  worth far more as a NODE-testable pure function than as another thing only a browser can check. The
 *  window between the two reads is a layout the caller must already have settled — every consumer polls
 *  (`expect.poll`) precisely because a mid-transition read is not trustworthy in one call either. */
export async function hitExtent(cell: Locator, axis: "x" | "y"): Promise<number> {
  const geometry = await cell.evaluate(readPseudoGeometry);
  return await cell.evaluate(walkFrom, { axis, envelope: pseudoHitEnvelope(geometry) });
}

/** Every control's effective hit box, in DOM order. */
/** The run's centre-to-centre PITCH on both axes — the smallest non-zero offset from the first cell.
 *
 *  POLL THIS, never read it once, whenever the run is inside a surface that opens with a transition: a
 *  same-tick read can catch a popover mid-`scale: 0.95` and report a pitch that does not exist once the
 *  animation settles (a false negative by construction). */
export function measurePitch(controls: Locator): Promise<HitBox> {
  return controls.first().evaluate((el: HTMLElement): HitBox => {
    const parent = el.parentElement;
    if (parent === null) {
      throw new TypeError("measurePitch: the control has no parent element");
    }
    const cells = Array.from(parent.children).map((node) => node.getBoundingClientRect());
    const centres = cells.map((box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 }));
    const first = centres[0];
    if (first === undefined) {
      return { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
    }
    const dx = centres.map((c) => c.x - first.x).filter((d) => d > 1);
    const dy = centres.map((c) => c.y - first.y).filter((d) => d > 1);
    return { x: Math.min(...dx), y: Math.min(...dy) };
  });
}
