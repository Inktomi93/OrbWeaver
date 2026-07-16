// CT: the topbar chat-identity header LEAD (chat-header.tsx) — the member-count chip. Drives the production
// path over the stubbed network (routeTrpc): `chat.getChat` supplies the roster the chip counts. The ⋯
// options menu (and its server-resolved host gate) moved to the topbar TRAIL — see chat-options-topbar.ct.tsx.
//
// The chip renders behind the SAME `membersTabJustified` predicate that gates the Members context tab
// (side-eye P1-1): on a roster the tab wouldn't exist for (a 1:1 chat), the chip must not render — it
// would open Context on the first-visible fallback tab, a mislabeled dead-end. When it renders it
// counts PRESENT participants (humans + cast, `leftSeq === null`); a departed seat is excluded.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatContextHeaderDraftStory, ChatHeaderStory } from "../_ct-stories";
import { makeMessagesPage } from "../fixtures";

const MEMBERS_CHIP_RE = /Members/;

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

/** A present character seat (the Cast population). */
function character(name: string): Record<string, unknown> {
  return {
    id: `participant_${name.toLowerCase()}`,
    kind: "character",
    role: "member",
    userId: null,
    characterId: `character_${name.toLowerCase()}`,
    displayName: name,
    avatarHash: null,
    leftSeq: null,
  };
}

test("a GROUP cast shows the chip counting PRESENT participants (\u00a7 6.1: Members \u2014 N)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => ({
      title: "Council of Two",
      participants: [
        human("host"),
        // A DEPARTED human (leftSeq stamped) — must NOT count toward the Members population.
        {
          id: "participant_gone",
          kind: "human",
          role: "member",
          userId: "user_gone",
          characterId: null,
          leftSeq: 41,
        },
        // ≥2 present characters justify the Members tab (castSectionVisible) — and so the chip.
        character("Aria"),
        character("Bolt"),
      ],
      viewerIsHost: true,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
  });

  const component = await mount(<ChatHeaderStory />);

  // 1 present human + 2 characters = 3; the departed seat is excluded.
  const chip = component.getByRole("button", { name: "Members — 3" });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("3");
});

test("a 1:1 roster renders NO chip — the Members tab wouldn't exist (the dead-end fix)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => ({
      title: "",
      participants: [human("host"), character("Aria")],
      viewerIsHost: true,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
  });

  const component = await mount(<ChatHeaderStory />);

  // The derived title proves the surface settled (P1-2: "" falls back to the cast names)…
  await expect(component.getByText("Aria")).toBeVisible();
  // …and the chip is absent: 1 human + 1 character justifies no Members tab, so no entry chip.
  await expect(component.getByRole("button", { name: MEMBERS_CHIP_RE })).toHaveCount(0);
});

// The CONTEXT-band identity (north-star §4 N4 / P4) — `ChatContextHeader` reuses the same identity cluster
// as the topbar LEAD, minus the members chip. Fed via the chats `defineContextTabs` `header` slot through
// the real `SectionContextHeader` band host. A DRAFT (empty cast, no network) names the new chat.
test("the context-band identity names the active chat (a draft ⇒ New chat, no members chip)", async ({ mount }) => {
  const component = await mount(<ChatContextHeaderDraftStory />);
  await expect(component.getByText("New chat")).toBeVisible();
  // The members chip is the topbar's (one home) — it must NOT appear in the context band.
  await expect(component.getByRole("button", { name: MEMBERS_CHIP_RE })).toHaveCount(0);
});
