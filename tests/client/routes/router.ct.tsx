// CT: a signed-out invitee lands on `/?join=<token>` while `/api/auth/me` is slow, through the production router
// with full motion (view transitions live). The landing must reach the invite sign-up form, never the crash
// fallback, and the raw token must leave the address bar without adding a history entry.

import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { expect, test } from "@playwright/experimental-ct-react";
import type { AuthConfig } from "../../../packages/client/src/data/auth-config.ts";
import { ProductionRouterAliasStory, ProductionRouterOverlapStory, ProductionRouterStory, RouterTokenHandoffStory } from "./_ct-stories.tsx";

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

test("the /analytics alias heals to Corpus Insights before the auth redirect", async ({ mount, page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, json: { authenticated: false, handle: null, role: null } }));
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, json: INVITE_CONFIG }));
  await page.evaluate(() => globalThis.history.replaceState(null, "", "/analytics"));
  await mount(<ProductionRouterAliasStory />);
  await expect(page.getByRole("status", { name: "Workspace destination" })).toHaveText("corpus:insights");
  await expect.poll(() => page.evaluate(() => globalThis.location.pathname)).toBe("/login");
  await expect(page.getByTestId("ct-app-crashed")).toHaveCount(0);
});

test("overlapping navigations during a slow guard settle on the latest login location", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let reads = 0;
  await page.route("**/api/auth/me", async (route) => {
    reads += 1;
    await new Promise<void>((resolve) => setTimeout(resolve, SLOW_ME_MS));
    await route.fulfill({ status: 200, json: { authenticated: false, handle: null, role: null } });
  });
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, json: INVITE_CONFIG }));
  await page.evaluate(() => globalThis.history.replaceState(null, "", "/login"));
  await mount(<ProductionRouterOverlapStory />);
  await expect.poll(() => reads).toBe(1);
  await page.getByRole("button", { name: "First navigation", exact: true }).click();
  await page.getByRole("button", { name: "Second navigation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible({ timeout: SLOW_ME_MS * 8 });
  await expect(page.getByTestId("ct-app-crashed")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => globalThis.location.pathname + globalThis.location.search)).toBe("/login?second=1");
});

test("a signed-in handoff keeps the token once and replaces only its query fields", async ({ mount, page }) => {
  const historyLength = await page.evaluate(() => {
    sessionStorage.setItem("orb:join-token", "stashed-token");
    history.replaceState(null, "", "/?space=%20&join=url-token&plus=+&join=second&tag=first&tag=second&%6aoin=third#turn-4");
    return history.length;
  });
  await mount(<RouterTokenHandoffStory />);
  await expect(page.getByRole("status", { name: "Captured invite" })).toHaveText("url-token");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        href: location.pathname + location.search + location.hash,
        length: history.length,
        stash: sessionStorage.getItem("orb:join-token"),
      })),
    )
    .toEqual({ href: "/?space=%20&plus=+&tag=first&tag=second#turn-4", length: historyLength, stash: null });
  await page.getByRole("button", { name: "Read remaining token", exact: true }).click();
  await expect(page.getByRole("status", { name: "Remaining invite" })).toHaveText("spent");
});

test("leaving an OIDC pending join replaces only pendingJoin and keeps other query bytes and hash", async ({ mount, page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, json: { authenticated: false, handle: null, role: null } }));
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ status: 200, json: { ...INVITE_CONFIG, mode: "oidc", oidcEnabled: true, localEnabled: false } }),
  );
  await page.route("**/api/auth/oidc/pending/preview", (route) => route.fulfill({ status: 200, json: ROOM }));
  const historyLength = await page.evaluate(() => {
    history.replaceState(null, "", "/login?space=%20&pendingJoin=1&plus=+&pendingJoin=1#turn-4");
    return history.length;
  });
  await mount(<ProductionRouterStory />);
  await expect(page.getByRole("button", { name: "Not now", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue with Test IdP", exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => ({ href: location.pathname + location.search + location.hash, length: history.length })))
    .toEqual({ href: "/login?space=%20&plus=+#turn-4", length: historyLength });
  await expect(page.getByTestId("ct-app-crashed")).toHaveCount(0);
});
