// @subject packages/client/src/features/auth/surfaces/login-surface.tsx
// A single-user deployment's sign-in page has nothing to sign in to, and its one control leaves for the app.
import { authConfigSchema } from "@orb/contracts/auth-config";
import { routeAuthConfig } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import { BACK_TO_APP_NAME } from "#client/features/auth/lib/pending-join-names.ts";
import type { PendingJoinStory } from "./_pending-join-stories.tsx";
import { JOIN_DESTINATION_LABEL, PENDING_AUTH_CONFIG } from "./pending-join-fixtures.ts";

const SINGLE_USER_AUTH_CONFIG = authConfigSchema.parse({ ...PENDING_AUTH_CONFIG, mode: "single-user", oidcEnabled: false });

test("the single-user page's Back control leaves for the app", async ({ mount, page }) => {
  await routeAuthConfig(page, SINGLE_USER_AUTH_CONFIG);
  await page.addInitScript(() => {
    if (globalThis.top === globalThis.window) {
      globalThis.history.replaceState(null, "", "/login");
    }
  });
  await mount<typeof PendingJoinStory>("tests/client/features/auth/components/_pending-join-stories/PendingJoinStory", {});
  const back = page.getByRole("button", { name: BACK_TO_APP_NAME, exact: true });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.getByRole("heading", { name: JOIN_DESTINATION_LABEL, exact: true })).toBeVisible();
});
