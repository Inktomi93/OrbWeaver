// CT: a signed-out invitee lands on `/?join=<token>` while `/api/auth/me` is slow, through the production router
// with full motion (view transitions live). The landing must reach the invite sign-up form, never the crash
// fallback, and the raw token must leave the address bar without adding a history entry.

import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { expect, test } from "@playwright/experimental-ct-react";
import type { AuthConfig } from "../../../packages/client/src/data/auth-config.ts";
import { ProductionRouterStory } from "./_ct-stories.tsx";

const JOIN_TOKEN = "ct-join-token";
// Long enough that a second `/` load, if anything starts one, is still in its guard read when the redirect lands.
const SLOW_ME_MS = 1200;
const ROOM = {
  chatId: "chat_01j0000000000000000000000b",
  roomName: "Tavern Night",
  hostHandle: "alex",
  memberCount: 3,
  modeLabel: "The characters take turns.",
};
const INVITE_CONFIG: AuthConfig = {
  mode: "local",
  requiresLogin: true,
  localEnabled: true,
  oidcEnabled: false,
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

test("a slow auth read on a signed-out /join landing reaches the invite form, not the crash fallback", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const meReads: string[] = [];
  await page.route("**/api/auth/me", async (route) => {
    meReads.push(route.request().url());
    await new Promise<void>((resolve) => {
      setTimeout(resolve, SLOW_ME_MS);
    });
    await route.fulfill({ status: 200, json: { authenticated: false, handle: null, role: null } });
  });
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, json: INVITE_CONFIG }));
  await page.route("**/api/auth/signup/preview", (route) => route.fulfill({ status: 200, json: ROOM }));
  const historyLength = await page.evaluate((token) => {
    globalThis.history.replaceState(null, "", `/?join=${token}`);
    return globalThis.history.length;
  }, JOIN_TOKEN);

  await mount(<ProductionRouterStory />);

  await expect(page.getByRole("button", { name: "Create account and join", exact: true })).toBeVisible({ timeout: SLOW_ME_MS * 4 });
  await expect(page.getByTestId("ct-app-crashed")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => ({ path: globalThis.location.pathname, search: globalThis.location.search, length: globalThis.history.length })))
    .toEqual({ path: "/login", search: "", length: historyLength });
  // One guard read for `/` and one for `/login`: a scrub that the router hears as a navigation re-runs `/`.
  expect(meReads).toHaveLength(2);
});
