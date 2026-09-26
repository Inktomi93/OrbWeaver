// turn-warning cadence (rendered): whole turns through the real bus reducer and the real toast outlet. The
// claim is the COUNT of notices a user meets: one per turn at most, none when a turn drops the same settings
// the last one did on that connection. The set logic itself is pinned in `turn-warning-cadence.test.ts`.

import { expect, test } from "@playwright/experimental-ct-react";
import { TurnWarningCadenceStory } from "../_ct-stories.tsx";

const TOAST = '[data-slot="toast-root"]';

test("an unchanged set of drops on the next turn raises no second notice", async ({ mount, page }) => {
  const probe = await mount(<TurnWarningCadenceStory />);
  await probe.getByTestId("turn-top-p").click();
  await expect(page.locator(TOAST)).toHaveCount(1);

  await probe.getByTestId("turn-top-p").click();
  await probe.getByTestId("turn-top-p").click();
  await expect(page.locator(TOAST)).toHaveCount(1);
});

test("a turn whose drops changed raises exactly one notice covering all of them", async ({ mount, page }) => {
  const probe = await mount(<TurnWarningCadenceStory />);
  await probe.getByTestId("turn-top-p").click();
  await expect(page.locator(TOAST)).toHaveCount(1);

  await probe.getByTestId("turn-top-p-effort").click();
  await expect(page.locator(TOAST)).toHaveCount(2);
  // The second notice is the one grouped notice for the turn's two drops, not one toast per drop.
  await expect(page.locator(TOAST).filter({ hasText: "Top-P" }).filter({ hasText: "effort" })).toHaveCount(1);
});
