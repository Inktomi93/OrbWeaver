// F1 CT (mirrors lib/notify.ts — the seam under test) — PROVES the notify/toast seam renders
// (done ≠ rendered). Mounts the exact main.tsx wiring
// (createAppQueryClient's errorToast→notify channel + a bound toast manager + <ToastProvider>/<Toaster>)
// and asserts a failing mutation carrying `meta.errorToast` produces a REAL toast with the message.
// Before F1 (no provider mounted, `bindNotify` never called) this never reached pixels — the whole
// class of user-facing error notifications was console-only.

import { expect, test } from "@playwright/experimental-ct-react";
import { NotifyToastStory } from "./_ct-stories.tsx";

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
