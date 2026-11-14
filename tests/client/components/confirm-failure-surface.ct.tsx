// A confirm-class failure shows exactly one surface: the open confirm's alert line, or a toast once the confirm has closed
// (client-architecture-state-and-gates.md §11).
// @subject packages/client/src/components/confirm-dialog.tsx

import { fontSizeAgainstStep, watchToastMounts } from "@orb/testkit/browser/spec";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ConfirmFailureStory } from "./_confirm-failure-stories.tsx";

const STORY = "tests/client/components/_confirm-failure-stories/ConfirmFailureStory";
const TOAST_ROOT = '[data-slot="toast-root"]';
const CONFIRM_FAILURE = '[data-slot="dialog-failure"]';

test("a rejection while the confirm is open is said by its alert line, and no toast repeats it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    ...serveCorpusProcedures(caller, ["settings.updateAppSettings"], () => hold),
  });
  const toastMounts = await watchToastMounts(page);
  await mount<typeof ConfirmFailureStory>(STORY, {});

  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.getByRole("button", { name: "Write it", exact: true }).click();
  await hold.requested;
  hold.fail();
  await expect(page.locator(CONFIRM_FAILURE)).toBeVisible();
  // The failure line reads at the body step, the dialog description's own.
  const lineSize = await fontSizeAgainstStep(page.locator(CONFIRM_FAILURE), TOKENS["text.body"].cssVar);
  expect(lineSize.step).toBeGreaterThan(0);
  expect(lineSize.own).toBe(lineSize.step);
  // The mutation handler runs before the rejection reaches the confirm, so a toast it raised has mounted by now.
  expect(await toastMounts()).toBe(0);
});

test("a rejection after the confirm was cancelled is toasted once, since no line is left to say it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    ...serveCorpusProcedures(caller, ["settings.updateAppSettings"], () => hold),
  });
  const toastMounts = await watchToastMounts(page);
  await mount<typeof ConfirmFailureStory>(STORY, {});

  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.getByRole("button", { name: "Write it", exact: true }).click();
  await hold.requested;
  await page.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  hold.fail();
  await expect(page.locator(TOAST_ROOT)).toBeVisible();
  expect(await toastMounts()).toBe(1);
});
