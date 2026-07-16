// CT: the `/` route (app-root) — the central navigation seam end-to-end. Drives the PRODUCTION
// composition: the four-region shell + the section registry, the active-chat store, and the
// character→chat seam. Asserts: the default chats section renders the LANDING surface (D62 P4 / J1 — the
// app never opens on an empty room); and picking a character in the library STARTS a chat with it — the
// library writes the shared stores (startNewChat + setActiveSection), the route (the sole reader) flips
// CONTENT to a seeded chat room. This is the §5.1 anti-jank seam proven without a real generation.
//
// tRPC is stubbed at the NETWORK (routeTrpc): `chat.listChats` (the docked LIST panel + the landing
// recents) + `character.list` (the library + the landing quick-picks) + `character.get` (a seeded draft
// previews each founding character's greeting as an editable row, J2/J3 — it reads the founding CARD, but
// never CANON `chat.listMessages`, since every chat reached here is a DRAFT with no server row).

import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../packages/client/src/lib/test-ids";
import { routeTrpc } from "../../support/ct/route-trpc";
import { makeCharacterSummary } from "../features/character/fixtures";
import { HomePageStory } from "./_ct-stories";

const ARIA = makeCharacterSummary({ id: "char_home_aria", name: "Aria Nightshade" });

/** The library page (`character.list` is keyset-paged: `{items, nextCursor}`). */
const ONE_CHARACTER = { items: [ARIA], nextCursor: null };
const NO_CHARACTERS = { items: [], nextCursor: null };

// A non-empty `persona.list` — the route mounts `<FirstRunPersonaDialog>` as an AppShell sibling,
// which forces a blocking, undismissable gate open whenever the viewer owns zero personas. These
// tests are about the home page's normal (has-persona) render, so a seeded persona keeps the gate
// closed and out of the way.
const PERSONAS = [{ id: "persona_home", name: "Alex", avatarHash: null, starred: true }];

test("the default chats section renders the landing surface, not an empty room (J1)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChats": [],
    "character.list": NO_CHARACTERS,
    "persona.list": PERSONAS,
  });
  const component = await mount(<HomePageStory />);

  // At rest = the landing hero, never a dead composer. An empty DB teaches the first step.
  await expect(component.getByText("Pick up a thread")).toBeVisible();
  await expect(component.getByRole("button", { name: "Create your first character" })).toBeVisible();
  // No chat room / composer is mounted at rest.
  await expect(page.getByTestId(testId("composer"))).toHaveCount(0);
});

test("picking a character in the library starts a chat with it (the library→chat seam)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChats": [],
    "character.list": ONE_CHARACTER,
    // The seeded draft reads Aria's card to preview her greeting as the opening row (J2/J3).
    "character.get": {
      id: "char_home_aria",
      name: "Aria Nightshade",
      greetings: ["The night market hums."],
    },
    "persona.list": PERSONAS,
  });

  const component = await mount(<HomePageStory />);

  // Go to the Characters section (exact — "Characters" is a substring of "Collapse Characters panel").
  await component.getByRole("button", { name: "Characters", exact: true }).click();
  // Scope to the library row's unique "Chat with X" CTA — the bare name "Aria Nightshade" is now
  // ambiguous (the landing surface stays mounted with a "Character quick-picks" row of the same name).
  await expect(page.getByRole("button", { name: "Chat with Aria Nightshade", exact: true })).toBeVisible();
  // On the Characters section the chat composer is NOT mounted (CONTENT is the library).
  await expect(page.getByTestId(testId("composer"))).toHaveCount(0);

  // Chat with Aria (the §4.4 dual-purpose CTA — "Chat with X", resume-or-new; renamed from "Start
  // chat with X" in the Wave 1 rework) → the store seam flips CONTENT back to a fresh, seeded room.
  await page.getByRole("button", { name: "Chat with Aria Nightshade", exact: true }).click();

  // The route (the sole store reader) navigated to the Chats section: the composer is back, on a fresh
  // draft seeded with Aria — character-first, her greeting rendered as the opening row (not an empty void),
  // ready for the first send to `startChat` with her.
  await expect(page.getByTestId(testId("composer"))).toBeVisible();
  await expect(page.getByText("The night market hums.")).toBeVisible();
});
