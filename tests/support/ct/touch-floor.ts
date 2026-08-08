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

/** The live `--spacing-touch-target`, in px. Pointer-CONDITIONAL (44 coarse / 28 fine) — read it only after
 *  asserting the coarse emulation landed, or it answers for the wrong pointer class. */
export function touchFloorPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-touch-target)";
    document.body.append(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    return px;
  });
}

/** A control's reachable extent on one axis — walked out from its centre with `elementFromPoint` until the
 *  point stops resolving inside it. The sweep runs inside the page, so it is ONE settled read. */
export function hitExtent(cell: Locator, axis: "x" | "y"): Promise<number> {
  return cell.evaluate((el: HTMLElement, ax: "x" | "y"): number => {
    const box = el.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const owns = (x: number, y: number): boolean => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === el || el.contains(hit) || hit.contains(el));
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
