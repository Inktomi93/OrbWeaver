// CT: `useSessionRecovery` — the mount that arms the session machinery (staleness-and-session-freshness.md
// §4.4). A wiring hook has no pixels, and that is exactly why it needs a test: every failure mode here is
// SILENT. An un-bound durable-local namespace keeps writing the legacy `orb:<name>` key, so the next
// identity on this browser inherits the previous one's tag filters, drafts and view state — the reported
// repro, restored by omission.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc, trpcError, trpcHold } from "../../support/node/route-trpc.ts";
import { SessionRecoveryBindFailureStory, SessionRecoveryReauthStory, SessionRecoveryStory, SessionSwapStory } from "./_ct-stories.tsx";

const VIEWER = { userId: "usr_ct_owner", handle: castId<Handle>("owner"), globalRole: "owner" };

test("binds the durable-local namespace to the viewer id off `sessions.me` (F1)", async ({ mount, page }) => {
  await routeTrpc(page, { "sessions.me": (): unknown => VIEWER });

  await mount(<SessionRecoveryStory />);

  // Before the identity read lands the namespace is legitimately unbound; the assertion is that it BECOMES
  // the viewer's id — which is what makes every `orb:*` key user-scoped for the rest of the page.
  await expect(page.getByTestId("durable-local-user")).toHaveText(VIEWER.userId);
});

test("mounts without suspending or navigating when the identity read is still in flight", async ({ mount, page }) => {
  const identity = trpcHold();
  await routeTrpc(page, { "sessions.me": identity });

  await mount(<SessionRecoveryStory />);
  await identity.requested;

  const durableUser = page.getByTestId("durable-local-user");
  await expect(durableUser).toHaveText("unbound");

  // Settle the held transport with the real ViewerView shape after the pending arm is proven. Leaving the
  // request unfed answered `null`, not pending, and made this assertion race a render-time TypeError.
  identity.release(VIEWER);
  await expect(durableUser).toHaveText(VIEWER.userId);
});

test("surfaces a durable-local bind failure and retries to the ready workspace", async ({ mount, page }) => {
  await routeTrpc(page, { "sessions.me": (): unknown => VIEWER });

  await mount(<SessionRecoveryBindFailureStory />);

  await expect(page.getByRole("status")).toHaveText("Couldn't load your workspace.");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("session-bind-state")).toHaveText("ready");
});

// ── THE NO-401 IDENTITY SWAP ───────────────────────────────────────────────────────────────────────
// The shared-browser case the belts structurally cannot see: another human signs in, the per-BROWSER
// cookie becomes theirs, and this warm tab's every request now SUCCEEDS as them. Nothing 401s, so no
// belt fires; without an identity compare on the visibility probe the tab would keep the previous
// human's chats/characters/drafts on screen and run every read and write as the new identity.
//
// `/api/auth/me` is the only identity the ladder can read pre-tRPC, so it is what the swap is scripted on.
async function stubSwappableAuth(page: Page): Promise<(handle: Handle) => void> {
  let handle: Handle = VIEWER.handle;
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "local" }) }));
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, handle, role: "owner" }) }),
  );
  await routeTrpc(page, { "sessions.me": (): unknown => VIEWER });
  return (next: Handle): void => {
    handle = next;
  };
}

// THE INSTRUMENT CONTROL, and it must run first: if the probe never fires (a headless tab reporting
// `hidden`, a floor that never elapses) the swap test below would pass for the wrong reason — "no
// navigation" is also what a dead sensor looks like. A confirmed probe resets the freshness clock, so
// `fresh` here is the sensor proving it is alive.
test("the visibility probe fires past the floor and re-confirms a session that is still ours", async ({ mount, page }) => {
  await stubSwappableAuth(page);

  await mount(<SessionSwapStory />);
  await expect(page.getByTestId("viewer-handle")).toHaveText(VIEWER.handle);

  await page.getByTestId("ct-wake-tab").click();

  await expect(page.getByTestId("freshness")).toHaveText("fresh");
});

test("a session that comes back as a DIFFERENT handle resets the tab instead of resuming it", async ({ mount, page }) => {
  const swapIdentity = await stubSwappableAuth(page);
  // The identity-boundary reset is a whole-document load of `/`. Aborted with `"aborted"` (net::ERR_ABORTED)
  // — the one error code chromium does NOT replace the document for; the default `"failed"` swaps in an
  // error page, which would make every later assertion pass vacuously on a torn-down tree. So the navigation
  // REQUEST is the observable, and the mounted tree survives to prove the rest.
  let resets = 0;
  await page.route(
    (url) => url.pathname === "/",
    (route) => {
      resets += 1;
      return route.abort("aborted");
    },
  );

  await mount(<SessionSwapStory />);
  await expect(page.getByTestId("viewer-handle")).toHaveText(VIEWER.handle);

  swapIdentity(castId<Handle>("intruder"));
  await page.getByTestId("ct-wake-tab").click();

  await expect.poll(() => resets).toBe(1);
  // …and the tab was never told its session was fine: a `fresh` here would mean the warm cache stayed put.
  await expect(page.getByTestId("freshness")).toHaveText("stale");
});

test("keeps the mounted recovery host through a terminal sessions.me 401 and opens local re-auth", async ({ mount, page }) => {
  let alive = true;
  await page.route("**/api/auth/logout", (route) => {
    alive = false;
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: alive, handle: alive ? VIEWER.handle : null, role: alive ? VIEWER.globalRole : null }),
    }),
  );
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "local" }) }));
  await routeTrpc(page, { "sessions.me": (): unknown => (alive ? VIEWER : trpcError({ code: "UNAUTHORIZED" })) });

  await mount(<SessionRecoveryReauthStory />);
  await page.getByTestId("ct-revoke-session").click();

  await expect(page.getByTestId("session-recovery-modal")).toHaveText("reauth");
});
