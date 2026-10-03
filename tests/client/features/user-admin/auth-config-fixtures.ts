// The `/api/auth/config` stub the user-admin CTs share: one mode-derived config, served by `page.route` because the
// read is a plain fetch, not tRPC. Beside it, the `share.signInMode` view the Multi-user sign-in panel reads.

import type { AuthMode, AuthModeSource, InstallKind, SignInModeView } from "@orb/contracts/identity";
import { SHARE_MODE_REFUSAL, SIGN_IN_TARGET_MODES } from "@orb/contracts/identity";
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

/** The refusal sentence the stub serves for a mode Start sharing refuses; a test finds it in the panel verbatim. */
export function refusalSentence(mode: AuthMode): string {
  return `The server's ${mode} refusal sentence.`;
}

/** `share.signInMode` for a box running `mode`: bare metal with the mode set in `.env` unless a test says otherwise. */
export function signInModeView(mode: AuthMode, at: { readonly install?: InstallKind; readonly source?: AuthModeSource } = {}): SignInModeView {
  return {
    mode,
    source: at.source ?? "env-file",
    install: at.install ?? "bare-metal",
    targets: SIGN_IN_TARGET_MODES.map((target) => {
      const code = SHARE_MODE_REFUSAL[target];
      return { mode: target, shareRefusal: code === null ? null : { code, message: refusalSentence(target) } };
    }),
  };
}
