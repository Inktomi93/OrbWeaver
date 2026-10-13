// The `/api/auth/config` stub the user-admin CTs share: one mode-derived config, served by `page.route` because the
// read is a plain fetch, not tRPC. Beside it, the `share.signInMode` view the Multi-user sign-in panel reads and the
// refusals Start sharing and the IP certificate answer with, all taken from the server's own decisions.

import type { AuthMode, AuthModeSource, InstallKind, IpCertificateSetting, SignInModeView } from "@orb/contracts/identity";
import { SIGN_IN_TARGET_MODES } from "@orb/contracts/identity";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import type { Page } from "@playwright/test";
import type { AuthConfig } from "#client/data/auth-config.ts";
import type { IpCertificateRefusalNotice, ShareFacts } from "#server/domain/share/index.ts";
import { certificateRefusal, modeShareRefusal } from "#server/domain/share/index.ts";

function authConfigFor(mode: AuthMode): AuthConfig {
  return {
    mode,
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

const SETUP_URL = "http://localhost:3000/setup";
const APP_PORT = 3000;

/** The facts of a claimed box running `mode` that listens beyond loopback. */
function shareFacts(mode: AuthMode): ShareFacts {
  return { authMode: mode, ownerNeedsPassword: () => Promise.resolve(false), localSetupUrl: () => SETUP_URL, publicAddresses: [] };
}

/** The sentence the server refuses Start sharing with under `mode`; a test finds it in the panel verbatim. */
export function refusalSentence(mode: AuthMode): string {
  const refusal = modeShareRefusal(mode, shareFacts(mode));
  if (refusal === null) {
    throw new Error(`the server does not refuse sharing under ${mode}`);
  }
  return refusal.message;
}

/** The refusal the server answers `setting` with on a claimed local box; throws when it would accept it, so a
 *  test that scripts a refusal cannot go vacuous. */
export async function ipCertificateRefusalFor(setting: IpCertificateSetting): Promise<IpCertificateRefusalNotice> {
  const checked = await certificateRefusal({ ...shareFacts("local"), publicBind: true, appPort: () => APP_PORT }, setting);
  if (checked.refusal === null) {
    throw new Error(`the server accepts ${setting.address} for an IP certificate`);
  }
  return checked.refusal;
}

/** `share.signInMode` for a box running `mode`: bare metal with the mode set in `.env` unless a test says otherwise. */
export function signInModeView(mode: AuthMode, at: { readonly install?: InstallKind; readonly source?: AuthModeSource } = {}): SignInModeView {
  return {
    mode,
    source: at.source ?? "env-file",
    install: at.install ?? "bare-metal",
    targets: SIGN_IN_TARGET_MODES.map((target) => ({ mode: target, shareRefusal: modeShareRefusal(target, shareFacts(mode)) })),
  };
}
