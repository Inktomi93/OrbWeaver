// @subject packages/ui/src/primitives/toast/toast.tsx
// One error notice is one alert to assistive technology: a single node wears the alert role, and the Alerts region holds the notice's words once, so a
// screen reader does not announce it twice.
import { ALERTS_REGION_NAME } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { ErrorNoticeStory } from "./_one-alert-stories.tsx";
import { ERROR_NOTICE_TITLE, RAISE_ERROR_NAME } from "./one-alert-names.ts";

const STORY = "tests/ui/primitives/toast/_one-alert-stories/ErrorNoticeStory";

test("one error notice exposes one visible alert node, and the Alerts region announces it once", async ({ mount, page }) => {
  await mount<typeof ErrorNoticeStory>(STORY, {});
  await page.getByRole("button", { name: RAISE_ERROR_NAME, exact: true }).click();
  const region = page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true });
  const notice = region.locator('[data-slot="toast-root"]');
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("role", "alert");
  // Every node in the document that wears the alert role, hidden from the accessibility tree or not: a visually hidden copy outside the region is a
  // second announcement.
  const alerts = page.getByRole("alert", { includeHidden: true });
  await expect(alerts).toHaveCount(1);
  await expect(alerts).toBeVisible();
  // The notice's words appear once across the whole document, and that once is inside the live region.
  await expect(page.getByText(ERROR_NOTICE_TITLE, { exact: true })).toHaveCount(1);
  await expect(region.getByText(ERROR_NOTICE_TITLE, { exact: true })).toHaveCount(1);
});
