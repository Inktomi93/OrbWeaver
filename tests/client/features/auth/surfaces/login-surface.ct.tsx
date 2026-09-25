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
    allowInteractiveCards: false,
    uploads: DEFAULT_UPLOAD_CAPS,
    transport: "https",
    clientScope: "private",
    share: { state: "off", url: null },
    ...overrides,
  };
}

// Rule C/E — a login over plain http sends the password and the session cookie in clear, so the cookie modes
// say so above the form. The scope rides a data attribute: a public client is the red case.
test("local over plain http from a private client → the transport notice, private scope", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "local", transport: "http", clientScope: "private" })} />);
  await expect(page.getByTestId("login-transport-notice")).toBeVisible();
  await expect(page.getByTestId("login-transport-notice")).toHaveAttribute("data-client-scope", "private");
});

test("local over plain http from a public client → the transport notice, public scope", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "local", transport: "http", clientScope: "public" })} />);
  await expect(page.getByTestId("login-transport-notice")).toHaveAttribute("data-client-scope", "public");
});

test("the first-run form over plain http carries the notice too", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "local", localFirstRun: true, transport: "http" })} />);
  await expect(page.getByTestId("first-run-setup-form")).toBeVisible();
  await expect(page.getByTestId("login-transport-notice")).toBeVisible();
});

test("oidc over plain http carries the notice too", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "oidc", localEnabled: false, oidcEnabled: true, transport: "http" })} />);
  await expect(page.getByTestId("login-oidc")).toBeVisible();
  await expect(page.getByTestId("login-transport-notice")).toBeVisible();
});

test("https → no transport notice", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "local", transport: "https", clientScope: "public" })} />);
  await expect(page.getByTestId("login-local-form")).toBeVisible();
  await expect(page.getByTestId("login-transport-notice")).toHaveCount(0);
});

test("single-user mints no cookie → no transport notice even over plain http", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "single-user", requiresLogin: false, localEnabled: false, transport: "http", clientScope: "public" })} />);
  await expect(page.getByRole("heading", { name: "Single-user mode" })).toBeVisible();
  await expect(page.getByTestId("login-transport-notice")).toHaveCount(0);
});

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

// D254 — a signed-out invite visit stashed its token before the guard redirected here. The local arm offers
// the signup form, and the token rides only the POST body. The joiner names a persona in the same form: the
// account and its seat are created with it, so the form holds its submit until the persona has a name.
test("local + a stashed invite on a multi-human box → the signup form, posting the stashed token and the persona", async ({ mount, page }) => {
  let posted: unknown = null;
  await page.route("**/api/auth/signup", async (route) => {
    posted = route.request().postDataJSON();
    expect(route.request().headers()["x-orb-csrf"]).toBe("1");
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  await mount(<LoginArmStory config={config({ mode: "local", multiHumanCapable: true })} joinToken="tok_invite" />);
  await expect(page.getByTestId("signup-invite-form")).toBeVisible();
  await expect(page.getByTestId("login-local-form")).toHaveCount(0);
  await page.getByTestId("signup-handle").fill("friend");
  await page.getByTestId("signup-password").fill("hunter2pw");
  const submit = page.getByTestId("signup-submit");
  await expect(submit).toBeDisabled();
  await page.getByTestId("joiner-persona-name").fill("  Mira ");
  await submit.click();
  await expect(page.getByTestId("ct-login-done")).toBeVisible();
  expect(posted).toEqual({ token: "tok_invite", handle: "friend", password: "hunter2pw", persona: { name: "Mira", description: "" } });
});

test("local + a stashed invite → 'I already have an account' shows the credential form", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "local", multiHumanCapable: true })} joinToken="tok_invite" />);
  await page.getByTestId("signup-use-sign-in").click();
  await expect(page.getByTestId("login-local-form")).toBeVisible();
});

test("local + a stashed invite on a box that is not multi-human capable → the plain credential form", async ({ mount, page }) => {
  await mount(<LoginArmStory config={config({ mode: "local", multiHumanCapable: false })} joinToken="tok_invite" />);
  await expect(page.getByTestId("login-local-form")).toBeVisible();
  await expect(page.getByTestId("signup-invite-form")).toHaveCount(0);
});

// D254 — in oidc mode a stashed invite rides the login route to the server, which keeps only its hash. Only a
// multi-human box hands it on; a single-human box sends the bare route.
test("oidc + a stashed invite on a multi-human box → Continue carries ?invite= to the login route", async ({ mount, page }) => {
  const requested: string[] = [];
  await page.route("**/api/auth/oidc/login**", async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ status: 200, body: "" });
  });
  await mount(<LoginArmStory config={config({ mode: "oidc", localEnabled: false, oidcEnabled: true, multiHumanCapable: true })} joinToken="tok_invite" />);
  await page.getByTestId("login-oidc").click();

  await expect.poll(() => requested.length).toBe(1);
  const url = new URL(requested[0] ?? "");
  expect(url.pathname).toBe("/api/auth/oidc/login");
  expect(url.searchParams.get("invite")).toBe("tok_invite");
});

test("oidc + a stashed invite on a box that is not multi-human capable → Continue sends the bare route", async ({ mount, page }) => {
  const requested: string[] = [];
  await page.route("**/api/auth/oidc/login**", async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ status: 200, body: "" });
  });
  await mount(<LoginArmStory config={config({ mode: "oidc", localEnabled: false, oidcEnabled: true, multiHumanCapable: false })} joinToken="tok_invite" />);
  await page.getByTestId("login-oidc").click();

  await expect.poll(() => requested.length).toBe(1);
  expect(new URL(requested[0] ?? "").search).toBe("");
});
