// CT: the `data-app-ready` readiness signal (`lib/agent-bridge.ts`) — the flag EVERY verification instrument
// waits on (snap's nav gate, design-audit, motion-audit, the e2e browser actors).
//
// WHY IT EXISTS. The signal used to hand the flag over unconditionally 3s after install, whether or not the
// initial reads had settled. Every instrument that waited on it then captured a MID-HYDRATION app while
// reporting a clean wait — the instrument failing open. It is how `snap --isolated` came to screenshot the
// Corpus home stuck on "Loading your corpus…" and hand back a report that read like a product defect.
//
// The contract pinned here is PRESENCE + VALUE: presence means "stop waiting" (so no waiter can ever hang);
// the value says whether that was a real settle (`""`) or the ceiling giving up with reads still in flight
// (`degraded`). A waiter selecting on presence alone is unaffected; an instrument owes the value a read.
//
// The story drives the real `<html>` element and a real query cache; the test barriers on a RENDERED marker
// past the grace rather than sleeping, then asks what the flag did.

import { expect, test } from "@playwright/experimental-ct-react";
import { AppReadyBootReadStory, AppReadyRouteResolutionStory, AppReadySignalStory } from "./_ct-stories.tsx";

const READY_FLAG = "html[data-app-ready]";

test("the flag does NOT go up while the initial reads are still in flight — the grace is a CHECK, not a hand-out", async ({ mount, page }) => {
  await mount(<AppReadySignalStory />);

  // The barrier is the story's own rendered marker, fired past agent-bridge's 3s grace. Under the old
  // hand-out the flag was already up by now, on an app whose only read had not landed.
  await expect(page.getByTestId("grace-elapsed")).toBeVisible();
  await expect(page.locator(READY_FLAG)).toHaveCount(0);

  // Land the read: the SAME signal now fires, because the cache actually went idle.
  await page.getByRole("button", { name: "land the read" }).click();
  await expect(page.locator(READY_FLAG)).toHaveCount(1);
  // `""`, never "degraded" — this was a real settle, and an instrument reading the value must be able to
  // tell the two apart.
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "");
});

// ISSUE #145 — the OTHER way an idle query cache lies. Above, the read was in flight; here there is no read
// AT ALL, because the route component that owns it has not mounted: on a cold `snap --isolated` stage vite
// takes longer than the grace to serve `/`'s lazy `compose/authed-app.tsx` chunk. The install-armed grace
// fired against the router's pending glyph, the flag went up SETTLED with an EMPTY cache, and every
// instrument screenshotted the boot glyph and reported a clean wait. The grace window now STARTS at route
// resolution, so "this app has no initial reads" is only claimable once the route is actually mounted.
test("the flag does NOT go up while the ROUTE is still resolving — an idle cache with no route is not a settle", async ({ mount, page }) => {
  await mount(<AppReadyRouteResolutionStory />);

  // Past the 3s grace with the route still resolving and ZERO queries ever created. This is the state the
  // stage sat in for the whole of `--isolated`'s existence; the flag must still be down.
  await expect(page.getByTestId("grace-elapsed")).toBeVisible();
  await expect(page.locator(READY_FLAG)).toHaveCount(0);

  // Resolve the route: its component mounts and issues the initial read. Still not ready — that read is in
  // flight, which is the rule the sibling test above pins.
  await page.getByRole("button", { name: "resolve the route" }).click();
  await expect(page.getByTestId("route-mounted")).toBeVisible();
  await expect(page.locator(READY_FLAG)).toHaveCount(0);

  // Land it: NOW the cache is idle for a reason, and the flag goes up as a real settle.
  await page.getByRole("button", { name: "land the read" }).click();
  await expect(page.locator(READY_FLAG)).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "");
});

// #282 — the CHAINED-QUERY false idle. The theme is fetched only once `settings.getUserSettings` resolves
// (`useSelectedTheme` gates `settings.getTheme` on the id), so between the parent settling and the child
// STARTING the cache is momentarily idle — and the old signal settled there, lifting the boot veil onto the
// base palette a beat before the resolved theme swapped it (the cold-cache polarity flash). The boot-read
// gate (`boot-reads.ts`) holds readiness while a registered dependent read is still pending.
test("the flag does NOT go up while a boot-critical DEPENDENT read is still pending — the chained-query false idle (#282)", async ({ mount, page }) => {
  await mount(<AppReadyBootReadStory />);

  // Land the PARENT read: its cache goes idle and a fetch has been seen — the exact state the old signal
  // read as "settled". The dependent (theme-shaped) read is still pending.
  await page.getByRole("button", { name: "land the parent read" }).click();

  // Past the 3s grace, with the parent settled and the cache idle, the flag must STILL be down.
  await expect(page.getByTestId("grace-elapsed")).toBeVisible();
  await expect(page.locator(READY_FLAG)).toHaveCount(0);

  // Resolve the dependent read: NOW the cache is idle for a reason and the flag goes up as a real settle.
  await page.getByRole("button", { name: "resolve the dependent read" }).click();
  await expect(page.locator(READY_FLAG)).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "");
});
