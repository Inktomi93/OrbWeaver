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
//
// THIS FILE IS THE REAL-REGISTRY OBSERVER (#1677). It mounts the PRODUCTION section registry, so it — not
// the shell CT — is where SECTION-TITLE COMPOSITION is provable: the narrow topbar's screen name, the
// phone's library census, and any per-section `useSelectionTitle` composed from real list data.
// `tests/client/features/app-shell/surfaces/app-shell.ct.tsx` mounts through `CtFakeSectionRegistry`, whose
// story-injected `list`/`content`/`header` bodies and stand-in mobile titles make that class of defect
// structurally invisible there (its header states the same split). Shell CHROME — regions, panel clamp,
// focus modes, rail, modal host, tab bar — stays that file's floor and is not re-pinned here.

import { chatWithActionName } from "@orb/client/lib";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { testId } from "../../../packages/client/src/lib/test-ids.ts";
import type { TrpcFixtureOutput, TrpcRoutes, TrpcWireOutput } from "../../support/node/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../support/node/route-trpc.ts";
import { STREAM_MUTATION_ROUTES } from "../data/bus/fixtures.ts";
import { makeCharacterSummary } from "../features/character/fixtures.ts";
import { CHAT_AMBIENT_ROUTES, chatListResponder, makeChatSummary } from "../features/chat/fixtures.ts";
import { HomePageStory } from "./_ct-stories.tsx";

const ARIA = makeCharacterSummary({ id: "char_home_aria", name: "Aria Nightshade" });
// Spans BOTH vocabularies — desktop names the frame region, the phone names the screen a tap lands on
// (side-eye 2026-08-07 finding 4). A desktop-only matcher would make the `toHaveCount(0)` below pass for
// the wrong reason the day this assertion is driven at a phone width.
const LIST_TOGGLE_RE = /^(?:(?:Show|Hide) list panel|Show .+ (?:list|overview))$/u;
/** Any close/dismiss affordance — the forced first-run gate must offer NONE. */
const CLOSE_AFFORDANCE_RE = /close/iu;

/** The library page (`character.list` is keyset-paged: `{items, nextCursor}`). */
const ONE_CHARACTER = { items: [ARIA], nextCursor: null, totalCount: 1 } satisfies TrpcFixtureOutput<"character.list">;
const NO_CHARACTERS = { items: [], nextCursor: null, totalCount: 0 } satisfies TrpcFixtureOutput<"character.list">;

// A non-empty `persona.list` — the route mounts `<FirstRunPersonaDialog>` as an AppShell sibling, which
// forces a blocking, undismissable gate open over a viewer who cannot SPEAK yet. These tests are about the
// home page's normal (settled-identity) render, so this viewer must be one the gate stands down for.
//
// OWNING A PERSONA IS NOT ENOUGH (#1570, 418d40c7f): the trigger is derived from the SEED POINTERS, not
// from the row count — a persona that no `seeds.currentPersonaId`/`defaultPersonaId` names is the ORPHAN
// the gate now offers to recover, so a row plus the DEFAULT (all-null) seeds is precisely the state that
// opens it. {@link SEEDED_SETTINGS_ROUTE} points both pointers at this row; the two must always move together.
const HOME_PERSONA = { id: "persona_home", name: "Alex", description: "", avatarHash: null, starred: true };
const PERSONAS = [HOME_PERSONA] satisfies TrpcFixtureOutput<"persona.list">;

// The seeded draft's greeting row resolves `{{user}}` against the anchor the commit WILL write, so it
// reads the same two identity sources the server's seed chain does: the viewer's persona connections for
// this character (none here) and the `seeds.*` pointers off the settings blob.
/** Home's databank tile reads the bank CENSUS beside its rows (`databank.bankHealth`, 2026-08-14) — an
 *  EMPTY bank here, matching the empty `databank.list` above it, so the front door renders that tile's
 *  teaching state. Both routes or neither: an unstubbed suspending read blanks the tile into its boundary. */
const EMPTY_BANK_HEALTH = {
  byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 0, stalled: 0 },
  chunks: 0,
  passages: 0,
  total: 0,
} satisfies TrpcWireOutput<"databank.bankHealth">;

const ARIA_CARD = {
  id: "char_home_aria",
  name: "Aria Nightshade",
  greetings: [{ text: "The night market hums." }],
} satisfies TrpcFixtureOutput<"character.get">;

/**
 * The viewer's settings with BOTH persona seed pointers naming {@link HOME_PERSONA} — the state of an
 * ordinary returning reader, and the one the first-run gate stands down for (#1570). `DEFAULT_USER_SETTINGS`
 * seeds them NULL, which since 418d40c7f is the ORPHAN state the gate opens over to recover, so every mount
 * in this file that means "a viewer who is set up" must say so with the pointers, not with the row alone.
 */
const SEEDED_SETTINGS_ROUTE: TrpcRoutes<"settings.getUserSettings"> = {
  "settings.getUserSettings": {
    userId: castId<UserId>("user_ct"),
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: HOME_PERSONA.id, defaultPersonaId: HOME_PERSONA.id } },
    updatedAt: 0,
    configUnreadable: null,
  },
};

/**
 * The route's own AMBIENT reads (#649) — every `HomePageStory` mount is the composition root, so it always
 * carries the composer's send-gate + display-script tier ({@link CHAT_AMBIENT_ROUTES}), the room bus's
 * attach/detach mutations ({@link STREAM_MUTATION_ROUTES}), and the viewer identity read the settings-pane
 * nav resolves off (`sessions.me`). None of these are any ONE test's subject, but leaving them unfed ran
 * every one of those pipelines INERT across this whole file. Spread FIRST in each `routeTrpc` call so a
 * test's own per-fixture value (the zero-persona gate test's unseeded `settings.getUserSettings`, say) wins.
 */
const HOME_AMBIENT_ROUTES: TrpcRoutes<"sessions.me" | "chat.reapTemporaryChats" | "notifications.list"> = {
  ...CHAT_AMBIENT_ROUTES,
  ...STREAM_MUTATION_ROUTES,
  // The viewer's own settings, OVERRIDING the all-null-seeds default {@link CHAT_AMBIENT_ROUTES} carries:
  // every test below (bar the zero-persona gate ones) needs a viewer whose identity is fully resolved.
  ...SEEDED_SETTINGS_ROUTE,
  "sessions.me": { userId: castId<UserId>("user_ct"), globalRole: "user" as const, handle: "app_root" },
  // The temp-chat tile's fire-and-forget janitor mutation fires once per HOME mount, on an idle deadline
  // (home-temp-chat-tile-body.tsx REAP_IDLE_TIMEOUT_MS) — every test in this file mounts Home. The feed is
  // for pipeline EXECUTION, not a defect fix: the wire type is non-nullable `{reaped: number}`, and the
  // `invalidates` guard (`data !== undefined && data.reaped === 0`) is correct against it — only routeTrpc's
  // lenient fulfil can fabricate the `null` that slips past `!== undefined`, a HARNESS artifact production
  // never produces (there is no `onSuccess` reading `.reaped`; the only reader is `invalidates`). `{reaped: 0}`
  // is the honest "nothing expired" shape so the invalidation path runs for real.
  "chat.reapTemporaryChats": { reaped: 0 },
  // The topbar-trail inbox bell (#1627). It used to be gated on `multiHumanCapable`, which is FALSE in
  // this file (nothing stubs `/api/auth/config`), so the widget simply never mounted here and its read
  // never fired. The gate is gone — the inbox has single-human sources — so every mount in this file now
  // runs the bell's `useInbox` for real, and an unfed read would leave that pipeline INERT across the
  // whole file. An EMPTY inbox is the honest ambient shape: this route's subject is navigation, and a
  // badged bell would only add noise to the topbar assertions.
  "notifications.list": { items: [], nextCursor: null },
};

// The greeting-preview identity reads. `settings.getUserSettings` is NOT re-spelled here: it is fed
// ambiently by {@link SEEDED_SETTINGS_ROUTE}, and a second spelling of it in this position (the per-test
// value, which WINS over the ambient one) is exactly how the plain `DEFAULT_USER_SETTINGS` — all seed
// pointers null — used to reopen the first-run gate over these journeys.
const IDENTITY_STUB: TrpcRoutes<"persona.listConnectedToCharacter"> = {
  "persona.listConnectedToCharacter": (): readonly never[] => [],
};

// ── THE CREATED ROOM (D166) ────────────────────────────
// Every launcher below now fires the REAL `chat.startChat` and lands in the REAL room, so each of these
// journeys needs the room's own reads stubbed: the response row (which `useStartChat` also SEEDS into
// `getChat`), that same row on the read, the seeded greeting as REAL CANON, and the divider's fit preview
// (an unlisted-proc `null` is out-of-contract there and crashes the transcript).
const CREATED_CHAT_ID = "chat_home_created";

function createdChat(temporary: boolean): TrpcFixtureOutput<"chat.getChat"> {
  return {
    id: CREATED_CHAT_ID,
    title: null,
    participants: [],
    anchorPersonaId: null,
    identities: [],
    group: DEFAULT_GROUP_CONFIG,
    temporary,
    viewerIsHost: true,
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

function createdRoomRoutes(
  temporary: boolean,
  canon: TrpcFixtureOutput<"chat.listMessages">["messages"] = [],
): TrpcRoutes<"chat.startChat" | "chat.getChat" | "chat.listMessages" | "chat.previewContextFit"> {
  const chat = createdChat(temporary);
  return {
    "chat.startChat": { chat, opening: null },
    "chat.getChat": chat,
    "chat.listMessages": { messages: canon, identities: [] },
    "chat.previewContextFit": PREVIEW_FIT_STUB,
  };
}

test("fresh state lands on HOME — the launcher, never an empty room (D62 P4 via owner decision H1 = D-1)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...HOME_AMBIENT_ROUTES,
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
    ...HOME_AMBIENT_ROUTES,
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
    ...HOME_AMBIENT_ROUTES,
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": ONE_CHARACTER,
    "character.get": ARIA_CARD,
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
  const chatCta = page.getByRole("button", { name: chatWithActionName("Aria Nightshade"), exact: true });
  await expect(chatCta).toBeVisible();
  // On the Characters section the chat composer is NOT mounted (CONTENT is the library).
  await expect(page.getByTestId(testId("composer"))).toHaveCount(0);

  // HOVER THE ROW BEFORE CLICKING ITS CTA. The character row took `ActionsFloat` in the 2026-08-18 rail
  // pass (750991149, P1-3 row-width inversion), and a floated cluster is INERT at rest on a fine pointer
  // by ruling — `pointer-fine:pointer-events-none` on the wrapper AND its children (`list-row/variants.ts`
  // `float`: "an invisible control must not be hit-testable", side-eye P3), restored on the row's
  // hover/:focus-within. A real mouse reveals it by entering the row; Playwright evaluates actionability
  // BEFORE it moves the pointer, so a bare `.click()` deadlocks against the row body forever (#260: the
  // row body's subtree "intercepts pointer events", 30s timeout through 2 retries). The hover goes on the
  // ROW ROOT, never the CTA — hovering the CTA runs the same hit-test and deadlocks identically.
  await page.locator('[data-slot="list-row-root"]').filter({ has: chatCta }).hover();

  // Chat with Aria (the §4.4 dual-purpose CTA — "Chat with X", resume-or-new; renamed from "Start
  // chat with X" in the Wave 1 rework) → the store seam flips CONTENT back to a fresh, seeded room.
  await chatCta.click();

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
    ...HOME_AMBIENT_ROUTES,
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
// the persona. Every other test in this file seeds `PERSONAS` **and** {@link SEEDED_SETTINGS_ROUTE}'s
// pointers precisely to keep it shut — since #1570 the trigger is "can this viewer SPEAK", so the row and
// the pointers are one fixture and neither half alone closes the gate.

test("zero personas: the first-run persona ask is FORCED open — no dismiss, one way out", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...HOME_AMBIENT_ROUTES,
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": NO_CHARACTERS,
    "persona.list": [],
    // A REAL first sign-in all the way down: no persona rows AND no seed pointers. Overriding the ambient
    // {@link SEEDED_SETTINGS_ROUTE} keeps the fixture coherent — pointers naming a persona that does not
    // exist would be a state the server never writes.
    "settings.getUserSettings": { userId: castId<UserId>("user_ct"), schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
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
    ...HOME_AMBIENT_ROUTES,
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": NO_CHARACTERS,
    "persona.list": PERSONAS,
  });
  await mount(<HomePageStory />);

  // BARRIER ON THE SETTLED ARM FIRST. The gate's trigger reads BOTH `persona.list` and
  // `settings.getUserSettings` and renders nothing until both have settled (#1570), so a bare
  // `toHaveCount(0)` is satisfied by the in-flight frame and passes for the wrong reason. The rail-foot
  // avatar's accessible name is `Playing as <current>`, resolved from those SAME two reads
  // (`persona-panel-surface.tsx` PanelTrigger ← resolveCurrentPersona(personas, seeds)) — so it appears
  // only once the viewer's identity is fully resolved, which is exactly when the gate would open if it
  // were going to.
  await expect(page.getByRole("button", { name: `Playing as ${HOME_PERSONA.name}` })).toBeVisible();
  await expect(page.locator('[data-home-tile="chat.recents"]')).toBeVisible();
  await expect(page.getByTestId(testId("firstRunPersonaDialog"))).toHaveCount(0);
});

// ── A JOINER NAMES A PERSONA BEFORE THEIR SEAT (owner ruling on sign-up joiners) ──
// The /join landing waits until the viewer can speak: a joiner with no persona meets the first-run ask first, and
// the join dialog opens only once the ask has set the pointers, so the seat the join creates is never born empty.

const JOIN_TOKEN = "tok_ct_join_after_persona";
const JOIN_PREVIEW = { chatId: "chat_ct_join", roomName: "Tavern Night", hostHandle: "alex", memberCount: 2, modeLabel: "The characters take turns." };

/** A multi-human deployment and a join token the signed-out visit stashed, both in place before the app boots. */
async function arriveWithInvite(page: Page): Promise<void> {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "local", multiHumanCapable: true, share: { state: "off", url: null } }),
    }),
  );
  await page.addInitScript((token) => sessionStorage.setItem("orb:join-token", token), JOIN_TOKEN);
  await page.reload();
}

function settingsWithSeeds(personaId: PersonaId | null): TrpcFixtureOutput<"settings.getUserSettings"> {
  return {
    userId: castId<UserId>("user_ct"),
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: personaId, defaultPersonaId: personaId } },
    updatedAt: 0,
    configUnreadable: null,
  };
}

test("a joiner with no persona names one in the first-run ask before the join dialog opens", async ({ mount, page }) => {
  await arriveWithInvite(page);
  let personas: TrpcFixtureOutput<"persona.list"> = [];
  let seeded: PersonaId | null = null;
  const trpc = await routeTrpc(page, {
    ...HOME_AMBIENT_ROUTES,
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": NO_CHARACTERS,
    "persona.list": () => personas,
    "persona.create": () => {
      personas = [{ ...HOME_PERSONA, name: "Mira" }];
      return { ...HOME_PERSONA, name: "Mira", title: null, metadata: null, avatarAssetId: null, createdAt: 0, updatedAt: 0 };
    },
    "settings.getUserSettings": () => settingsWithSeeds(seeded),
    "settings.updateUserSettingsSection": () => {
      seeded = castId<PersonaId>(HOME_PERSONA.id);
      return settingsWithSeeds(seeded);
    },
    "invites.previewInvite": () => JOIN_PREVIEW,
  });
  await mount(<HomePageStory />);

  const gate = page.getByTestId(testId("firstRunPersonaDialog"));
  const join = page.getByTestId(testId("joinInviteDialog"));
  // The gate renders only once both of its reads settled, so its presence is the barrier for the join's absence.
  await expect(gate).toBeVisible();
  await expect(join).toHaveCount(0);
  await expect.poll(() => trpc.count("invites.previewInvite")).toBe(0);

  await page.getByTestId(testId("firstRunPersonaName")).fill("Mira");
  await page.getByTestId(testId("firstRunPersonaCreate")).click();

  await expect(gate).toHaveCount(0);
  await expect(join).toBeVisible();
  await expect(join.getByTestId(testId("joinInviteConfirm"))).toBeVisible();
  await expect.poll(() => trpc.count("persona.create")).toBe(1);
});

test("control: a joiner who already speaks as a persona gets the join dialog at once, with no first-run ask", async ({ mount, page }) => {
  await arriveWithInvite(page);
  await routeTrpc(page, {
    ...HOME_AMBIENT_ROUTES,
    "chat.listChats": chatListResponder([]),
    "databank.list": { items: [], nextCursor: null, totalCount: 0 },
    "databank.bankHealth": EMPTY_BANK_HEALTH,
    "character.list": NO_CHARACTERS,
    "persona.list": PERSONAS,
    "invites.previewInvite": () => JOIN_PREVIEW,
  });
  await mount(<HomePageStory />);

  await expect(page.getByTestId(testId("joinInviteDialog"))).toBeVisible();
  await expect(page.getByTestId(testId("firstRunPersonaDialog"))).toHaveCount(0);
});

// ── THE PHONE PRINTS THE LIBRARY'S SIZE (#1670) ────────────────────────────────────────────
// Driven at the REAL composition root because that is the only mount where the real Characters section's
// `useSelectionTitle` meets the real shell topbar — `app-shell.ct.tsx` composes a FAKE section registry with
// stand-in title hooks, so it structurally cannot see this.
//
// The defect: the census travels inside the LIST band's title (`list-pane-header.tsx`), the ONE-NAME rule
// sheds that title when the pane IS the screen (`shell.css`), and #518 had already retired the filter rail's
// printed copy — so a phone printed the library's size NOWHERE, and 12 characters read the same as an empty
// shelf. The count now rides the noun that survives, which keeps ONE visible census per regime.

/** A library page whose CENSUS is the subject — `character.list` serves a real `totalCount` beside its page. */
const TWELVE_CHARACTERS = { items: [ARIA], nextCursor: null, totalCount: 12 };

const CENSUS_ROUTES: TrpcRoutes<"chat.listChats" | "databank.list" | "databank.bankHealth" | "character.list" | "persona.list"> = {
  ...HOME_AMBIENT_ROUTES,
  "chat.listChats": chatListResponder([]),
  "databank.list": { items: [], nextCursor: null, totalCount: 0 },
  "databank.bankHealth": EMPTY_BANK_HEALTH,
  "character.list": TWELVE_CHARACTERS,
  "persona.list": PERSONAS,
};

for (const width of [320, 390] as const) {
  test.describe(`the phone's Characters screen at ${String(width)}px`, () => {
    // `hasTouch` because this is the COARSE-POINTER regime the rule belongs to, not merely a narrow window
    // (`snap --mobile --viewport` silently drops the pointer, #1668 — the CT browser is where it is real).
    test.use({ hasTouch: true, viewport: { width, height: 844 } });

    test("the topbar's screen name carries the census the shed band title took with it", async ({ mount, page }) => {
      await routeTrpc(page, CENSUS_ROUTES);
      const component = await mount(<HomePageStory />);
      await component.locator(".shell-rail").getByRole("button", { name: "Characters", exact: true }).click();

      // The ONE name on this screen, and it states the size — the same sentence the desktop band prints.
      const screenName = component.locator(".shell-topbar-title");
      await expect(screenName).toBeVisible();
      await expect(screenName).toHaveText("Characters · 12");
      // …and it is the ONLY census on screen: the band's title, where the other copy lives, is shed by the
      // ONE-NAME rule in exactly this arm. #518's single-visible-census ruling survives, per regime.
      await expect(component.locator('[data-slot="list-pane-title"]')).toBeHidden();
    });
  });
}

test("the DESKTOP census is untouched — it stays in the LIST band and the narrow name never paints", async ({ mount, page }) => {
  await routeTrpc(page, CENSUS_ROUTES);
  const component = await mount(<HomePageStory />);
  await component.locator(".shell-rail").getByRole("button", { name: "Characters", exact: true }).click();

  const bandTitle = component.locator('[data-slot="list-pane-title"]');
  await expect(bandTitle).toBeVisible();
  await expect(bandTitle).toContainText("Characters");
  await expect(bandTitle).toContainText("12");
  // The narrow identity arm is in the DOM in both regimes (`shell-topbar.tsx`) — the container query is what
  // picks one — so this asserts PAINT, not presence, or it would pass for the wrong reason.
  await expect(component.locator(".shell-topbar-title")).toBeHidden();
});

// ── THE PHONE PRINTS EVERY LIST-BEARING SECTION'S SIZE (#1676 — the #1670 class, one section wider) ──
// Driven at the REAL composition root because that is the only mount where a section's real
// `useSelectionTitle` meets the real shell topbar: `app-shell.ct.tsx` composes `CtFakeSectionRegistry`,
// whose story-injected sections can supply a stand-in title hook (#1677), so it cannot pin this.
//
// The defect, per section: the census travels inside the LIST band's title (`list-pane-header.tsx`), the
// ONE-NAME rule sheds that title when the pane IS the screen (`shell.css`), so a phone printed the library's
// size NOWHERE — a 328-row leaderboard and an empty one read identically. The count now rides the noun that
// survives, which keeps exactly ONE visible census per regime. Config is deliberately absent from this table:
// its band carries no count at all (`config-section.tsx` renders `<ListPaneHeader title={…} />` bare), because
// its LIST is a nav of settings groups — a number there would count doors, not a library.

/** A leaderboard PAGE — `rows` is the capped page, `total` the population it was cut from. */
const ANALYTICS_ROW = {
  characterId: "char_aria",
  name: "Aria Nightshade",
  chats: 4,
  userTurns: 40,
  assistantTurns: 42,
  swipes: 3,
  tokensOut: 12_000,
  totalGenTimeMs: 90_000,
  reasoningRate: 0,
  firstChatAt: 1000,
  lastActivityAt: 5000,
};
const ANALYTICS_PAGE = { rows: [ANALYTICS_ROW, { ...ANALYTICS_ROW, characterId: "char_bolt", name: "Bolt", assistantTurns: 9 }], total: 328 };
/** Four presets, none filtered (this route never types in the search) — the unnarrowed census is the length. */
const PRESET_ROWS = [1, 2, 3, 4].map((n) => ({
  id: `preset_census_${String(n)}`,
  name: `Preset ${String(n)}`,
  kind: "generation",
  isSystemDefault: false,
  forkedFrom: null,
  createdAt: 0,
  updatedAt: 0,
}));
/** Two documents and a bank health that AGREES with them — an incoherent pair would prove nothing. */
const CENSUS_DOCS = [
  {
    id: "document_census_1",
    name: "The Crimson Court",
    mime: "application/pdf",
    origin: "upload",
    sourceUrl: null,
    byteSize: 25_088,
    charCount: 4200,
    chunkCount: 12,
    embeddedCount: 12,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "document_census_2",
    name: "Duskwater Barony",
    mime: "application/pdf",
    origin: "wiki",
    sourceUrl: null,
    byteSize: 93_901,
    charCount: 9000,
    chunkCount: 39,
    embeddedCount: 39,
    createdAt: 0,
    updatedAt: 0,
  },
] satisfies TrpcWireOutput<"databank.list">["items"];
const CENSUS_BANK_HEALTH = { ...EMPTY_BANK_HEALTH, ready: 2, chunks: 51, passages: 51, total: CENSUS_DOCS.length };
/** Two registered extension pages, joined to their plugin's display name by `usePluginPages`. */
const CENSUS_PLUGIN = { id: "plugin_census", name: "Census Kit" };
const CENSUS_SURFACES = [
  { pluginId: CENSUS_PLUGIN.id, id: "board_page", anchor: "page", title: "The Board", tier: "frame" },
  { pluginId: CENSUS_PLUGIN.id, id: "ledger_page", anchor: "page", title: "The Ledger", tier: "frame" },
] satisfies TrpcWireOutput<"plugin.listSurfaces">;
const CENSUS_SESSIONS = [
  {
    id: "refinery_census_1",
    characterId: "char_aria",
    characterName: "Aria Nightshade",
    characterAvatarHash: null,
    name: null,
    status: "active",
    iterationCount: 1,
    latestVerdict: null,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "refinery_census_2",
    characterId: "char_bolt",
    characterName: "Bolt",
    characterAvatarHash: null,
    name: null,
    status: "active",
    iterationCount: 2,
    latestVerdict: "ACCEPT",
    createdAt: 0,
    updatedAt: 0,
  },
] satisfies TrpcWireOutput<"refinery.listSessions">;
const CENSUS_CHATS = [1, 2, 3].map((n) => makeChatSummary({ id: `chat_census_${String(n)}`, title: `Chat ${String(n)}` }));

/**
 * EVERY read the seven screens need, fed at once — this route's subject is the TOPBAR, so no section's data
 * is any one test's variable, and one map keeps every arm's fixture visible beside the number it must print.
 * The unfed-read ratchet is the reason this is exhaustive rather than per-test: each section's census read now
 * runs under the shell whenever that section is active.
 */
const SECTION_CENSUS_ROUTES: TrpcRoutes<
  | "chat.listChats"
  | "character.list"
  | "persona.list"
  | "databank.list"
  | "databank.bankHealth"
  | "discovery.catalog"
  | "discovery.browseCharacters"
  | "discovery.characterFacets"
  | "stats.leaderboard"
  | "preset.list"
  | "plugin.list"
  | "plugin.listSurfaces"
  | "refinery.listSessions"
  | "chat.getChat"
  | "databank.listGlobal"
  | "discovery.home"
  | "discovery.visualArchetypes"
  | "discovery.forgottenGems"
  | "stats.freshness"
  | "stats.overview"
  | "stats.wrapped"
  | "stats.momentum"
  | "discovery.unusedCharacters"
  | "discovery.modelRouting"
  | "discovery.topKeywords"
  | "workloads.list"
> = {
  ...HOME_AMBIENT_ROUTES,
  "chat.listChats": chatListResponder(CENSUS_CHATS),
  "character.list": NO_CHARACTERS,
  "persona.list": PERSONAS,
  "databank.list": { items: CENSUS_DOCS, nextCursor: null, totalCount: CENSUS_DOCS.length },
  "databank.bankHealth": CENSUS_BANK_HEALTH,
  "discovery.catalog": { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 12, totalCharacters: 19 },
  "discovery.browseCharacters": { items: [], nextCursor: null },
  "discovery.characterFacets": { genres: [], tones: [] },
  "stats.leaderboard": ANALYTICS_PAGE,
  "preset.list": PRESET_ROWS,
  "plugin.list": [CENSUS_PLUGIN],
  "plugin.listSurfaces": CENSUS_SURFACES,
  "refinery.listSessions": CENSUS_SESSIONS,
  // ── AND THE CONTENT PANES BEHIND THE BANDS ─────────────────────────────────────────────────────────
  // The DESKTOP arm renders each section's CONTENT beside its list, so visiting seven sections mounts seven
  // dashboards. None of them is this route's subject — the subject is the topbar — but the unfed-read ratchet
  // is right that a `null` fulfil is not a view, so each is fed its own EMPTY-but-real shape, taken from that
  // surface's own CT. An empty dashboard is the honest companion to the small fixtures above.
  "chat.getChat": createdChat(false),
  "databank.listGlobal": [],
  "discovery.home": {
    coverage: { characters: 0, digests: 0, segments: 0 },
    sceneThemes: [],
    arcThemes: [],
    duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
  },
  "discovery.visualArchetypes": [],
  "discovery.forgottenGems": [],
  "stats.freshness": { computedAt: 0, stale: false, hasData: false },
  "stats.overview": {
    tokensIn: 0,
    tokensOut: 0,
    swipeWords: 0,
    avgGenMs: 0,
    p50GenMs: 0,
    p90GenMs: 0,
    avgTtftMs: 0,
    throughputTps: 0,
    cacheHitRate: 0,
    reasoningRate: 0,
    reasoningMs: 0,
  },
  "stats.wrapped": {
    characters: 0,
    chats: 0,
    words: 0,
    replies: 0,
    swipes: 0,
    forkedChats: 0,
    costUsd: 0,
    genTimeMs: 0,
    topCharacter: null,
    temporal: { activeDays: 0, longestStreakDays: 0, busiestDay: null, dayOfWeek: [0, 0, 0, 0, 0, 0, 0] },
  },
  "stats.momentum": { latestMonth: null, prevMonth: null, rising: [], falling: [] },
  // The corpus dashboard's remaining rails (a CASCADE: they could not be requested until the reads above
  // stopped answering null), plus the jobs read its run-a-pass door resolves against. Empty, as above.
  "discovery.unusedCharacters": [],
  "discovery.modelRouting": [],
  "discovery.topKeywords": [],
  "workloads.list": [],
};

interface CensusCase {
  /** The rail/sheet affordance's accessible name, which is also the section label the topbar prints. */
  readonly label: string;
  /** `tab` sections sit on the phone's bottom bar; the rest are reached through the You sheet (§E-5). */
  readonly onPhoneBar: boolean;
  /** The whole screen name, census included — the ONE thing a phone reader is told about this library. */
  readonly phoneTitle: string;
  /** What the DESKTOP band prints beside its title (the control: the desktop is untouched by this change). */
  readonly bandCount: string;
  /** `panelDefaults.list === "collapsed"` (analytics, refinery): the desktop band needs the pane opened. */
  readonly listStartsCollapsed?: boolean;
}

const CENSUS_CASES: readonly CensusCase[] = [
  { label: "Chats", onPhoneBar: true, phoneTitle: "Chats · 3", bandCount: "3" },
  { label: "Corpus", onPhoneBar: false, phoneTitle: "Corpus · 12 of 19", bandCount: "12 of 19" },
  { label: "Analytics", onPhoneBar: false, phoneTitle: "Analytics · 2 of 328", bandCount: "2 of 328", listStartsCollapsed: true },
  { label: "Presets", onPhoneBar: false, phoneTitle: "Presets · 4", bandCount: "4" },
  { label: "Databank", onPhoneBar: false, phoneTitle: "Databank · 2", bandCount: "2" },
  { label: "Extensions", onPhoneBar: false, phoneTitle: "Extensions · 2", bandCount: "2" },
  { label: "Refinery", onPhoneBar: false, phoneTitle: "Refinery · 2", bandCount: "2" },
];

/** The phone's two doors: the bottom-bar tab for a curated section, the You sheet for every overflow one. */
async function reachOnPhone(component: Locator, page: Page, kase: CensusCase): Promise<void> {
  if (kase.onPhoneBar) {
    await component.locator(".shell-rail").getByRole("button", { name: kase.label, exact: true }).click();
    return;
  }
  await component.locator(".shell-rail").getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: kase.label, exact: true }).click();
  // The sheet is a real dialog that aria-hides the frame behind it — read the topbar only once it is GONE.
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

for (const width of [320, 390] as const) {
  test.describe(`the phone's screen names at ${String(width)}px`, () => {
    // `hasTouch` because this is the COARSE-POINTER regime the rule belongs to, not merely a narrow window
    // (`snap --mobile --viewport` silently drops the pointer, #1668 — the CT browser is where it is real).
    test.use({ hasTouch: true, viewport: { width, height: 844 } });

    for (const kase of CENSUS_CASES) {
      test(`${kase.label}: the topbar's screen name carries the census the shed band title took with it`, async ({ mount, page }) => {
        await routeTrpc(page, SECTION_CENSUS_ROUTES);
        const component = await mount(<HomePageStory />);
        await reachOnPhone(component, page, kase);

        // The ONE name on this screen, and it states the size — the same sentence the desktop band prints.
        // `toHaveText` is the settle barrier too: before the census lands the bar reads the bare label, which
        // is exactly the defect state, so this cannot pass on an in-flight frame.
        const screenName = component.locator(".shell-topbar-title");
        await expect(screenName).toHaveText(kase.phoneTitle);
        // …and it is the ONLY census on screen: the band's title, where the other copy lives, is shed by the
        // ONE-NAME rule in exactly this arm. The single-visible-census ruling survives, per regime.
        await expect(component.locator('[data-slot="list-pane-title"]')).toBeHidden();
      });
    }
  });
}

test("the DESKTOP census is untouched — it stays in every LIST band and the narrow name never paints", async ({ mount, page }) => {
  await routeTrpc(page, SECTION_CENSUS_ROUTES);
  const component = await mount(<HomePageStory />);

  for (const kase of CENSUS_CASES) {
    await component.locator(".shell-rail").getByRole("button", { name: kase.label, exact: true }).click();
    if (kase.listStartsCollapsed === true) {
      // A content-first hub boots with its LIST collapsed (D62), so the band it prints into is not on screen
      // until the pane is — the toggle is the desktop's own door to it.
      await component.getByRole("button", { name: "Show list panel" }).click();
    }
    const bandTitle = component.locator('[data-slot="list-pane-title"]');
    await expect(bandTitle).toContainText(kase.label === "Refinery" ? "Sessions" : kase.label);
    await expect(bandTitle).toContainText(kase.bandCount);
  }
  // The narrow identity arm is in the DOM in both regimes (`shell-topbar.tsx`) — the container query is what
  // picks one — so this asserts PAINT, not presence, or it would pass for the wrong reason.
  await expect(component.locator(".shell-topbar-title")).toBeHidden();
});

// AN OPEN MEMBER IS NEVER OVERWRITTEN BY THE ROSTER'S CENSUS (#1670 follow-up). The census arm used to be
// reached whenever `character.get` had not yet produced a NAME, so the phone topbar printed `Characters · 12`
// OVER an open member while her read was in flight — and would print it for good for a member whose name is
// legitimately empty (on chats, where a title is stored `""` until renamed, that is the ordinary case, which
// is why the sibling sections gate on the SELECTION). The arm is the selection now, so this pins the whole
// journey: roster → her, held → her, landed.
//
// HELD, NOT RACED: `trpcHold` suspends her read, so "nothing has named her yet" is an indefinitely stable
// rendered state rather than a flash a poll would have to catch.
test.describe("the phone's Characters screen with a member open", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("an open member's screen keeps the section label while her name is in flight — never the census", async ({ mount, page }) => {
    const characterGet = trpcHold();
    await routeTrpc(page, { ...CENSUS_ROUTES, "character.get": characterGet });
    const component = await mount(<HomePageStory />);
    await component.locator(".shell-rail").getByRole("button", { name: "Characters", exact: true }).click();

    // The roster arm first, so the census is proven PRESENT before the open is asked to remove it.
    const screenName = component.locator(".shell-topbar-title");
    await expect(screenName).toHaveText("Characters · 12");

    // Opened the way a reader opens her: the library row's ACCESSIBLE NAME is her name (#492), scoped to the
    // LIST panel because home stays mounted with a quick-picks row of the same name.
    await component.locator('.shell-panel[data-panel-side="list"]').getByRole("button", { name: ARIA.name, exact: true }).click();
    // The barrier is the HELD request, not a timer: past this the selection is written and the title hook has
    // re-run with nothing to name her by.
    await characterGet.requested;
    await expect(screenName).toHaveText("Characters");

    characterGet.release({ id: ARIA.id, name: ARIA.name, greetings: [] });
    await expect(screenName).toHaveText(ARIA.name);
  });
});
