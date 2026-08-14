// CT: the rung-1 in-app re-auth loop (staleness-and-session-freshness.md §4.4, owner fork F2 — "in-app
// modal, cache preserved"). What is under test is NOT a modal rendering: it is the whole LOCAL-mode ladder
// driven the way the socket drives it, with only the network stubbed.
//
// The defect this replaces: a mid-session UNAUTHORIZED did exactly one thing — `location.assign("/login")`
// — which threw away the query cache, the open chat and every unsent draft to fix a cookie. The rendered
// `ct-resumes` counter is the proof of the new behavior: the session came back and this mount was NEVER
// navigated away from (a rung-2 redirect would tear the whole component tree out from under the assertion).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { ReauthLadderStory } from "../_ct-stories.tsx";

/** `/api/auth/me` answers DEAD until the login POST lands, then ALIVE — the real sequence the ladder walks. */
async function stubLocalAuth(page: Page): Promise<() => number> {
  let alive = false;
  let logins = 0;
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "local",
        requiresLogin: true,
        localEnabled: true,
        oidcEnabled: false,
        discreetLogin: false,
        localFirstRun: false,
        defaultHandle: "owner",
      }),
    }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: alive, handle: alive ? "owner" : null, role: alive ? "owner" : null }),
    }),
  );
  await page.route("**/api/auth/login", (route) => {
    logins += 1;
    alive = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return (): number => logins;
}

test("a dead LOCAL session opens the re-auth prompt and resumes IN PLACE — no navigation", async ({ mount, page }) => {
  const logins = await stubLocalAuth(page);
  await mount(<ReauthLadderStory />);

  await page.getByTestId("ct-kill-session").click();

  // Rung 1: the prompt, not a redirect. Its copy is the promise the design makes to the user.
  const surface = page.getByTestId("reauth-surface");
  await expect(surface).toBeVisible();
  await expect(surface).toContainText("pick up exactly where you left off");

  await page.getByTestId("login-handle").fill("owner");
  await page.getByTestId("login-password").fill("hunter2");
  await page.getByTestId("login-submit").click();

  // THE claim: the ladder resumed. The counter is rendered BY THE STILL-MOUNTED tree, so a green here is
  // simultaneously "recovery ran" and "nothing navigated".
  await expect(page.getByTestId("ct-resumes")).toHaveText("1");
  expect(logins()).toBe(1);
});

test("the prompt is a real credential form seeded from the deployment's default handle", async ({ mount, page }) => {
  await stubLocalAuth(page);
  await mount(<ReauthLadderStory />);

  await page.getByTestId("ct-kill-session").click();

  await expect(page.getByTestId("reauth-surface")).toBeVisible();
  // Seeded from `/api/auth/config` — the same form /login renders, not a re-spelled copy that can drift.
  await expect(page.getByTestId("login-handle")).toHaveValue("owner");
  await expect(page.getByTestId("login-submit")).toBeVisible();
});
