// CT: the per-mode login arm (features/auth/surfaces/login-surface.tsx `LoginBody` — the P1-a
// reachability proof). An unauthenticated request in a login-capable mode lands on /login (the guard
// unit test proves the routing); THIS proves the surface then renders the RIGHT arm — most importantly
// the forward-header EXPLAINER (previously unreachable: /login always bounced home before this fix), and
// the OIDC SSO button + the local credential form. Router-free (LoginBody takes `config` + a stub
// `onDone`), so no memory-router harness is needed.

import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { expect, test } from "@playwright/experimental-ct-react";
import type { AuthConfig } from "../../../../../packages/client/src/data/auth-config.ts";
import { LoginArmStory } from "../_ct-stories.tsx";

function config(overrides: Partial<AuthConfig>): AuthConfig {
  return {
    mode: "local",
    requiresLogin: true,
    localEnabled: true,
    oidcEnabled: false,
    discreetLogin: false,
    defaultHandle: "owner",
    multiHumanCapable: false,
    forbidExternalMedia: true,
    trustHtml: false,
    uploads: DEFAULT_UPLOAD_CAPS,
    ...overrides,
  };
}

test("forward-header → the proxy-config EXPLAINER (reachable now — no login form, no blank bounce)", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "forward-header", requiresLogin: false, localEnabled: false })} />);
  await expect(page.getByRole("heading", { name: "Authentication happens at your proxy" })).toBeVisible();
  // The explainer is NOT a form — no credential inputs.
  await expect(page.getByTestId("login-handle")).toHaveCount(0);
});

test("oidc → the SSO redirect button (whole-window navigation arm)", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "oidc", localEnabled: false, oidcEnabled: true })} />);
  await expect(page.getByTestId("login-oidc")).toBeVisible();
});

test("local → the credential form (handle pre-filled)", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "local" })} />);
  await expect(page.getByTestId("login-handle")).toHaveValue("owner");
  await expect(page.getByTestId("login-submit")).toBeVisible();
});

test("single-user → the 'no login needed' explainer (reachable only by direct nav)", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "single-user", requiresLogin: false, localEnabled: false })} />);
  await expect(page.getByRole("heading", { name: "Single-user mode" })).toBeVisible();
});
