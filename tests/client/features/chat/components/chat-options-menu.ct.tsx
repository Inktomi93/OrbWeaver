// CT: the ⋯ chat-options menu (chat-options-menu.tsx). #41 CONSOLIDATION: the turn actions
// (Continue / Regenerate / Impersonate) moved to the composer WAND (composer-wand.ct.tsx pins their
// payload shapes there) — this menu keeps only actions with NO wand/panel home, plus the #40/#862 GAME-MODE
// section (one start action, one stop action — its verbs are host-gated server-side).
//
// The trigger button is inline (component-scoped); the menu POPUP renders through a Base UI Portal, so every
// menu-item assertion uses the PAGE locator (`page.getByRole`), never `component` (the composer-wand.ct.tsx
// precedent).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatGameModeMenuStory, ChatOptionsMenuStory } from "../_ct-stories.tsx";
import { CHAT_ID, CHAT_ROOM_ROUTES } from "../fixtures.ts";

/** One chats-list row — the fields the row's markers read; the census counts `isGame`. */
const LIST_ROW = {
  id: CHAT_ID,
  title: "Test chat",
  starred: false,
  archived: false,
  gamePaused: false,
  lastMessageAt: null,
  messageCount: 0,
  lastMessagePreview: null,
  isGame: true,
  participantNames: [],
  filterCharacterIds: [],
  participantPortraits: [],
  viewerRole: "host",
  createdAt: 0,
  updatedAt: 0,
};

// #637 — THE SINGLETON THIS FILE WAS FLAGGED FOR, and the verdict: `chat.getChat` was unfed in every case
// here, and it is NOT an error-arm defect (GameMenuSection's read is a non-suspending `useGatedQuery` and the
// component optional-chains it throughout — a comment at chat-options-menu.tsx:83 says why, in those words).
// It is worse in a quieter way: with the read unfed, `detail` is `null`, so `detail?.viewerIsHost === false`
// is false and `detail?.rpg ?? null` is null — the menu renders its host arm and its FIRST-EVER-ENABLE arm by
// ACCIDENT, and the #40 test below has been asserting the arm the missing data produced rather than the arm a
// room without a game produces. The two arms GameMenuSection actually forks on — the non-host PERMISSION-omit
// and the overlay on/off toggle — were unreachable from this file. `CHAT_ROOM_ROUTES` now supplies a real
// detail (`viewerIsHost: true`, `rpg: null`), which is the same arm, honestly reached.

// ── #8 grey-out (owner ruling 2026-07-24: "i fucking hate things hiding and when it's disabled on hover
// tell why") — the DRAFT arm renders the IDENTICAL item set to a committed chat: nothing HIDDEN, the
// canon-requiring actions DISABLED, and EVERY disabled item carries a hover reason NAMING the unlock
// condition. `committed={false}` is the ONE seam. ─────────────────────────────────────────────────────

// The full row label set the ⋯ menu renders (committed + draft, character-gated rows included via withCharacters).
// IA de-dup (owner rule, W3c): items with a CONTEXT-panel home are GONE from the ⋯ menu — Chat settings
// (Settings tab), Preview request (Preview tab), Injections (Injections tab), and Invite / Hand off host /
// Leave (all in the Members tab); the turn actions live on the WAND (#41). "Turn on game mode" is the
// #40/#862 toggle — ONE item now, not a submenu trigger, because the ruleset it used to ask for is a
// Game-tab setting (owner ruling 2026-08-30).

// The items DISABLED on a draft (everything that needs a committed server row / canon), each with a reason.
// The items that stay LIVE on a draft (canon-less: cast-based new-chat + navigation + the game-mode toggle).
// The unlock-condition reason must NAME when it becomes available, not just say "unavailable".
// The lifecycle-placement ABSENCE pins: no download/export item may exist in the ROOM menu.
const ANY_TRANSCRIPT = /transcript/u;
const ANY_EXPORT = /export/iu;

test("#8: a COMMITTED chat's row actions are ENABLED (there IS a server row) — the committed baseline", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES });
  const component = await mount(<ChatOptionsMenuStory withCharacters={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeEnabled();
});

// The lifecycle one-home ruling: import/export live on the LIST side (band ghost + row kebab). The ROOM
// carries no import/export chrome — this pins the ABSENCE, so a re-scattered download can't land quietly.
test("lifecycle placement: the room ⋯ menu offers NO transcript download (its one home is the list row kebab)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES });
  const component = await mount(<ChatOptionsMenuStory withCharacters={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: ANY_TRANSCRIPT })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: ANY_EXPORT })).toHaveCount(0);
});

// ── #869 (side-eye 2026-08-30, the two P3s stumbled on while driving the game's front door) ──────────
// BOTH HALVES ARE ABOUT WHAT THE EYE AND THE VOICE CAN REACH:
//   • the TRIGGER's visible tooltip read "Manage this chat" over an accessible name of "Chat options"
//     (`cbrs-tip.log`). On an icon-only control the tooltip IS the visible label, so that is WCAG 2.5.3
//     Label in Name (§13.10 N2) failing in letter — a voice-control user saying the words on screen could
//     not reach the room's only game door. `RowActionsMenu.tooltip` is a BOOLEAN now (the popup renders
//     `label`), so the two strings cannot diverge again; this pins the rendered result.
//   • `Select messages…` was the one item with NO glyph, a hole in the icon column directly under the game
//     row. The census is over EVERY item, so the next item added without one reds here.
test("#869: the ⋯ trigger's tooltip speaks its accessible name, verbatim", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES });
  const component = await mount(<ChatOptionsMenuStory withCharacters={true} />);

  await component.getByRole("button", { name: "Chat options", exact: true }).hover();
  await expect(page.locator('[data-slot="tooltip-popup"][data-open]')).toHaveText("Chat options");
  // …and the retired twin is gone, not merely joined: two strings is what let them drift.
  await expect(page.locator('[data-slot="tooltip-popup"][data-open]', { hasText: /Manage this chat/u })).toHaveCount(0);
});

test("#869: every item in the ⋯ menu carries a glyph", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES });
  const component = await mount(<ChatOptionsMenuStory withCharacters={true} />);

  await component.getByRole("button", { name: "Chat options", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeVisible();
  const glyphless = await page
    .getByRole("menuitem")
    .evaluateAll((items) => items.filter((item) => item.querySelector("svg") === null).map((item) => item.textContent ?? ""));
  expect(glyphless, "every ⋯ item carries a glyph — a hole in the icon column reads as a missing affordance").toEqual([]);
});

// ── #40/#862/#863: the GAME-MODE section — one start action, one noun, and a transition that reveals
// itself. Each test names the finding it pins; the old submenu (`Turn on RPG` → `Freeform story`) is gone
// because the pick it offered is a Game-tab SETTING now (owner ruling 2026-08-30). ───────────────────

test("#862: the ⋯ item is ONE start action — a single click on 'Turn on game mode' fires rpg.createGame with no ruleset pick", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "rpg.createGame": () => ({ gameId: "rpg_game_ct", trackersReadOnly: false }) });
  const component = await mount(<ChatOptionsMenuStory withCharacters={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // ONE item, exact name — not a submenu trigger, and not the retired "Turn on RPG" noun.
  await page.getByRole("menuitem", { name: "Turn on game mode", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /RPG/u })).toHaveCount(0);

  await expect.poll(() => trpc.count("rpg.createGame"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("rpg.createGame")).toMatchObject({ chatId: CHAT_ID, mode: "lite" });
  // No start-time vocabulary pick rides the wire — `ruleset` is the Game tab's setting (#862).
  await expect.poll(() => trpc.lastInput("rpg.createGame")).not.toHaveProperty("ruleset");
  await expect.poll(() => trpc.lastInput("rpg.createGame")).not.toHaveProperty("profile");
});

test("#863: a user-initiated START announces itself and opens the panel on the game's Status tab", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.listChats": () => ({ items: [], nextCursor: null }),
    "rpg.createGame": () => ({ gameId: "rpg_game_ct", trackersReadOnly: false }),
  });
  const component = await mount(<ChatGameModeMenuStory />);
  await component.getByRole("button", { name: "Chat options" }).click();
  await page.getByRole("menuitem", { name: "Turn on game mode", exact: true }).click();

  // The SETTLED result of the commit: the app's polite region carries the transition, and the shell's
  // context landing is the game's Status tab from THIS door (the Game-tab door lands the same place).
  await expect(component.getByRole("status")).toHaveText("Game mode on — the Game panel is open");
  await expect(component.getByText("Landing: rpg.status")).toBeVisible();
  await expect(component.getByText("Context panel: docked")).toBeVisible();
});

test("#863: the OFF item carries the kept-state line as visible text AND as its accessible description, with a clean name", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": () => ({ ...(CHAT_ROOM_ROUTES["chat.getChat"] as object), rpg: { gameId: "rpg_game_ct", engaged: true } }),
  });
  const component = await mount(<ChatOptionsMenuStory />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // The NAME stays the bare verb (`aria-labelledby` pins it to the first line) — the second line would
  // otherwise fold into it via textContent. `exact` is the pin: a prefix matcher passes on the run-on.
  const item = page.getByRole("menuitem", { name: "Turn off game mode", exact: true });
  await expect(item).toBeVisible();
  // The reassurance is VISIBLE copy at the moment of the decision (it used to live in a `title` tooltip,
  // which touch never renders at all), and it is the item's accessible DESCRIPTION.
  await expect(page.getByText("Your sheets, scene and quests are kept.")).toBeVisible();
  // The item is asserted VISIBLE above, so it is mounted and settled and the id is a render-time constant;
  // a blank id makes the locator below resolve to nothing and its retrying assertion fails loudly.
  const describedBy = (await item.getAttribute("aria-describedby")) ?? "";
  await expect(page.locator(`#${describedBy}`)).toHaveText("Your sheets, scene and quests are kept.");
  // The `title` home is gone — one home for the copy, and it is the visible one.
  await expect(item).not.toHaveAttribute("title", /./u);
});

test("#863: turning game mode OFF announces the kept state AND repaints the chats-list marker at t+0", async ({ mount, page }) => {
  let engaged = true;
  await routeTrpc(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": () => ({ ...(CHAT_ROOM_ROUTES["chat.getChat"] as object), rpg: { gameId: "rpg_game_ct", engaged } }),
    // The LIST read is a different query carrying its own server-derived marker — it flips the moment the
    // server does, so a stale census can only mean the mutation never invalidated this read.
    "chat.listChats": () => ({ items: [{ ...LIST_ROW, isGame: engaged, gamePaused: !engaged }], nextCursor: null }),
    "rpg.updateConfig": () => {
      engaged = false;
      return {};
    },
  });
  const component = await mount(<ChatGameModeMenuStory />);
  await expect(component.getByText("Game rows: 1")).toBeVisible();

  await component.getByRole("button", { name: "Chat options" }).click();
  await page.getByRole("menuitem", { name: "Turn off game mode", exact: true }).click();

  await expect(component.getByRole("status")).toHaveText("Game mode off — your sheets, scene and quests are kept");
  // The census flips WITHOUT a reload: `chat.listChats` is in the mutation's invalidation set (#863 P2 —
  // it was not, and the ⚔ marker outlived the toggle for the rest of the session).
  await expect(component.getByText("Game rows: 0")).toBeVisible();
});
