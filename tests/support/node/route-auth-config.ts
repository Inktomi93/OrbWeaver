// The auth config the shell reads at boot, served to a page that has no live server behind it.

import type { AuthConfig } from "@orb/contracts/auth-config";
import type { Page } from "@playwright/test";

/** Serve `/api/auth/config`: a parsed config as JSON, or the body a root already produced. */
export async function routeAuthConfig(page: Page, config: AuthConfig | string): Promise<void> {
  await page.route("**/api/auth/config", (route) =>
    typeof config === "string" ? route.fulfill({ contentType: "application/json", body: config }) : route.fulfill({ json: config }),
  );
}
