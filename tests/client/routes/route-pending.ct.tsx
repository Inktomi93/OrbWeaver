// CT: the router pending affordance (routes/route-pending.tsx — the P1-b "not a blank page" proof).
// While a route's `beforeLoad` auth gate (`/me`) resolves, the router paints THIS (wired as
// `defaultPendingComponent` + `defaultPendingMs: 0` in routes/router.tsx) instead of a blank document.
// The CT proves it renders a VISIBLE loading affordance with an accessible name — the guarantee the
// blank-page window is gone (the timing wiring is a router-config fact, asserted by review + the running
// stack; this pins that the component itself is a real, labeled, non-empty loading mark).

import { expect, test } from "@playwright/experimental-ct-react";
import { RoutePending } from "../../../packages/client/src/routes/route-pending.tsx";
import { ShellToSplashFixture } from "../features/app-shell/_cascade-fixtures.tsx";

test("renders a visible, accessibly-named loading mark (never a blank page)", async ({ mount, page }) => {
  await mount(<RoutePending />);
  await expect(page.getByRole("status", { name: "Loading" })).toBeVisible();
});

// 0866 F9: the splash that replaces the shell sits outside it, so the shell unmounting must not take the
// app's reduced-motion flag with it - the brand shimmer is motion the user asked to remove.
test("the splash that replaces the shell keeps the app's reduced-motion flag, and its shimmer stops", async ({ mount, page }) => {
  const cmp = await mount(<ShellToSplashFixture reducedMotion={true} />);
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");

  await cmp.getByRole("button", { name: "hand over" }).click();
  const splash = page.getByRole("status", { name: "Loading" });
  await expect(splash).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");
  await expect
    .poll(() =>
      splash
        .locator("svg")
        .evaluate(
          (glyph) => Number.parseFloat(getComputedStyle(glyph).animationDuration) * (getComputedStyle(glyph).animationDuration.endsWith("ms") ? 1 : 1000),
        ),
    )
    .toBeLessThan(1);
});

test("with reduced motion off the shell leaves no stale flag behind, and the shimmer runs", async ({ mount, page }) => {
  const cmp = await mount(<ShellToSplashFixture reducedMotion={false} />);
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "false");

  await cmp.getByRole("button", { name: "hand over" }).click();
  const splash = page.getByRole("status", { name: "Loading" });
  await expect(splash).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-reduced-motion", /.*/u);
  await expect
    .poll(() =>
      splash
        .locator("svg")
        .evaluate(
          (glyph) => Number.parseFloat(getComputedStyle(glyph).animationDuration) * (getComputedStyle(glyph).animationDuration.endsWith("ms") ? 1 : 1000),
        ),
    )
    .toBeGreaterThan(100);
});
