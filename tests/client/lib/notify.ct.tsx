// F1 CT (mirrors lib/notify.ts — the seam under test) — PROVES the notify/toast seam renders
// (done ≠ rendered). Mounts the exact main.tsx wiring
// (createAppQueryClient's errorToast→notify channel + a bound toast manager + <ToastProvider>/<Toaster>)
// and asserts a failing mutation carrying `meta.errorToast` produces a REAL toast with the message.
// Before F1 (no provider mounted, `bindNotify` never called) this never reached pixels — the whole
// class of user-facing error notifications was console-only.

import { expect, test } from "@playwright/experimental-ct-react";
import { NotifyNoticeStory, NotifyToastStory } from "./_ct-stories.tsx";

test("a failed mutation with errorToast meta renders a toast (the notify render half)", async ({ mount, page }) => {
  await mount(<NotifyToastStory />);

  // Nothing surfaced yet.
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);

  // Fire the mutation → it rejects → MutationCache.onError reads meta.errorToast → notify.error →
  // the bound toast manager → the Toaster renders it.
  await page.getByRole("button", { name: "save", exact: true }).click();

  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Couldn't save your changes.");
  // `notify.error` routes through `type: "error"` → Base UI stamps data-type (the destructive tint).
  await expect(toast).toHaveAttribute("data-type", "error");
});

// The widened notice, end to end (side-eye INFRA-WARN-DEAF): one string could only ever produce one bold
// line, so a three-line warning had no scannable head and nowhere to put the next step. This drives the
// REAL production mapping (`createToastNotify`) and asserts all four halves reach pixels.
test("notify.warn renders a split title/description, the warning identity, and a working action", async ({ mount, page }) => {
  await mount(<NotifyNoticeStory />);
  await page.getByRole("button", { name: "warn", exact: true }).click();

  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveAttribute("data-type", "warning");
  await expect(toast.getByRole("heading")).toHaveText("Your preset's custom parameters weren't sent");
  await expect(toast.locator("p")).toContainText("Custom OpenAI-compatible connection");

  // The action is a REAL button (Base UI's Toast.Action, fed from `NotifyAction`) — clicking it runs the
  // handler the call site gave, which is the whole point of adding the channel.
  await toast.locator('[data-slot="toast-action"]').click();
  await expect(page.locator('[data-slot="toast-root"][data-type="success"]')).toContainText("Connections opened.");
});
