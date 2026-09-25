// CT: the OIDC pending-join card (features/auth/components/login-pending-join.tsx, D254). The callback held a
// JIT-closed identity that arrived with a signup invite and landed on /login?pendingJoin=1. Proves the card
// previews the room, confirms with an EMPTY body under the CSRF header, signs in only when the server says so,
// shows the approval state when it does not, and never offers Join once the pending join is gone.

import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { AuthConfig } from "../../../../../packages/client/src/data/auth-config.ts";
import { LoginPendingJoinStory } from "../_ct-stories.tsx";

const OIDC: AuthConfig = {
  mode: "oidc",
  requiresLogin: true,
  localEnabled: false,
  oidcEnabled: true,
  oidcProviderName: "Test IdP",
  localFirstRun: false,
  discreetLogin: false,
  defaultHandle: null,
  multiHumanCapable: true,
  forbidExternalMedia: true,
  trustHtml: false,
  allowInteractiveCards: false,
  uploads: DEFAULT_UPLOAD_CAPS,
  transport: "https",
  clientScope: "private",
  share: { state: "off", url: null },
};

const PREVIEW = { chatId: "chat_01j0000000000000000000000a", roomName: "The room", hostHandle: "host", memberCount: 2, modeLabel: "per-speaker · natural" };

interface Captured {
  readonly bodies: unknown[];
  readonly csrf: (string | undefined)[];
}

async function stubPending(page: Page, confirm: { readonly status: number; readonly json: object }): Promise<Captured> {
  const captured: Captured = { bodies: [], csrf: [] };
  await page.route("**/api/auth/oidc/pending/preview", (route) => route.fulfill({ status: 200, json: PREVIEW }));
  await page.route("**/api/auth/oidc/pending/confirm", async (route) => {
    captured.bodies.push(route.request().postDataJSON());
    captured.csrf.push(route.request().headers()["x-orb-csrf"]);
    await route.fulfill(confirm);
  });
  return captured;
}

test("previews the room and confirms with an empty body under the CSRF header, then signs in", async ({ mount, page }) => {
  const captured = await stubPending(page, { status: 200, json: { signedIn: true } });
  await mount(<LoginPendingJoinStory config={OIDC} />);
  const card = page.getByTestId("pending-join");
  await expect(card).toContainText("host");
  await expect(card).toContainText("The room");
  await page.getByTestId("pending-join-confirm").click();

  await expect(page.getByTestId("ct-login-done")).toBeVisible();
  expect(captured.bodies).toEqual([{}]);
  expect(captured.csrf).toEqual(["1"]);
});

test("an account held for approval shows the approval state and never signs in", async ({ mount, page }) => {
  await stubPending(page, { status: 200, json: { signedIn: false } });
  await mount(<LoginPendingJoinStory config={OIDC} />);
  await page.getByTestId("pending-join-confirm").click();

  await expect(page.getByTestId("pending-join-approval")).toBeVisible();
  await expect(page.getByTestId("ct-login-done")).toHaveCount(0);
});

test("a refused confirm renders inline and keeps the visitor signed out", async ({ mount, page }) => {
  await stubPending(page, { status: 409, json: { error: "account_exists" } });
  await mount(<LoginPendingJoinStory config={OIDC} />);
  await page.getByTestId("pending-join-confirm").click();

  await expect(page.getByTestId("pending-join-error")).toBeVisible();
  await expect(page.getByTestId("ct-login-done")).toHaveCount(0);
});

test("no live pending join offers no Join, only the way back to sign-in", async ({ mount, page }) => {
  let confirms = 0;
  await page.route("**/api/auth/oidc/pending/preview", (route) => route.fulfill({ status: 404, json: { error: "join_unavailable" } }));
  await page.route("**/api/auth/oidc/pending/confirm", async (route) => {
    confirms += 1;
    await route.fulfill({ status: 404, json: { error: "join_unavailable" } });
  });
  await mount(<LoginPendingJoinStory config={OIDC} />);
  const unavailable = page.getByTestId("pending-join-unavailable");
  await expect(unavailable).toBeVisible();
  await expect(page.getByTestId("pending-join-confirm")).toHaveCount(0);
  await unavailable.getByRole("button").click();

  await expect(page.getByTestId("login-oidc")).toBeVisible();
  expect(confirms).toBe(0);
});

test("Not now leaves the card for the plain sign-in", async ({ mount, page }) => {
  await stubPending(page, { status: 200, json: { signedIn: true } });
  await mount(<LoginPendingJoinStory config={OIDC} />);
  await page.getByTestId("pending-join-dismiss").click();

  await expect(page.getByTestId("login-oidc")).toBeVisible();
  await expect(page.getByTestId("pending-join")).toHaveCount(0);
});
