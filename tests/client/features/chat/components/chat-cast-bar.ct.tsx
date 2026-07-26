// CT: the group cast bar (chat-cast-bar.tsx, task #29). Drives the production path over the stubbed
// network (routeTrpc) — `chat.getChat` supplies the roster. Proves the D16 size-gate (a solo roster of
// ≤1 character renders NO bar) and the multi-member render (a chip per character; a muted member's chip
// is marked/dimmed). Read-only surface — no mutations here (those live in the Roster tab + composer).
//
// The roster stub returns only what the bar reads (`participants` with kind/characterId/displayName/
// disabled) — a partial `ChatDetail`, the same posture as chats-section.ct's stub.

import type { ParticipantRole } from "@orb/contracts/identity";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatCastBarStory } from "../_ct-stories";

/** A character seat — only the fields the cast bar reads; the rest is filler the bar ignores. */
function character(key: string, name: string, over: Record<string, unknown> = {}): unknown {
  return {
    id: `chat_participant_${key}`,
    kind: "character",
    userId: null,
    characterId: `character_${key}`,
    role: "member",
    displayName: name,
    disabled: false,
    talkativeness: 0.5,
    ...over,
  };
}

function roster(...members: unknown[]): unknown {
  return { participants: members };
}

/** A human seat — `role` seats a host/member; the bar's add-member gate is the separate server-resolved
 *  `viewerIsHost` field, NOT this seat's role (a member behind a host seat must not see the "+"). */
function human(role: ParticipantRole): unknown {
  return {
    id: `participant_${role}`,
    kind: "human",
    role,
    userId: `user_${role}`,
    characterId: null,
  };
}

/** A committed `ChatDetail` stub carrying the server-resolved host gate + a 2-character cast (so the bar
 *  renders past the D16 size-gate). A host FIRST human seat trips the retired first-seat proxy. */
function castWithHost(viewerIsHost: boolean): unknown {
  return {
    participants: [human("host"), human("member"), character("aria", "Aria"), character("bryn", "Bryn")],
    viewerIsHost,
  };
}

test("a solo roster (1 character) renders NO cast bar (the D16 size-gate)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": () => roster(character("aria", "Aria")) });
  const component = await mount(<ChatCastBarStory />);
  // Give the query a beat to settle, then assert the bar never appears.
  await expect(component.getByText("Aria")).toHaveCount(0);
  await expect(component.getByTestId("chat-cast-bar")).toHaveCount(0);
});

test("a 2+ roster renders a chip per character", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
  });
  const component = await mount(<ChatCastBarStory />);

  await expect(component.getByTestId("chat-cast-bar")).toBeVisible();
  await expect(component.getByText("Aria")).toBeVisible();
  await expect(component.getByText("Bryn")).toBeVisible();
});

test("a muted member's chip is marked (dimmed)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn", { disabled: true })),
  });
  const component = await mount(<ChatCastBarStory />);

  // Both chips render; exactly one carries the muted marker (Bryn).
  await expect(component.locator('[data-slot="cast-chip"]')).toHaveCount(2);
  await expect(component.locator('[data-slot="cast-chip"][data-muted]')).toHaveCount(1);
});

test("a member behind a host seat sees NO add-member '+' (server viewerIsHost wins over the seat)", async ({ mount, page }) => {
  // The FIRST human seat is a host, so the retired first-seat proxy would return TRUE and show the "+".
  // The server-resolved `viewerIsHost:false` says THIS viewer is a member — no add affordance.
  await routeTrpc(page, { "chat.getChat": () => castWithHost(false) });
  const component = await mount(<ChatCastBarStory />);

  // The bar rendered (2+ cast), but the host-only add-member trigger is absent.
  await expect(component.getByTestId("chat-cast-bar")).toBeVisible();
  await expect(component.getByRole("button", { name: "Add a character" })).toHaveCount(0);
});

test("a host sees the add-member '+'", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": () => castWithHost(true) });
  const component = await mount(<ChatCastBarStory />);

  await expect(component.getByRole("button", { name: "Add a character" })).toBeVisible();
});
