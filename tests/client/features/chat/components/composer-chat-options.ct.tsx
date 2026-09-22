// CT: the active-chat options ⋯ at its ONE home — the composer's LEFT gutter (composer-chat-options.tsx,
// D111's drawn control map, owner ruling 2026-08-09; the topbar TRAIL widget was removed with the move).
// Drives the production path over the stubbed network (routeTrpc): `chat.getChat` supplies the roster.
//
// IA de-dup (owner rule, W3c): every option that has a CONTEXT-PANEL home is GONE from the ⋯ menu —
// Chat settings (Settings tab), Preview request (Preview tab), Injections (Injections tab), and Invite /
// Hand off host / Leave (all in the Members tab). The menu therefore carries NO host-gated affordance
// anymore: it renders the IDENTICAL item set to a host and a member (the host gate moved WITH the
// affordances to the panel). The former host-gate assertion here (host-only "Preview request…", and the
// server-`viewerIsHost`-wins-over-first-seat-proxy probe that used it) is now covered where the affordance
// lives — `chats-section.ct.tsx` ("member loses the Preview tab" + "migrated tabs obey the server host
// field, NOT the first-seat proxy (member behind a host seat sees no host UI)"). This CT now pins that the
// menu is host-agnostic post-de-dup and renders the same set either way.
//
// WHERE it mounts is proven separately, in composer.ct.tsx: the ⋯ is IN the composer and NOT in the topbar.
//
// The trigger button is component-scoped; the menu POPUP renders through a Base UI Portal, so every
// menu-item assertion uses the PAGE locator (the chat-options-menu.ct.tsx precedent).

import type { ParticipantRole } from "@orb/contracts/identity";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcFixtureOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ComposerChatOptionsStory } from "../_ct-stories.tsx";
import { makeMessagesPage } from "../fixtures.ts";

/** A human seat — `role` seats a host/member (the roster shape). The host gate is the separate
 *  server-resolved `viewerIsHost` field, NOT this seat's role. */
type ParticipantFixture = NonNullable<TrpcFixtureOutput<"chat.getChat">["participants"]>[number];

function human(role: ParticipantRole): ParticipantFixture {
  return { id: `participant_${role}`, kind: "human", role, userId: `user_${role}`, characterId: null, leftSeq: null };
}

function chatDetail(viewerIsHost: boolean): TrpcFixtureOutput<"chat.getChat"> {
  return { title: "Council of Two", participants: [human("host"), human("member")], viewerIsHost };
}

// The panel-homed options that must NEVER reappear in the ⋯ menu (the de-dup regression guard).
const PANEL_HOMED_ITEMS = ["Chat settings…", "Preview request…", "Injections…", "Invite people…", "Hand off host…", "Leave chat"];

test("the composer ⋯ menu carries NONE of the panel-homed options (IA de-dup) — for a HOST", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": () => chatDetail(true), "chat.listMessages": () => makeMessagesPage([]) });
  const component = await mount(<ComposerChatOptionsStory />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // The menu opened (a panel-less item is present) but every panel-homed option is absent. "Close chat"
  // is the sentinel: a canon-less, host-agnostic item that has NO panel/wand home, so it legitimately
  // stays in the ⋯ menu post-consolidation (#41 moved the turn actions to the composer wand; W3c moved the
  // panel-homed items to their tabs).
  await expect(page.getByRole("menuitem", { name: "Close chat" })).toBeVisible();
  await Promise.all(PANEL_HOMED_ITEMS.map((label) => expect(page.getByRole("menuitem", { name: label })).toHaveCount(0)));
});

test("the composer ⋯ menu is host-agnostic post-de-dup — a MEMBER sees the IDENTICAL panel-less set", async ({ mount, page }) => {
  // A member behind a host-first seat (the case the retired first-seat proxy would mis-grant host UI to) —
  // the menu has no host-gated item to leak, so it renders the same set as the host case above.
  await routeTrpc(page, { "chat.getChat": () => chatDetail(false), "chat.listMessages": () => makeMessagesPage([]) });
  const component = await mount(<ComposerChatOptionsStory />);
  await component.getByRole("button", { name: "Chat options" }).click();

  await expect(page.getByRole("menuitem", { name: "Close chat" })).toBeVisible();
  await Promise.all(PANEL_HOMED_ITEMS.map((label) => expect(page.getByRole("menuitem", { name: label })).toHaveCount(0)));
});
