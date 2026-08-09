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
    oidcProviderName: "Test IdP",
    localFirstRun: false,
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
  // A7 — no error param ⇒ no alert line above Continue.
  await expect(page.getByTestId("login-auth-error")).toHaveCount(0);
});

test("oidc → the Continue button + copy carry the OIDC_PROVIDER_NAME (A8)", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "oidc", localEnabled: false, oidcEnabled: true, oidcProviderName: "Acme SSO" })} />);
  await expect(page.getByTestId("login-oidc")).toHaveText("Continue with Acme SSO");
  await expect(page.getByText("You'll be redirected to Acme SSO, then back here.")).toBeVisible();
});

test("local + localFirstRun → the FIRST-RUN owner-password setup form, NOT the credential form (B4)", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "local", localFirstRun: true })} />);
  await expect(page.getByRole("heading", { name: "Set up your server" })).toBeVisible();
  await expect(page.getByTestId("first-run-setup-form")).toBeVisible();
  await expect(page.getByTestId("first-run-password")).toBeVisible();
  await expect(page.getByTestId("first-run-confirm")).toBeVisible();
  // The normal credential form is NOT shown on a fresh box.
  await expect(page.getByTestId("login-local-form")).toHaveCount(0);
});

test("oidc + authError → a role=alert message renders above the Continue button (A7)", async ({ mount, page }) => {
  await mount(
    <LoginArmStory
      config={config({ mode: "oidc", localEnabled: false, oidcEnabled: true })}
      authError="Your account isn't authorized to use this application. Contact your administrator."
    />,
  );
  const alert = page.getByTestId("login-auth-error");
  await expect(alert).toBeVisible();
  await expect(alert).toHaveAttribute("role", "alert");
  await expect(alert).toContainText("isn't authorized");
  // Continue is still offered (the user can retry the SSO round-trip).
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
