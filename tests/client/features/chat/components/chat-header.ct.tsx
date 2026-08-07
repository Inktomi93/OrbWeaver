// CT: the topbar chat-identity header LEAD (chat-header.tsx) — the members ENTRY. Drives the production
// path over the stubbed network (routeTrpc): `chat.getChat` supplies the roster the entry counts. The ⋯
// options menu (and its server-resolved host gate) moved to the topbar TRAIL — see chat-options-topbar.ct.tsx.
//
// The members entry ALWAYS renders now (every chat has a roster — Context-Panel-Program CP-1 owner ruling
// 2026-07-25). It counts PRESENT participants (humans + cast, `leftSeq === null`); a departed seat is
// excluded. On a GROUP it opens the Members context tab (unchanged); on a SOLO chat it opens a compact
// roster popover — the present seats + a host-only "Add a character" that converts the solo chat to a group.

import type { ParticipantRole } from "@orb/contracts/identity";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatContextHeaderDraftStory, ChatHeaderStory, ChatsTopbarDraftStory } from "../_ct-stories.tsx";
import { makeMessagesPage } from "../fixtures.ts";

const MEMBERS_CHIP_RE = /Members/;

/** A human seat — `role` seats a host/member (the roster shape); `displayName` for the roster popover row. */
function human(role: ParticipantRole): Record<string, unknown> {
  return {
    id: `participant_${role}`,
    kind: "human",
    role,
    userId: `user_${role}`,
    characterId: null,
    displayName: role === "host" ? "Nate" : "Guest",
    avatarHash: null,
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
  // GROUP behavior is UNCHANGED: clicking routes to the Members context tab (setContextTab/setPanelMode),
  // NOT the solo roster popover. This story mounts only the topbar header (no context-tab strip), so the
  // proof at this scope is the ABSENCE of the solo popover — the group arm never renders it.
  await chip.click();
  await expect(page.getByTestId("solo-roster-menu")).toHaveCount(0);
});

test("a SOLO chat renders the members entry and opens a roster popover with Add a character (CP-1 ruling)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => ({
      title: "",
      participants: [human("host"), character("Aria")],
      viewerIsHost: true,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
    // The add-character picker lists the library minus the seated cast.
    "character.list": () => ({ items: [], nextCursor: null }),
  });

  const component = await mount(<ChatHeaderStory />);

  // The entry ALWAYS renders now — a solo chat counts 1 human + 1 character = 2.
  const entry = component.getByRole("button", { name: "Members — 2" });
  await expect(entry).toBeVisible();

  // It opens the SOLO roster popover (not the Members tab, which doesn't exist for a 1:1).
  await entry.click();
  const roster = page.getByTestId("solo-roster-menu");
  await expect(roster).toBeVisible();
  await expect(roster.getByText("Nate")).toBeVisible();
  await expect(roster.getByText("Aria")).toBeVisible();
  // The host-only add-character doorway that converts the solo chat to a group (reuses the add-member flow).
  await expect(roster.getByRole("button", { name: "Add a character" })).toBeVisible();
});

test("a SOLO chat's roster popover hides Add a character for a non-host viewer (§8.1 host-only omit)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => ({
      title: "",
      participants: [human("host"), character("Aria")],
      viewerIsHost: false,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
  });

  const component = await mount(<ChatHeaderStory />);
  await component.getByRole("button", { name: "Members — 2" }).click();
  const roster = page.getByTestId("solo-roster-menu");
  await expect(roster).toBeVisible();
  await expect(roster.getByRole("button", { name: "Add a character" })).toHaveCount(0);
});

// The CONTEXT band reduces to neutral chrome (Context-Panel-Program §1 Q3 / §0 IA de-dup): the chats def
// no longer supplies a `defineContextTabs` `header` slot, so the band host falls back to its neutral
// "Details" label instead of re-rendering the topbar's title/avatar cluster 300px away. `ChatContextHeader`
// stays in chat-header.tsx as the band-identity component CP-4's scene header will graft back here.
test("the context band reduces to neutral chrome — no duplicated chat identity (CP-1 Q3)", async ({ mount }) => {
  const component = await mount(<ChatContextHeaderDraftStory />);
  // The band shows the neutral fallback, NOT the draft's "New chat" identity (that now lives only on the topbar).
  await expect(component.getByText("Details")).toBeVisible();
  await expect(component.getByText("New chat")).toHaveCount(0);
  // The members chip is the topbar's (one home) — it must NOT appear in the context band.
  await expect(component.getByRole("button", { name: MEMBERS_CHIP_RE })).toHaveCount(0);
});

// ── THE DRAFT TOPBAR SAYS WHAT THE COMMITTED ONE SAYS (side-eye P2, 2026-08-06) ────────────────────
// A group draft was titled after `cast[0]` alone and carried no seat count: "Hana Mizushima" for a
// Hana + Kohaku room, with the second character discoverable only by scrolling to their greeting. §13
// one-home — the draft and the committed room were saying different things about one concept. The title
// now runs through the SAME `deriveChatTitle` the committed header uses, and the roster chip renders
// wherever a draft HAS a Members tab to open (`draftMembersTabJustified`, the predicate that tab's own
// `when` reads — so the chip can never be a door to a hidden tab).

const HANA = mintTypeId(ID_PREFIX.character);
const KOHAKU = mintTypeId(ID_PREFIX.character);

/** `character.get`, keyed by id — the founding-CARD read the draft identity resolves from. */
function routeDraftCards(page: Page): Promise<unknown> {
  return routeTrpc(page, {
    "character.get": (input: unknown): unknown => {
      const { characterId } = input as { readonly characterId: CharacterId };
      return characterId === KOHAKU
        ? { id: KOHAKU, name: "Kohaku", avatarHash: null, greetings: [] }
        : { id: HANA, name: "Hana Mizushima", avatarHash: null, greetings: [] };
    },
  });
}

test("a GROUP DRAFT names its WHOLE cast and carries the seat count (not just cast[0])", async ({ mount, page }) => {
  await routeDraftCards(page);

  const component = await mount(<ChatsTopbarDraftStory characterIds={[HANA, KOHAKU]} />);

  // The title names both — the committed room's own `deriveChatTitle` join, not the first name alone.
  await expect(component.getByText("Hana Mizushima, Kohaku")).toBeVisible();
  // The seat count is the viewer + the founding cast — the SAME arithmetic the committed room's
  // present-seat count produces for the room this draft becomes.
  await expect(component.getByRole("button", { name: MEMBERS_CHIP_RE })).toHaveAccessibleName("Members — 3");
  // And the avatars are a STACK, not one portrait (the committed group's cluster).
  //
  // "2 characters" is the CALLER's label winning, as it should: the `accname-survives-spread` gate landing
  // (`f954bbcf0`) moved `AvatarStack`'s generic "N people" default BEFORE its `{...rest}` spread, so a
  // caller-passed `aria-label` now beats the fallback. This assertion previously pinned the pre-fix
  // silently-overridden "2 people" and flipped the day the primitive was fixed — it now pins the CURE.
  await expect(component.locator('[data-slot="avatar-stack-root"]')).toHaveAccessibleName("2 characters");
  await expect(component.locator('[data-slot="avatar-stack-item"]')).toHaveCount(2);
});

test("a SOLO DRAFT keeps its single name and one portrait — the chip stays off its hidden Members tab", async ({ mount, page }) => {
  await routeDraftCards(page);

  const component = await mount(<ChatsTopbarDraftStory characterIds={[HANA]} />);

  await expect(component.getByText("Hana Mizushima")).toBeVisible();
  // Below the cast floor a draft has NO Members tab, so a chip here would open a tab the panel hides.
  await expect(component.getByRole("button", { name: MEMBERS_CHIP_RE })).toHaveCount(0);
  // One portrait, not a cluster — the solo shape, unchanged.
  await expect(component.locator('[data-slot="avatar-stack-root"]')).toHaveCount(0);
  await expect(component.locator('[data-slot="avatar-root"]')).toHaveCount(1);
});
