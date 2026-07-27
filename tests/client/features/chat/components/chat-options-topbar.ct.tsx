// CT: the active-chat options ⋯ as it renders at the END of the topbar TRAIL (chat-options-topbar.tsx).
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
// TOPBAR menu is host-agnostic post-de-dup and renders the same set either way.
//
// The trigger button is component-scoped; the menu POPUP renders through a Base UI Portal, so every
// menu-item assertion uses the PAGE locator (the chat-options-menu.ct.tsx precedent).

import type { ParticipantRole } from "@orb/contracts/identity";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatOptionsTopbarStory } from "../_ct-stories";
import { makeMessagesPage } from "../fixtures";

/** A human seat — `role` seats a host/member (the roster shape). The host gate is the separate
 *  server-resolved `viewerIsHost` field, NOT this seat's role. */
function human(role: ParticipantRole): Record<string, unknown> {
  return { id: `participant_${role}`, kind: "human", role, userId: `user_${role}`, characterId: null, leftSeq: null };
}

function chatDetail(viewerIsHost: boolean): unknown {
  return { title: "Council of Two", participants: [human("host"), human("member")], viewerIsHost };
}

// The panel-homed options that must NEVER reappear in the topbar ⋯ menu (the de-dup regression guard).
const PANEL_HOMED_ITEMS = ["Chat settings…", "Preview request…", "Injections…", "Invite people…", "Hand off host…", "Leave chat"];

test("the topbar ⋯ menu carries NONE of the panel-homed options (IA de-dup) — for a HOST", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": () => chatDetail(true), "chat.listMessages": () => makeMessagesPage([]) });
  const component = await mount(<ChatOptionsTopbarStory />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // The menu opened (a panel-less item is present) but every panel-homed option is absent.
  await expect(page.getByRole("menuitem", { name: "Continue" })).toBeVisible();
  await Promise.all(PANEL_HOMED_ITEMS.map((label) => expect(page.getByRole("menuitem", { name: label })).toHaveCount(0)));
});

test("the topbar ⋯ menu is host-agnostic post-de-dup — a MEMBER sees the IDENTICAL panel-less set", async ({ mount, page }) => {
  // A member behind a host-first seat (the case the retired first-seat proxy would mis-grant host UI to) —
  // the menu has no host-gated item to leak, so it renders the same set as the host case above.
  await routeTrpc(page, { "chat.getChat": () => chatDetail(false), "chat.listMessages": () => makeMessagesPage([]) });
  const component = await mount(<ChatOptionsTopbarStory />);
  await component.getByRole("button", { name: "Chat options" }).click();

  await expect(page.getByRole("menuitem", { name: "Continue" })).toBeVisible();
  await Promise.all(PANEL_HOMED_ITEMS.map((label) => expect(page.getByRole("menuitem", { name: label })).toHaveCount(0)));
});
