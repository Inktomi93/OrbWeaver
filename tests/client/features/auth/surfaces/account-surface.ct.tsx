// CT: the real AccountSurface (features/auth/surfaces/account-surface.tsx — the P1-c reachability proof).
// This is the modal body the DESKTOP rail-foot Account entry opens (persona-panel AccountStrip →
// `openModal("account")` → the modal registry's `accountModal` body === <AccountSurface/>) — replacing the old
// stranded placeholder ("Sign-in details arrive with accounts.") and its duplicate `logout()`. The CT
// proves the surface renders THIS request's identity (handle · role · mode) and the ONE sign-out
// affordance, with the auth `/config` + `/me` reads stubbed at the network boundary (page.route).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { AccountSurfaceStory } from "../_ct-stories.tsx";

async function stubAuth(page: Page, opts: { mode: string; handle: Handle; role: string }): Promise<void> {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: opts.mode,
        requiresLogin: opts.mode === "local" || opts.mode === "oidc",
        localEnabled: opts.mode === "local",
        oidcEnabled: opts.mode === "oidc",
        discreetLogin: false,
        defaultHandle: opts.handle,
      }),
    }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true, handle: opts.handle, role: opts.role }),
    }),
  );
}

test("renders the viewer identity + a sign-out affordance in a cookie mode (local)", async ({ mount, page }) => {
  await stubAuth(page, { mode: "local", handle: castId<Handle>("owner"), role: "owner" });
  await mount(<AccountSurfaceStory />);
  const surface = page.getByTestId("account-surface");
  await expect(surface).toBeVisible();
  // Identity + mode rendered (handle "owner" + role/mode badges) — the real surface, not the placeholder.
  await expect(surface).toContainText("owner");
  await expect(surface).toContainText("local");
  // The cookie modes carry the ONE sign-out (POST /api/auth/logout, via auth-bootstrap) — not a duplicate.
  await expect(page.getByTestId("account-logout")).toBeVisible();
});

test("forward-header mode shows the proxy sign-out note instead of a logout button (no cookie session)", async ({ mount, page }) => {
  await stubAuth(page, { mode: "forward-header", handle: castId<Handle>("proxied"), role: "user" });
  await mount(<AccountSurfaceStory />);
  await expect(page.getByTestId("account-surface")).toBeVisible();
  await expect(page.getByTestId("account-logout")).toHaveCount(0);
  await expect(page.getByText("Sign out at your identity provider / reverse proxy.")).toBeVisible();
});
