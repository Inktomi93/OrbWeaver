// CT: the rung-1 in-app re-auth loop (owner ruling: "in-app
// modal, cache preserved"). What is under test is NOT a modal rendering: it is the whole LOCAL-mode ladder
// driven the way the socket drives it, with only the network stubbed.
//
// The defect this replaces: a mid-session UNAUTHORIZED did exactly one thing — `location.assign("/login")`
// — which threw away the query cache, the open chat and every unsent draft to fix a cookie. The rendered
// `ct-resumes` counter is the proof of the new behavior: the session came back and this mount was NEVER
// navigated away from (a rung-2 redirect would tear the whole component tree out from under the assertion).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { ReauthDismissalStory, ReauthLadderStory } from "../_ct-stories.tsx";

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

// THE DISMISSAL WIRE, through the shell's real ModalHost — the one seam the story above bypasses by
// rendering the modal BODY directly. `reauthModal.onClose` had zero coverage: nothing anywhere asserted
// that a semantic dialog close reaches `completeReauth("dismissed")`.
//
// Its failure mode is SILENT and browser-wide. `runLadder` awaits `promptReauth()` while holding the
// `orb:session-recovery` Web Lock; if the verdict never arrives (a ModalHost refactor dropping
// `def.onClose?.()`), the await never settles, the lock is never released, and every OTHER tab's ladder
// takes the follower branch forever — no tab recovers, and nothing renders differently anywhere. So the
// observable here is the rung-2 NAVIGATION, which only happens once the dismissal verdict lands.
test("dismissing the prompt through ModalHost lands the rung-2 verdict (the Web-Lock deadlock tripwire)", async ({ mount, page }) => {
  await stubLocalAuth(page);
  // The rung-2 navigation is ABORTED rather than followed, so the request itself is the assertion and the
  // mounted tree survives it. `"aborted"` (net::ERR_ABORTED) specifically: the default `"failed"` makes
  // chromium swap in an error page, and every later assertion would then pass vacuously on a torn-down
  // tree. Matched by exact pathname, not a glob — `**/login` would also swallow `/api/auth/login`.
  let loginNavigations = 0;
  await page.route(
    (url) => url.pathname === "/login",
    (route) => {
      loginNavigations += 1;
      return route.abort("aborted");
    },
  );

  await mount(<ReauthDismissalStory />);
  await page.getByTestId("ct-kill-session").click();
  await expect(page.getByTestId("reauth-surface")).toBeVisible();
  // Nothing has been decided yet — the ladder is parked on the prompt, holding the lock.
  expect(loginNavigations).toBe(0);

  await page.keyboard.press("Escape");

  await expect.poll(() => loginNavigations).toBe(1);
  await expect(page.getByTestId("reauth-surface")).toBeHidden();
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
