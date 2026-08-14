// CT: the `/` route (app-root) — the central navigation seam end-to-end. Drives the PRODUCTION
// composition: the four-region shell + the section registry, the active-chat store, and the
// character→chat seam. Asserts: the default chats section renders the LANDING surface (D62 P4 / J1 — the
// app never opens on an empty room); and picking a character in the library STARTS a chat with it — the
// library writes the shared stores (startNewChat + setActiveSection), the route (the sole reader) flips
// CONTENT to a seeded chat room. This is the §5.1 anti-jank seam proven without a real generation.
//
// tRPC is stubbed at the NETWORK (routeTrpc): `chat.listChats` (the docked LIST panel + the landing
// recents) + `databank.list` (home's databank tile — an EMPTY bank, so the front door renders that tile's
// teaching state rather than an error card) + `character.list` (the library + the landing quick-picks) +
// `character.get` (a seeded draft
// previews each founding character's greeting as an editable row, J2/J3 — it reads the founding CARD, but
// never CANON `chat.listMessages`, since every chat reached here is a DRAFT with no server row).

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../packages/client/src/lib/test-ids.ts";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { makeCharacterSummary } from "../features/character/fixtures.ts";
import { chatListResponder } from "../features/chat/fixtures.ts";
import { HomePageStory } from "./_ct-stories.tsx";

const ARIA = makeCharacterSummary({ id: "char_home_aria", name: "Aria Nightshade" });
// Spans BOTH vocabularies — desktop names the frame region, the phone names the screen a tap lands on
// (side-eye 2026-08-07 finding 4). A desktop-only matcher would make the `toHaveCount(0)` below pass for
// the wrong reason the day this assertion is driven at a phone width.
const LIST_TOGGLE_RE = /^(?:(?:Show|Hide) list panel|Show .+ (?:list|overview))$/u;
/** Any close/dismiss affordance — the forced first-run gate must offer NONE. */
const CLOSE_AFFORDANCE_RE = /close/iu;

/** The library page (`character.list` is keyset-paged: `{items, nextCursor}`). */
const ONE_CHARACTER = { items: [ARIA], nextCursor: null };
const NO_CHARACTERS = { items: [], nextCursor: null };

// A non-empty `persona.list` — the route mounts `<FirstRunPersonaDialog>` as an AppShell sibling,
// which forces a blocking, undismissable gate open whenever the viewer owns zero personas. These
// tests are about the home page's normal (has-persona) render, so a seeded persona keeps the gate
// closed and out of the way.
const PERSONAS = [{ id: "persona_home", name: "Alex", description: "", avatarHash: null, starred: true }];

// The seeded draft's greeting row resolves `{{user}}` against the anchor the commit WILL write, so it
// reads the same two identity sources the server's seed chain does: the viewer's persona connections for
// this character (none here) and the `seeds.*` pointers off the settings blob.
/** Home's databank tile reads the bank CENSUS beside its rows (`databank.bankHealth`, 2026-08-14) — an
 *  EMPTY bank here, matching the empty `databank.list` above it, so the front door renders that tile's
 *  teaching state. Both routes or neither: an unstubbed suspending read blanks the tile into its boundary. */
const EMPTY_BANK_HEALTH = { byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 0, stalled: 0 }, chunks: 0, passages: 0, total: 0 };

const IDENTITY_STUB = {
  "persona.listConnectedToCharacter": (): readonly never[] => [],
  "settings.getUserSettings": (): { userId: UserId; schemaVersion: number; config: unknown; updatedAt: number } => ({
    userId: castId<UserId>("user_ct"),
    schemaVersion: 1,
    config: DEFAULT_USER_SETTINGS,
    updatedAt: 0,
  }),
};

// ── THE CREATED ROOM (chat-creation-draft-mode-replacement.md §4.1, R1) ────────────────────────────
// Every launcher below now fires the REAL `chat.startChat` and lands in the REAL room, so each of these
// journeys needs the room's own reads stubbed: the response row (which `useStartChat` also SEEDS into
// `getChat`), that same row on the read, the seeded greeting as REAL CANON, and the divider's fit preview
// (an unlisted-proc `null` is out-of-contract there and crashes the transcript).
const CREATED_CHAT_ID = "chat_home_created";

function createdChat(temporary: boolean): Record<string, unknown> {
  return {
    id: CREATED_CHAT_ID,
    title: null,
    participants: [],
    anchorPersonaId: null,
    cast: [],
    group: DEFAULT_GROUP_CONFIG,
    temporary,
    viewerIsHost: true,
    roomOverrides: {},
    background: null,
    rpg: null,
  };
}

const PREVIEW_FIT_STUB = {
  boundaryMessageId: null,
  usedTokens: 0,
  ceilingTokens: 32_768,
  ceilingEstimated: false,
  reserveOutputTokens: 2048,
  droppedCount: 0,
  compactSummary: null,
};

function createdRoomRoutes(temporary: boolean, canon: readonly unknown[] = []): Record<string, unknown> {
  const chat = createdChat(temporary);
  return {
    "chat.startChat": { chat, opening: null, openingFailure: null },
    "chat.getChat": chat,
    "chat.listMessages": { messages: canon, cast: [] },
    "chat.previewContextFit": PREVIEW_FIT_STUB,
  };
}

test("fresh state lands on HOME — the launcher, never an empty room (D62 P4 via owner decision H1 = D-1)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": NO_CHARACTERS,
    "persona.list": PERSONAS,
  });
  const component = await mount(<HomePageStory />);

  // The BORN default is the home section — its rail affordance (the brand glyph) reads current…
  await expect(component.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
  // …and its CONTENT is the door-assembled tile grid, not a hero bolted inside chats.
  await expect(component.locator('[data-home-tile="chat.recents"]')).toBeVisible();
  await expect(component.locator('[data-home-tile="chat.quickPicks"]')).toBeVisible();
  await expect(component.locator('[data-home-tile="home.jump"]')).toBeVisible();
  // …including the tile a FEATURE raised (databank, D-7) — the door-assembled seam, proven at the real
  // composition root and not just in a hand-built registry.
  await expect(component.locator('[data-home-tile="databank.documents"]')).toBeVisible();
  // An empty DB still teaches the first step, per tile.
  await expect(component.getByRole("button", { name: "Create your first character" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Add your first document" })).toBeVisible();
  // Home declares no LIST pane, so no toggle offers one.
  await expect(component.getByRole("button", { name: LIST_TOGGLE_RE })).toHaveCount(0);
  // No chat room / composer is mounted at rest.
  await expect(page.getByTestId(testId("composer"))).toHaveCount(0);
});

test("the chats section's own no-selection state is the SLIM one — the launcher lives in exactly one place", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": NO_CHARACTERS,
    "persona.list": PERSONAS,
  });
  const component = await mount(<HomePageStory />);

  // Scoped to the RAIL: home's jump tile also carries a row named "Chats" (that IS the point of it).
  await component.locator(".shell-rail").getByRole("button", { name: "Chats", exact: true }).click();

  await expect(component.getByText("No chat selected")).toBeVisible();
  await expect(component.getByRole("button", { name: "Start a new chat" })).toBeVisible();
  await expect(page.getByTestId(testId("composer"))).toHaveCount(0);
});

test("picking a character in the library CREATES the chat and lands in it (the library→chat seam)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": ONE_CHARACTER,
    "character.get": {
      id: "char_home_aria",
      name: "Aria Nightshade",
      greetings: ["The night market hums."],
    },
    "persona.list": PERSONAS,
    ...IDENTITY_STUB,
    // Her greeting arrives as REAL CANON — `startChat` seeded it server-side, so the room reads it back
    // instead of the client fabricating a preview row.
    ...createdRoomRoutes(false, [
      {
        id: "msg_home_greeting",
        chatId: CREATED_CHAT_ID,
        seq: 1,
        role: "assistant",
        kind: "standard",
        content: "The night market hums.",
        toolCalls: [],
        authorUserId: null,
        characterId: "char_home_aria",
        personaId: null,
        excludedFromPrompt: false,
        createdAt: 0,
        editedAt: null,
        selectedVariantId: "mv_home_greeting",
        selectedVariantIdx: 0,
        variantCount: 1,
        hasContinuation: false,
        reasoning: null,
        model: null,
        provider: null,
        finishReason: null,
        stopReason: null,
        terminalReason: null,
        tokensIn: null,
        tokensOut: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        contextWindow: null,
        costUsd: null,
        ttftMs: null,
        genStartedAt: null,
        genFinishedAt: null,
        generationId: null,
        contextBoundaryMessageId: null,
      },
    ]),
  });

  const component = await mount(<HomePageStory />);

  // Go to the Characters section, scoped to the RAIL (exact — "Characters" is a substring of "Collapse
  // Characters panel", and home's jump tile also carries a row of that name).
  await component.locator(".shell-rail").getByRole("button", { name: "Characters", exact: true }).click();
  // Scope to the library row's unique "Chat with X" CTA — the bare name "Aria Nightshade" is now
  // ambiguous (home stays mounted with a quick-picks tile row of the same name).
  await expect(page.getByRole("button", { name: "Chat with Aria Nightshade", exact: true })).toBeVisible();
  // On the Characters section the chat composer is NOT mounted (CONTENT is the library).
  await expect(page.getByTestId(testId("composer"))).toHaveCount(0);

  // Chat with Aria (the §4.4 dual-purpose CTA — "Chat with X", resume-or-new; renamed from "Start
  // chat with X" in the Wave 1 rework) → the store seam flips CONTENT back to a fresh, seeded room.
  await page.getByRole("button", { name: "Chat with Aria Nightshade", exact: true }).click();

  // The route (the sole store reader) navigated to the Chats section, into a REAL room: the composer is
  // back, and Aria's greeting is canon read off the row `startChat` just created — character-first from the
  // first frame, with nothing left to commit.
  await expect(page.getByTestId(testId("composer"))).toBeVisible();
  await expect(page.getByText("The night market hums.")).toBeVisible();
  await expect.poll(() => trpc.count("chat.startChat"), { intervals: [20, 50, 100] }).toBe(1);
});

// ── The TEMP-CHAT creation ceremony + the rail round-trip (side-eye F9 + the data-loss it flagged) ──
// ONE ceremony: the home temp tile opens the SAME character picker every other "New chat" opens, with the
// creation-only flag preset. And the draft it starts SURVIVES a rail round-trip — the active-chat pointer
// is module state and CONTENT is <Activity>-kept, so leaving the section must never drop an unsent room.

test("the temp tile starts its room through the SHARED picker, and the unsent line survives a rail round-trip", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": NO_CHARACTERS,
    "persona.list": PERSONAS,
    "chat.reapTemporaryChats": { reaped: 0 },
    ...IDENTITY_STUB,
    ...createdRoomRoutes(true),
  });
  const component = await mount(<HomePageStory />);

  // The tile no longer mints a seed of its own — it opens the ONE picker, which states the preset.
  await component.getByRole("button", { name: "Start a temp chat" }).click();
  const picker = page.getByRole("dialog");
  await expect(picker.getByText("This room won't join your chats list, and you can't switch it later.")).toBeVisible();

  await picker.getByText("Blank chat").click();

  // The picker carried its pre-armed parameter into the real `startChat`: a REAL room on the chats section,
  // born Temporary — and it says so from its first frame, off the row rather than off a client seed.
  await expect(page.getByTestId(testId("composer"))).toBeVisible();
  await expect(page.locator(".shell-topbar").getByText("Temporary")).toBeVisible();

  // Type an unsent line — the thing an accidental discard would actually cost the user.
  const composerInput = page.getByTestId(testId("composer")).getByRole("textbox");
  await composerInput.fill("a line I have not sent yet");

  // Rail round-trip: home and back. The room must still be active — losing it here discards what the user
  // typed and lands them on "No chat selected". (Nav to HOME is not nav away from the ROOM: the active-chat
  // pointer is untouched, so no husk reap fires either.)
  await page.locator(".shell-rail").getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator('[data-home-tile="chat.tempChat"]')).toBeVisible();
  await page.locator(".shell-rail").getByRole("button", { name: "Chats", exact: true }).click();

  await expect(page.getByText("No chat selected")).toHaveCount(0);
  await expect(page.getByTestId(testId("composer"))).toBeVisible();
  await expect(page.locator(".shell-topbar").getByText("Temporary")).toBeVisible();
  // …and the composer draft came back with it — keyed by the room's real ChatId, which nothing re-mints.
  await expect(composerInput).toHaveValue("a line I have not sent yet");
});
// ── THE FORCED FIRST-RUN PERSONA ASK (owner ruling 2026-08-03; D107's zero-personas trigger) ──
// The server half (the seeder's auto-create arm is now automation-only, so a REAL first sign-in leaves the
// library empty) is pinned at tests/server/entry/compose/assets-character.int.test.ts. THIS is the half the
// user meets: with zero personas the gate opens, blocks the app, and offers exactly one way out — creating
// the persona. Every other test in this file seeds `PERSONAS` precisely to keep it shut.

test("zero personas: the first-run persona ask is FORCED open — no dismiss, one way out", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": NO_CHARACTERS,
    "persona.list": [],
  });
  await mount(<HomePageStory />);

  const gate = page.getByTestId(testId("firstRunPersonaDialog"));
  await expect(gate).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who are you in the story?" })).toBeVisible();

  // FORCED: no close affordance, and Escape does not dismiss it (onOpenChange is inert by design).
  await expect(gate.getByRole("button", { name: CLOSE_AFFORDANCE_RE })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(gate).toBeVisible();

  // The one way out is disabled until the persona has a NAME (the only required field).
  const create = page.getByTestId(testId("firstRunPersonaCreate"));
  await expect(create).toBeDisabled();
  await page.getByTestId(testId("firstRunPersonaName")).fill("Sarah");
  await expect(create).toBeEnabled();
});

test("a user who owns a persona never sees the gate (the automation-seeded + returning-user arm)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": NO_CHARACTERS,
    "persona.list": PERSONAS,
  });
  await mount(<HomePageStory />);

  // The home surface renders unblocked — this is what a harness boot and every later sign-in look like.
  await expect(page.locator('[data-home-tile="chat.recents"]')).toBeVisible();
  await expect(page.getByTestId(testId("firstRunPersonaDialog"))).toHaveCount(0);
});
