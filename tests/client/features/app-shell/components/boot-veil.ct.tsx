// CT: the boot veil's LOAD-GATED exit (features/app-shell/components/boot-veil.tsx — docs/design/
// login-loading-screen.md §9.3, owner tweak 3). The exit is driven by the REAL readiness seam
// (`data-app-ready` on <html> — installAppReadySignal's stamp), never a timer, so the CT drives that
// exact attribute:
//   • while the attribute is ABSENT the veil is up, weaving, captioned;
//   • the INSTANT it appears the veil dissolves and unmounts — mid-weave (the graceful early cut);
//   • already-present at mount ⇒ the veil never renders at all (an in-session remount);
//   • reduced motion: static web while waiting, instant removal on ready (§3.9).

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

test("up while the app is not ready; DISSOLVES AND UNMOUNTS the instant data-app-ready lands (mid-weave)", async ({ mount, page }) => {
  await mount(<BootVeil />);
  const veil = page.getByRole("status", { name: "Loading orbweaver" });
  await expect(veil).toBeVisible();
  // The weave is running and the caption feed is live (the build starts on the bridge beat).
  await expect(page.locator('[data-slot="web-weave"]')).toHaveAttribute("data-weave-state", "weaving");
  await expect(page.getByText("casting the bridge line")).toBeVisible();
  // The load gate opens — the REAL seam, stamped exactly as installAppReadySignal stamps it. The
  // weave is nowhere near settled (~12s build), so this is the graceful EARLY cut.
  await page.evaluate((attr) => document.documentElement.setAttribute(attr, ""), READY_ATTR);
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
