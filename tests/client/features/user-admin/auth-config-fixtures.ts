// The `/api/auth/config` stub the user-admin CTs share: one mode-derived config, served by `page.route` because the
// read is a plain fetch, not tRPC.

import type { AuthMode } from "@orb/contracts/identity";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import type { Page } from "@playwright/test";
import type { AuthConfig } from "../../../../packages/client/src/data/auth-config.ts";

function authConfigFor(mode: AuthMode): AuthConfig {
  return {
    mode,
    requiresLogin: mode === "local" || mode === "oidc",
    localEnabled: mode === "local",
    oidcEnabled: mode === "oidc",
    oidcProviderName: "Test IdP",
    localFirstRun: false,
    discreetLogin: false,
    defaultHandle: "owner",
    multiHumanCapable: mode !== "single-user",
    forbidExternalMedia: true,
    trustHtml: false,
    allowInteractiveCards: false,
    uploads: DEFAULT_UPLOAD_CAPS,
    transport: "http",
    clientScope: "private",
    share: { state: "off", url: null },
  };
}

/** `reach` is how the request reached the server; the default is plain http from a private network. */
export async function stubAuthConfig(page: Page, mode: AuthMode, reach?: Pick<AuthConfig, "transport" | "clientScope">): Promise<void> {
  const body = JSON.stringify({ ...authConfigFor(mode), ...reach });
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body }));
}
