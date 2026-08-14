// CT: `useSessionRecovery` — the mount that arms the session machinery (staleness-and-session-freshness.md
// §4.4). A wiring hook has no pixels, and that is exactly why it needs a test: every failure mode here is
// SILENT. An un-bound durable-local namespace keeps writing the legacy `orb:<name>` key, so the next
// identity on this browser inherits the previous one's tag filters, drafts and view state — the reported
// repro, restored by omission.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { SessionRecoveryStory } from "./_ct-stories.tsx";

const VIEWER = { userId: "usr_ct_owner", handle: "owner", globalRole: "owner" };

test("binds the durable-local namespace to the viewer id off `sessions.me` (F1)", async ({ mount, page }) => {
  await routeTrpc(page, { "sessions.me": (): unknown => VIEWER });

  await mount(<SessionRecoveryStory />);

  // Before the identity read lands the namespace is legitimately unbound; the assertion is that it BECOMES
  // the viewer's id — which is what makes every `orb:*` key user-scoped for the rest of the page.
  await expect(page.getByTestId("durable-local-user")).toHaveText(VIEWER.userId);
});

test("mounts without suspending or navigating when the identity read is still in flight", async ({ mount, page }) => {
  // No `sessions.me` handler at all: the hook must tolerate `undefined` (it is a non-suspense read on
  // purpose — the shell must never block on identity) and simply stay unbound.
  await routeTrpc(page, {});

  await mount(<SessionRecoveryStory />);

  await expect(page.getByTestId("durable-local-user")).toBeVisible();
});
