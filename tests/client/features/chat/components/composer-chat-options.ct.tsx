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

// ── THE GALLERY ROWS (owner ruling): a character's gallery row appears only for a character the viewer owns,
// because a gallery add is owner-only. The server names the owned seats (`viewerOwnedCharacterIds`).

function characterSeat(key: string, displayName: string): ParticipantFixture {
  return { id: `participant_${key}`, kind: "character", role: "member", userId: null, characterId: `character_ct_${key}`, displayName, leftSeq: null };
}

/** A group room of Aria and Kai, seen by a viewer who owns `owned`. */
function groupRoom(owned: readonly string[]): TrpcFixtureOutput<"chat.getChat"> {
  return {
    title: "Council of Two",
    participants: [human("host"), human("member"), characterSeat("aria", "Aria"), characterSeat("kai", "Kai")],
    viewerIsHost: true,
    viewerOwnedCharacterIds: owned.map((key) => `character_ct_${key}`),
  };
}

for (const viewport of [
  { name: "mobile", width: 360, height: 780 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`${viewport.name}: a guest who owns no character here has no gallery row in the ⋯ menu`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { "chat.getChat": () => groupRoom([]), "chat.listMessages": () => makeMessagesPage([]) });
    const component = await mount(<ComposerChatOptionsStory />);
    await component.getByRole("button", { name: "Chat options" }).click();

    // The menu is open and knows the roster: the roster-seeded item is there.
    await expect(page.getByRole("menuitem", { name: "New chat with the same characters" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Character galleries" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /gallery/u })).toHaveCount(0);
  });

  test(`${viewport.name}: in a mixed room the owner's ⋯ menu offers only the gallery they own`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { "chat.getChat": () => groupRoom(["aria"]), "chat.listMessages": () => makeMessagesPage([]) });
    const component = await mount(<ComposerChatOptionsStory />);
    await component.getByRole("button", { name: "Chat options" }).click();

    await expect(page.getByRole("menuitem", { name: "Aria's gallery" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Character galleries" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /Kai/u })).toHaveCount(0);
  });

  test(`${viewport.name}: an owner of both characters gets the galleries submenu with both`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { "chat.getChat": () => groupRoom(["aria", "kai"]), "chat.listMessages": () => makeMessagesPage([]) });
    const component = await mount(<ComposerChatOptionsStory />);
    await component.getByRole("button", { name: "Chat options" }).click();

    await page.getByRole("menuitem", { name: "Character galleries" }).click();
    await expect(page.getByRole("menuitem", { name: "Aria", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Kai", exact: true })).toBeVisible();
  });
}

test("the composer ⋯ menu is host-agnostic post-de-dup — a MEMBER sees the IDENTICAL panel-less set", async ({ mount, page }) => {
  // A member behind a host-first seat (the case the retired first-seat proxy would mis-grant host UI to) —
  // the menu has no host-gated item to leak, so it renders the same set as the host case above.
  await routeTrpc(page, { "chat.getChat": () => chatDetail(false), "chat.listMessages": () => makeMessagesPage([]) });
  const component = await mount(<ComposerChatOptionsStory />);
  await component.getByRole("button", { name: "Chat options" }).click();

  await expect(page.getByRole("menuitem", { name: "Close chat" })).toBeVisible();
  await Promise.all(PANEL_HOMED_ITEMS.map((label) => expect(page.getByRole("menuitem", { name: label })).toHaveCount(0)));
});
