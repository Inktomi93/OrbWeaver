// CT: the topbar chat-identity header LEAD (chat-header.tsx) — the members ENTRY. Drives the production
// path over the stubbed network (routeTrpc): `chat.getChat` supplies the roster the entry counts. The ⋯
// options menu (and its server-resolved host gate) moved to the COMPOSER — see composer-chat-options.ct.tsx.
//
// The members entry ALWAYS renders now (every chat has a roster — Context-Panel-Program CP-1 owner ruling
// 2026-07-25). It counts PRESENT participants (humans + cast, `leftSeq === null`); a departed seat is
// excluded. On a GROUP it opens the Members context tab (unchanged); on a SOLO chat it opens a compact
// roster popover — the present seats + a host-only "Add a character" that converts the solo chat to a group.

import type { ParticipantRole } from "@orb/contracts/identity";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatContextHeaderStory, ChatHeaderNarrowStory, ChatHeaderStory } from "../_ct-stories.tsx";
import { makeMessagesPage } from "../fixtures.ts";

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

// ── THE MEMBERS CHIP WAS A DEAD CONTROL BELOW 64rem (CONFIG-FIX lane finding) ──────────────────────
// `openMembersTab` used to write only `contextTab` + `panelMode("context","docked")` — never
// `openOverlayPanel`. `resolvePanelMode` downgrades a `docked` resolution to CLOSED (`collapsed`) at
// mobile/narrow-desktop widths unless a request NAMES the panel, so the chip's tap never opened
// anything to look at on a touch/narrow viewport. The fix routes through `revealContextPanel("members")`,
// the shared reveal intent that writes the overlay request unconditionally alongside the tab + dock.
test.describe("narrow/touch viewport", () => {
  test.use({ viewport: { width: 430, height: 900 }, hasTouch: true });

  test("tapping the Members chip reveals the CONTEXT overlay on the members tab (was dead <64rem)", async ({ mount, page }) => {
    await routeTrpc(page, {
      "chat.getChat": () => ({
        title: "Council of Two",
        participants: [human("host"), character("Aria"), character("Bolt")],
        viewerIsHost: true,
      }),
      "chat.listMessages": () => makeMessagesPage([]),
    });

    const component = await mount(<ChatHeaderNarrowStory />);
    const state = component.getByTestId("shell-state");
    await expect(state).toHaveText("contextTab=none openOverlayPanel=none");

    const chip = component.getByRole("button", { name: "Members — 3" });
    await chip.tap();

    // The overlay request now NAMES "context" — the write `resolvePanelMode` needs to reveal the sheet
    // below 64rem — alongside the members tab selection.
    await expect(state).toHaveText("contextTab=members openOverlayPanel=context");
  });
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

// ── THE DRAFT TOPBAR SAYS WHAT THE COMMITTED ONE SAYS (side-eye P2, 2026-08-06) ────────────────────
// A group draft was titled after `cast[0]` alone and carried no seat count: "Hana Mizushima" for a
// Hana + Kohaku room, with the second character discoverable only by scrolling to their greeting. §13
// one-home — the draft and the committed room were saying different things about one concept. The title
// now runs through the SAME `deriveChatTitle` the committed header uses, and the roster chip renders
// wherever a draft HAS a Members tab to open (`draftMembersTabJustified`, the predicate that tab's own
// `when` reads — so the chip can never be a door to a hidden tab).

// CP-1's header de-dup: the CONTEXT BAND no longer carries the chat's identity (the topbar owns it), so the
// band renders NEUTRAL chrome above the tab strip — never a second avatar+title cluster 300px away.
test("the CONTEXT band renders neutral chrome, never a second identity cluster", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": { title: "Test chat", participants: [], cast: [] },
  });

  const component = await mount(<ChatContextHeaderStory />);

  await expect(component.getByText("Test chat")).toHaveCount(0);
});
