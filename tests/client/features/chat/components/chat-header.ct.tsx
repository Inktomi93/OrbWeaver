// CT: the topbar chat-identity header LEAD (chat-header.tsx) — the member-count chip. Drives the production
// path over the stubbed network (routeTrpc): `chat.getChat` supplies the roster the chip counts. The ⋯
// options menu (and its server-resolved host gate) moved to the topbar TRAIL — see chat-options-topbar.ct.tsx.
//
// The chip counts PRESENT participants (humans + cast, `leftSeq === null`); a departed seat is excluded.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatHeaderStory } from "../_ct-stories";
import { makeMessagesPage } from "../fixtures";

/** A human seat — `role` seats a host/member (the roster shape). */
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

test("the member-count chip is a BUTTON counting PRESENT participants (\u00a7 6.1: Members \u2014 N)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => ({
      title: "Council of Two",
      participants: [
        human("host"),
        human("member"),
        // A DEPARTED human (leftSeq stamped) — must NOT count toward the Members population.
        {
          id: "participant_gone",
          kind: "human",
          role: "member",
          userId: "user_gone",
          characterId: null,
          leftSeq: 41,
        },
        // A character seat counts (the Members panel's own population is humans + cast).
        {
          id: "participant_aria",
          kind: "character",
          role: "member",
          userId: null,
          characterId: "character_aria",
          displayName: "Aria",
          avatarHash: null,
          leftSeq: null,
        },
      ],
      viewerIsHost: true,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
  });

  const component = await mount(<ChatHeaderStory />);

  // 2 present humans + 1 character = 3; the departed seat is excluded.
  const chip = component.getByRole("button", { name: "Members — 3" });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("3");
});
