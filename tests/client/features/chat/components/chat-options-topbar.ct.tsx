// CT: the active-chat options ⋯ as it renders at the END of the topbar TRAIL (chat-options-topbar.tsx).
// Drives the production path over the stubbed network (routeTrpc): `chat.getChat` supplies the roster + the
// server-resolved host gate (`viewerIsHost`). Asserts the host gate on the menu's host-only "Preview
// request…" item: a member sees NO host affordance, a host does.
//
// The host gate is the server-resolved, per-viewer `ChatDetail.viewerIsHost` — NOT the retired
// first-human-seat proxy, which mis-granted host UI to a non-host member once a 2nd human was seated. The
// member case seats a host FIRST to trip that old proxy and prove the server field wins.
//
// The trigger button is component-scoped; the menu POPUP renders through a Base UI Portal, so every
// menu-item assertion uses the PAGE locator (the chat-options-menu.ct.tsx precedent).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatOptionsTopbarStory } from "../_ct-stories";
import { makeMessagesPage } from "../fixtures";

/** A human seat — `role` seats a host/member (the roster shape). The host gate is the separate
 *  server-resolved `viewerIsHost` field, NOT this seat's role. */
function human(role: "host" | "member"): Record<string, unknown> {
  return {
    id: `participant_${role}`,
    kind: "human",
    role,
    userId: `user_${role}`,
    characterId: null,
    leftSeq: null,
  };
}

test("a member behind a host seat sees NO host affordance (server viewerIsHost wins over the seat)", async ({ mount, page }) => {
  await routeTrpc(page, {
    // The FIRST human seat is a host, so the retired first-seat proxy would return TRUE and mis-grant the
    // host-only Preview item. The server-resolved `viewerIsHost:false` says THIS viewer is a member.
    "chat.getChat": () => ({
      title: "Council of Two",
      participants: [human("host"), human("member")],
      viewerIsHost: false,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
  });

  const component = await mount(<ChatOptionsTopbarStory />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // The menu opened (a non-host item is present), but the host-only Preview jump is absent.
  await expect(page.getByRole("menuitem", { name: "Chat overrides…" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Preview request…" })).toHaveCount(0);
});

test("a host sees the host-only Preview affordance", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => ({
      title: "Council of Two",
      participants: [human("host"), human("member")],
      viewerIsHost: true,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
  });

  const component = await mount(<ChatOptionsTopbarStory />);
  await component.getByRole("button", { name: "Chat options" }).click();

  await expect(page.getByRole("menuitem", { name: "Preview request…" })).toBeVisible();
});
