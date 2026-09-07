// CT: the topbar chat-identity header LEAD (chat-header.tsx) — the members ENTRY. Drives the production
// path over the stubbed network (routeTrpc): `chat.getChat` supplies the roster the entry counts. The ⋯
// options menu (and its server-resolved host gate) moved to the COMPOSER — see composer-chat-options.ct.tsx.
//
// The members entry ALWAYS renders (every chat has a roster — Context-Panel-Program CP-1 owner ruling
// 2026-07-25) and it counts PRESENT participants (humans + cast, `leftSeq === null`); a departed seat is
// excluded. It ALWAYS opens the Members context tab: the solo-chat roster POPOVER this file used to pin was
// deleted with the Members tab's size gate (#162, owner-ruled 2026-08-18) — one roster surface, every room.

import type { ParticipantRole } from "@orb/contracts/identity";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { ChatContextHeaderStory, ChatHeaderNarrowStory, ChatHeaderStory } from "../_ct-stories.tsx";
import { makeMessagesPage } from "../fixtures.ts";

/** Any roster chip, whatever it counts — used to prove NO chip exists before the roster does. */
const ANY_MEMBERS_CHIP = /^Members — /u;

/** A human seat — `role` seats a host/member (the roster shape); `displayName` names the seat. */
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

test("a GROUP chat shows the chip counting PRESENT participants (\u00a7 6.1: Members \u2014 N)", async ({ mount, page }) => {
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

// ── THE PLACEHOLDER MAY NOT LIE (#216, side-eye home re-score 2026-08-18) ─────────────────────────
// This surface does not suspend, and its unresolved arm used to render the FALLBACK identity — so for
// ~480ms after Resume the topbar said "Untitled chat" beside a "Members — 0" chip for a room that has a
// name and a cast. The pending state is pinned as a SETTLED render (the read is HELD, never raced), then
// released so the same mount proves the real identity still lands.
test("while chat.getChat is unresolved the header shows a skeleton — never 'Untitled chat · 0 members'", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, {
    "chat.getChat": hold,
    "chat.listMessages": () => makeMessagesPage([]),
  });

  const component = await mount(<ChatHeaderStory />);
  await hold.requested;

  // THE DEFECT, asserted first and through what a user sees — this pair is what went red on the old
  // source (a rendered "Untitled chat" and a rendered "Members — 0"), not the new slot below it.
  await expect(component.getByText("Untitled chat")).toHaveCount(0);
  // A "0" seat count is the same lie in a smaller box — the chip waits for a roster to count.
  await expect(component.getByRole("button", { name: ANY_MEMBERS_CHIP })).toHaveCount(0);
  await expect(component.locator('[data-slot="chat-header-pending"]')).toBeVisible();

  hold.release({
    title: "Council of Two",
    participants: [human("host"), character("Aria")],
    viewerIsHost: true,
  });

  await expect(component.getByRole("button", { name: "Members — 2" })).toBeVisible();
  await expect(component.locator('[data-slot="chat-header-pending"]')).toHaveCount(0);
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

// SUPERSEDED (#162, owner-ruled 2026-08-18). These two cases used to assert a SOLO-chat `solo-roster-menu`
// popover with its own "Add a character" — a SECOND roster surface that existed only because the Members tab
// was size-gated out of 1:1 rooms. That gate is gone (`lib/roster.ts::membersTabJustified`), the tab is the
// one roster home in every room state, and the popover was deleted with it. What the chip owes now is the
// same thing in every room: the present-seat count, and a door to the one roster surface.
test("the members chip counts every PRESENT seat and opens the Members tab — in a solo room too", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => ({
      title: "",
      participants: [human("host"), character("Aria")],
      viewerIsHost: true,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
  });

  const component = await mount(<ChatHeaderNarrowStory />);

  // 1 human + 1 character = 2.
  const entry = component.getByRole("button", { name: "Members — 2" });
  await expect(entry).toBeVisible();

  await entry.click();
  await expect(component.getByTestId("shell-state")).toHaveText("contextTab=members openOverlayPanel=context");
});

test("a NON-host gets the same chip and the same one door (no host-forked topbar roster)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => ({
      title: "",
      participants: [human("host"), character("Aria")],
      viewerIsHost: false,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
  });

  const component = await mount(<ChatHeaderNarrowStory />);
  await component.getByRole("button", { name: "Members — 2" }).click();

  await expect(component.getByTestId("shell-state")).toHaveText("contextTab=members openOverlayPanel=context");
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
    "chat.getChat": { title: "Test chat", participants: [], identities: [] },
  });

  const component = await mount(<ChatContextHeaderStory />);

  await expect(component.getByText("Test chat")).toHaveCount(0);
});

// #239 — THE TRUNCATED ROOM TITLE'S FULL-VALUE AFFORDANCE. At `list:docked, context:docked` the topbar
// identity title measured clientWidth 141 for scrollWidth 226 (an 85px truncation) with `title` NULL: it
// ellipsizes correctly, but the full name had NO home in the CONTENT region — the list pane's copy is the
// only other one, and it disappears the moment the list is collapsed. The affordance is the native
// tooltip, carrying EXACTLY the visible string (never a re-worded label).
test("#239: the room title carries its full value as a title attribute", async ({ mount, page }) => {
  const longTitle = "Example — The Rust Lecture, and What Came After";
  await routeTrpc(page, {
    "chat.getChat": () => ({ title: longTitle, participants: [human("host"), character("Birdie")] }),
    "chat.listMessages": () => makeMessagesPage([]),
  });
  const cmp = await mount(<ChatHeaderStory />);
  const heading = cmp.locator('[data-slot="text"]', { hasText: longTitle }).first();
  await expect(heading).toHaveAttribute("title", longTitle);
  // The tooltip is the SAME string the eye sees — a re-worded one would be a second, disagreeing home.
  await expect.poll(async () => (await heading.textContent())?.trim()).toBe(longTitle);
});
