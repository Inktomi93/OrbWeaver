// CT: the boot veil's LOAD-GATED exit (features/app-shell/components/boot-veil.tsx;
// owner tweak). The exit is driven by the REAL readiness seam
// (`data-app-ready` on <html> — installAppReadySignal's stamp), never a timer, so the CT drives that
// exact attribute:
//   • while the attribute is ABSENT the veil is up, weaving, captioned;
//   • once it appears the veil dissolves and unmounts — mid-weave (the graceful early cut), but never
//     before the MINIMUM-DISPLAY floor (owner 2026-08-09): a fast-ready boot holds a coherent beat
//     instead of flashing sub-second;
//   • already-present at mount ⇒ the veil never renders at all (an in-session remount);
//   • reduced motion: static web while waiting, INSTANT removal on ready (§3.9 — the floor is inert).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { BootVeil } from "../../../../../packages/client/src/features/app-shell/components/boot-veil.tsx";

const READY_ATTR = "data-app-ready";

/** Wait N real browser frames (rAF-driven — an event condition, not a wall-clock timeout). */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let i = 0;
        const step = (): void => {
          i += 1;
          if (i >= n) {
            resolve();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}

test("up while the app is not ready; DISSOLVES AND UNMOUNTS once data-app-ready lands (mid-weave, after the beat)", async ({ mount, page }) => {
  await mount(<BootVeil />);
  const veil = page.getByRole("status", { name: "Loading orbweaver" });
  await expect(veil).toBeVisible();
  // The weave is running and the caption feed is live (the build starts on the bridge beat).
  await expect(page.locator('[data-slot="web-weave"]')).toHaveAttribute("data-weave-state", "weaving");
  await expect(page.getByText("casting the bridge line")).toBeVisible();
  // The load gate opens — the REAL seam, stamped exactly as installAppReadySignal stamps it. The
  // weave is nowhere near settled (~12s build), so this is the graceful EARLY cut (after the floor).
  await page.evaluate((attr) => document.documentElement.setAttribute(attr, ""), READY_ATTR);
  await expect(veil).toHaveCount(0);
});

test("min-display floor: a fast-ready boot does NOT flash — the veil holds a beat, then dissolves", async ({ mount, page }) => {
  await mount(<BootVeil />);
  const veil = page.locator('[data-slot="weave-veil"]');
  await expect(veil).toBeVisible();
  // The app reports ready almost immediately (a warm/fast boot) …
  await page.evaluate((attr) => document.documentElement.setAttribute(attr, ""), READY_ATTR);
  // … but the veil must STILL be up a handful of frames later — the floor prevents the sub-second
  // flash the owner flagged (the exit is gated on ready AND the ~1s beat, whichever is later).
  await waitFrames(page, 5);
  await expect(veil).toHaveCount(1);
  // … and it does dissolve + unmount once the floor elapses (default timeout comfortably clears ~1s).
  await expect(veil).toHaveCount(0);
});

test("already ready at mount ⇒ renders NOTHING (no veil flash over a live app)", async ({ mount, page }) => {
  await page.evaluate((attr) => document.documentElement.setAttribute(attr, ""), READY_ATTR);
  await mount(<BootVeil />);
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.locator('[data-slot="weave-veil"]')).toHaveCount(0);
});

test("a DEGRADED ready (the 20s ceiling) still opens the gate — presence means stop waiting", async ({ mount, page }) => {
  await mount(<BootVeil />);
  await expect(page.getByRole("status", { name: "Loading orbweaver" })).toBeVisible();
  await page.evaluate((attr) => document.documentElement.setAttribute(attr, "degraded"), READY_ATTR);
  await expect(page.locator('[data-slot="weave-veil"]')).toHaveCount(0);
});

test("reduced motion: static web while waiting, INSTANT removal on ready (§3.9 REMOVE)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<BootVeil />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  await waitFrames(page, 30);
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  await page.evaluate((attr) => document.documentElement.setAttribute(attr, ""), READY_ATTR);
  await expect(page.locator('[data-slot="weave-veil"]')).toHaveCount(0);
});
