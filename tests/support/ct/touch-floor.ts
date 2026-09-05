// The TOUCH-FLOOR measuring kit — `elementFromPoint` hit sweeps and run pitch, for CTs that judge whether a
// coarse-pointer control is actually hittable.
//
// WHY IT IS NOT A BOUNDING BOX. Our floorless Button sizes (`inline`/`glyph-*`) carry their ≥44px coarse hit
// area on an OVERFLOWING `::after`, so the visible box and the target are DIFFERENT SHAPES — and when such a
// control is repeated in a wrapping run, the pseudo is clipped by the gap it shares with the next cell and
// the floor silently is not delivered. A `boundingBox()` assertion is blind to exactly that defect (measured
// 2026-08-07: a 32px icon cell reporting a 37px effective target on a 38px pitch). Only `elementFromPoint`
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

/** One control's effective hit target, in CSS px. */
export interface HitBox {
  readonly x: number;
  readonly y: number;
}

/**
 * One `--spacing-*` custom property resolved to REAL px by the browser, at the document root.
 *
 * NEVER `parseFloat(getComputedStyle(x).getPropertyValue("--spacing-…")) * 16`. That spelling was wrong on
 * two independent counts and both bit: a custom property's computed value is its authored TOKEN STREAM, so
 * (a) since #1640 the `--spacing-*` family is belted and the stream reads `round(up, 2.75rem, 1px)` — NaN
 * to `parseFloat`, and every downstream comparison silently vacuous — and (b) the `* 16` was already a lie
 * for any reader with `--font-scale` off 1. A throwaway probe makes the ENGINE do the arithmetic, so it is
 * correct under the belt, the font scale, the pointer arm and the density scope alike.
 */
export function resolveSpacingPx(page: Page, cssVar: string): Promise<number> {
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
export function resolveSpacingPxIn(scope: Locator, cssVar: string): Promise<number> {
  return scope.evaluate((node: Element, name: string) => {
    const probe = node.ownerDocument.createElement("div");
    probe.style.position = "absolute";
    probe.style.paddingTop = `var(${name})`;
    node.append(probe);
    const px = Number.parseFloat(getComputedStyle(probe).paddingTop);
    probe.remove();
    return px;
  }, cssVar);
}

/** The live `--spacing-touch-target`, in px. Pointer-CONDITIONAL (44 coarse / 28 fine) — read it only after
 *  asserting the coarse emulation landed, or it answers for the wrong pointer class. */
export function touchFloorPx(page: Page): Promise<number> {
  return resolveSpacingPx(page, "--spacing-touch-target");
}

/** A control's reachable extent on one axis — walked out from its centre with `elementFromPoint` until the
 *  point stops resolving inside it. The sweep runs inside the page, so it is ONE settled read.
 *
 *  BOX- vs PSEUDO-CARRIED FLOOR (#662, fixed from the prior unconditional `hit.contains(el)`). Ancestor
 *  credit exists for exactly one shape: an overflowing `::after`/`::before` touch-target pseudo (the
 *  `@orb/ui` Button glyph ramp — packages/ui/src/primitives/button/variants.ts `glyphBox`,
 *  `after:content-['']` + `after:absolute`) has no DOM node, so a probed point on its clipped-away edge
 *  falls through to whatever plain box paints there — usually the control's own wrapper — and THAT
 *  fallback IS the control's real extent. A control with no such pseudo carries its floor on its OWN
 *  border box (a real height/min-height, e.g. the CONTROL_SIZE ramp), so walking off that box onto ANY
 *  ancestor is never evidence of ownership — it is the wrapper's padding/gap. Crediting it unconditionally
 *  was the #662 hole: a 413×16 trigger measured 44 by borrowing its `Stack` wrapper's whole extent, and the
 *  sweep was structurally incapable of ever reporting less (cb-rules-spend, 2026-08-24 — PASSED against the
 *  reverted 413×16 source while five sibling pins went red).
 *
 *  DECLARED LIMIT: this kit has no composite-row mechanism (design-audit's `sharedCompositeOwns` — a
 *  Base UI Slider's real target is the whole `h-control-sm` row, box-carried on an ANCESTOR, not on the
 *  probed element and not via a pseudo). A composite control measured through this kit under-reports to
 *  its own bare box. None of this kit's live CT consumers hit that shape (verified: every `hitExtent`
 *  call site targets a CONTROL_SIZE-height Button, which carries its own floor directly) — a future
 *  composite consumer needs its own box measurement (`boundingBox()` on the row), not this sweep. */
export function hitExtent(cell: Locator, axis: "x" | "y"): Promise<number> {
  return cell.evaluate((el: HTMLElement, ax: "x" | "y"): number => {
    const box = el.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const pseudoCarriesFloor = (): boolean => {
      const extendsOutward = (style: CSSStyleDeclaration): boolean =>
        style.content !== "none" && style.content !== "normal" && (style.position === "absolute" || style.position === "fixed");
      return extendsOutward(getComputedStyle(el, "::after")) || extendsOutward(getComputedStyle(el, "::before"));
    };
    const pseudoCarried = pseudoCarriesFloor();
    const owns = (x: number, y: number): boolean => {
      const hit = document.elementFromPoint(x, y);
      if (hit === null) {
        return false;
      }
      if (hit === el || el.contains(hit)) {
        return true;
      }
      return pseudoCarried && hit.contains(el);
    };
    const reach = (dx: number, dy: number): number => {
      let n = 0;
      while (n < 80 && owns(cx + dx * (n + 1), cy + dy * (n + 1))) {
        n += 1;
      }
      return n;
    };
    return ax === "x" ? reach(-1, 0) + reach(1, 0) + 1 : reach(0, -1) + reach(0, 1) + 1;
  }, axis);
}

/** Every control's effective hit box, in DOM order. */
export function hitBoxes(controls: Locator, count: number): Promise<readonly HitBox[]> {
  return Promise.all(
    Array.from({ length: count }, async (_unused, index) => {
      const cell = controls.nth(index);
      return { x: await hitExtent(cell, "x"), y: await hitExtent(cell, "y") };
    }),
  );
}

/** The run's centre-to-centre PITCH on both axes — the smallest non-zero offset from the first cell.
 *
 *  POLL THIS, never read it once, whenever the run is inside a surface that opens with a transition: a
 *  same-tick read caught a popover mid-`scale: 0.95` and reported a pitch that does not exist once the
 *  animation settles (a false negative by construction — it cost a lane a round). */
export function measurePitch(controls: Locator): Promise<HitBox> {
  return controls.first().evaluate((el: HTMLElement): HitBox => {
    const cells = Array.from((el.parentElement as HTMLElement).children).map((node) => node.getBoundingClientRect());
    const centres = cells.map((box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 }));
    const first = centres[0] as HitBox;
    const dx = centres.map((c) => c.x - first.x).filter((d) => d > 1);
    const dy = centres.map((c) => c.y - first.y).filter((d) => d > 1);
    return { x: Math.min(...dx), y: Math.min(...dy) };
  });
}
