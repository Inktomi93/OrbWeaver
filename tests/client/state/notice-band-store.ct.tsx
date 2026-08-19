// notice-band store CT (mirrors state/notice-band-store.ts) — the cross-tree publish that #193's band
// rests on, and the RELEASE that keeps it honest.
//
// A CT, not a unit test, for the reason the whole store exists: the value is a live DOM node and the read
// surface is a reactive hook feeding a PORTAL, so "did the toast land in the band?" is a question only a
// rendered tree can answer (the composer-draft-store.ct.tsx posture). The probe mirrors production's
// topology — `NoticeBand` (the writer) and `AppToaster` (the reader, inside `CtToastSurface`) are
// SIBLINGS, never ancestor and descendant, which is why a React context could not have carried this.
//
// The second test is the one that pays for the design: the band is unmounted mid-life, which is the
// app-level crash-boundary swap. A "is a shell mounted?" boolean would go stale exactly there and strand
// the outlet portalling into a detached node; publishing the NODE means its own cleanup is the truth, and
// the stack falls back to the fixed overlay — the placement a surface with nothing to reflow needs.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { NoticeBandProbe } from "./_ct-stories.tsx";

const BAND = '[data-slot="notice-band"]';
const TOAST = '[data-slot="toast-root"]';
const VIEWPORT = '[data-slot="toast-viewport"]';

/** THE viewport this app's `notify` renders into. `CtToastSurface`'s `AppToaster` is now the ONLY outlet
 *  on the page — the harness stopped mounting its own always-empty `<Toaster />` in #247 — so this is a
 *  plain single-node locator. The `.filter({ has: toast })` discriminator that used to be required here
 *  would now hide a real defect: a viewport that exists but never received the notice. */
function liveViewport(page: Page): Locator {
  return page.locator(VIEWPORT);
}

test("a published band takes the toast stack out of the overlay plane and into flow", async ({ mount, page }) => {
  const probe = await mount(<NoticeBandProbe />);
  await probe.getByRole("button", { name: "raise notice" }).click();

  await expect(page.locator(`${BAND} ${TOAST}`)).toHaveCount(1);
  // IN FLOW is the whole claim — a `fixed` viewport here would mean the band published and changed nothing.
  await expect(liveViewport(page)).not.toHaveCSS("position", "fixed");
});

test("publishNoticeBand RE-TARGETS a live stack — the notice follows the host that is current now", async ({ mount, page }) => {
  const probe = await mount(<NoticeBandProbe />);
  await probe.getByRole("button", { name: "raise notice" }).click();
  await expect(page.locator(`${BAND} ${TOAST}`)).toHaveCount(1);

  // A frame rebuild hands the outlet a DIFFERENT node while a notice is already up. The stack must move,
  // not split: a toast left in the old host would be a notice pinned to a surface that no longer exists.
  await probe.getByRole("button", { name: "publish the spare host" }).click();

  await expect(page.locator('[data-testid="spare-host"] [data-slot="toast-root"]')).toHaveCount(1);
  await expect(page.locator(`${BAND} ${TOAST}`)).toHaveCount(0);
  await expect(page.locator(TOAST)).toHaveCount(1);
});

test("losing the band mid-life releases the stack back to the fixed overlay (the crash-swap case)", async ({ mount, page }) => {
  const probe = await mount(<NoticeBandProbe />);
  await probe.getByRole("button", { name: "raise notice" }).click();
  await expect(page.locator(`${BAND} ${TOAST}`)).toHaveCount(1);

  await probe.getByRole("button", { name: "drop the shell" }).click();

  // The band is gone, and so is any toast inside it…
  await expect(page.locator(BAND)).toHaveCount(0);
  // …but the notice itself survives the swap and re-anchors to the viewport, which is the point: a user
  // must not lose the message that the thing they were doing failed just because a surface unmounted.
  await expect(page.locator(TOAST)).toHaveCount(1);
  await expect(liveViewport(page)).toHaveCSS("position", "fixed");
});
