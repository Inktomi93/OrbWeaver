// @subject packages/client/src/lib/use-focus-on-mount.ts
// A surface arrives from `<body>` only for a navigation: a press whose own control the same render removed. A cold load has no
// press, and a press that went nowhere does not license a surface that mounts for another reason long after it. A surface whose read is
// still pending behind the boundary the press opened arrives when the read settles, however long that takes.
import { absenceWindow, holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PRESS_RENDER_WINDOW_MS } from "#client/lib/use-focus-on-mount.ts";
import type { PressSwapStory, SlowReadSwapStory, StrayMountStory } from "./_use-focus-on-mount-stories.tsx";
import { ARRIVAL_EVENT, DISMISS_NAME, OPEN_NAME, PENDING_NAME, SURFACE_NAME } from "./use-focus-on-mount-names.ts";

const PRESS_SWAP = "tests/client/lib/_use-focus-on-mount-stories/PressSwapStory";
const SLOW_READ_SWAP = "tests/client/lib/_use-focus-on-mount-stories/SlowReadSwapStory";
const STRAY_MOUNT = "tests/client/lib/_use-focus-on-mount-stories/StrayMountStory";
// Past the window, so a press that armed the arrival has had every chance to be taken for the surface's navigation.
const PAST_WINDOW_MS = PRESS_RENDER_WINDOW_MS + 100;

test("a surface that mounts in the render that removes the control just pressed takes focus", async ({ mount, page }) => {
  await mount<typeof PressSwapStory>(PRESS_SWAP, {});

  await page.getByRole("button", { name: OPEN_NAME, exact: true }).click();

  await expect(page.getByRole("region", { name: SURFACE_NAME, exact: true })).toBeFocused();
});

test("a surface that mounts long after a press that went nowhere leaves focus on the body", async ({ mount, page }) => {
  await mount<typeof StrayMountStory>(STRAY_MOUNT, {});
  await page.getByRole("button", { name: DISMISS_NAME, exact: true }).click();
  await expect(page.getByRole("button", { name: DISMISS_NAME, exact: true })).toHaveCount(0);
  await absenceWindow(page, PAST_WINDOW_MS);

  await page.evaluate((name) => globalThis.dispatchEvent(new Event(name)), ARRIVAL_EVENT);

  // The surface is there (the control of this case), and nothing moved focus into it.
  const surface = page.getByRole("region", { name: SURFACE_NAME, exact: true });
  await expect(surface).toBeVisible();
  await expect(surface).not.toBeFocused();
});

test("a surface whose read outlasts the window mounts into the press that opened it and takes focus", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const read = holdServed();
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, ["refinery.listSessions"], () => read),
  );
  await mount<typeof SlowReadSwapStory>(SLOW_READ_SWAP, {});
  await page.getByRole("button", { name: OPEN_NAME, exact: true }).click();
  await read.requested;
  await absenceWindow(page, PAST_WINDOW_MS);
  // Positive control: the read is still held past the window, so the boundary shows its fallback and no surface has mounted.
  await expect(page.getByText(PENDING_NAME, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: SURFACE_NAME, exact: true })).toHaveCount(0);

  read.release();

  await expect(page.getByRole("region", { name: SURFACE_NAME, exact: true })).toBeFocused();
});
