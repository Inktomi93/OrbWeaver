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
import { AppReadySignalStory } from "./_ct-stories.tsx";

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
