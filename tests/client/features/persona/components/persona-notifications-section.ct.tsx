// CT: the Personas group's NOTIFICATIONS section — and specifically its `reserveKey` (#1726, closing a
// tranche-1 keying (#1098) that shipped with no coverage at all).
//
// WHY A KEY NEEDS A BROWSER TO PROVE. `reserveKey` is not a prop with a visible effect at rest: it swaps the
// boundary's pending arm for a `ReservedFallback` that holds THIS DEVICE's last measured height, so what it
// buys is the absence of a layout jump on the SECOND cold read of the same surface. Nothing static can see
// that — the source reads identically with the key removed, and so does a single-mount CT, because on a
// first boot the store is empty and the fallback renders unreserved by design.
//
// SO THE STORY REOPENS (`LooksSectionReopenStory`, #1100, is the idiom): `key`-ing the providers gives the
// remount a fresh QueryClient, so `settings.getUserSettings` is genuinely re-requested rather than served
// from cache, while `surface-box-store` is module-level and survives the remount carrying the measurement.
// The second read is PARKED with `trpcHold`, which is the exact frame a user sees on the way back in.
//
// THE OBSERVABLE IS GEOMETRY, plus the source attribute. `data-tile-reserve-source` distinguishes "this
// device measured it" from "the mount declared a constant" — an assertion reading only `data-tile-reserved`
// would keep passing for the wrong reason if the key ever lost its measurement — and the tail sentinel is
// what a reader is actually looking at when the pane jumps.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { PersonaNotificationsReopenStory } from "../_ct-stories.tsx";

const SWITCH_LABEL = "Notify me when my persona changes in a chat";

const SETTINGS = { userId: "user_ct_personas", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** The first read answers; the SECOND is parked — the pending arm the reservation exists for. */
function routeSecondReadHeld(page: Page, hold: ReturnType<typeof trpcHold>): Promise<TrpcRecorder> {
  let reads = 0;
  return routeTrpc(page, { "settings.getUserSettings": (): unknown => (reads++ === 0 ? SETTINGS : hold) });
}

test("#1098: the notifications section RESERVES its measured box on a second cold read, and nothing under it moves", async ({ mount, page }) => {
  const hold = trpcHold();
  const trpc = await routeSecondReadHeld(page, hold);
  const component = await mount(<PersonaNotificationsReopenStory />);

  // SETTLED FIRST — the measurement only exists once the switch row has actually painted.
  await expect(component.getByRole("switch", { name: SWITCH_LABEL })).toBeVisible();
  const tail = component.getByTestId("personas-notifications-tail");
  const settledY = (await tail.boundingBox())?.y;
  expect(settledY, "the tail sentinel has no box").not.toBeUndefined();

  await component.getByRole("button", { name: "reopen" }).click();
  await hold.requested;

  // The reservation is this DEVICE's own measurement, not a declared constant.
  const reserved = page.locator("[data-tile-reserved]");
  await expect(reserved).toHaveAttribute("data-tile-reserve-source", "measured");
  // …and the sentence the section shows while waiting is INSIDE that held box, not in place of it.
  await expect(reserved.getByText("Loading your persona settings…")).toBeVisible();
  const heldY = (await tail.boundingBox())?.y ?? Number.NaN;
  // ±1px: the store keeps sub-pixel heights and the reserved `blockSize` is rounded.
  expect(Math.abs(heldY - (settledY ?? Number.NaN)), "the pane jumped while the settings read was in flight").toBeLessThanOrEqual(1);

  hold.release(SETTINGS);
  await expect(component.getByRole("switch", { name: SWITCH_LABEL })).toBeVisible();
  const afterY = (await tail.boundingBox())?.y ?? Number.NaN;
  expect(Math.abs(afterY - (settledY ?? Number.NaN)), "the pane jumped when the settings read landed").toBeLessThanOrEqual(1);
  // TWO genuine reads — a cached second open would make the whole pin vacuous.
  // ONESHOT-OK: read after the released switch re-rendered; the story issues no third read.
  expect(trpc.count("settings.getUserSettings")).toBe(2);
});
