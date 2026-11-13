// Shared e2e helpers for the chat-room persistence/sync ports (chat-persistence · multi-tab-sync ·
// event-sequence · injection-roundtrip). A chat row exists from the creation click (D166): `chat.startChat`
// seeds the character's greeting (assistant rows, no model call) and a list-visible chat needs one send, which
// fires ONE real turn. So the cheapest way to guarantee a listed chat is: reuse an existing one if the DB already
// has any, else drive the real start-chat+send flow ONCE. Under serial `workers:1`, the first spec that
// bootstraps pays the turn cost and the rest reuse the row.
//
// EVERY SEND RETURNS ITS WITNESS. `sendAndAwaitReply`, `sendHeldTurn` and `witnessTurn` read canon before the send
// and return the ids of the rows it created, so a caller asserts through `messageRow`. The typing step stays private.
//
// SELECTOR STRATEGY (orb has no neo-style chat testids — verified against the live client source):
//   • chat LIST rows are native <button>s (@orb/ui/list-row clickable), accessible name = the chat title.
//   • the topbar chat identity (chat-header.tsx) renders the participants as the title and a user-set room
//     name as a SECONDARY span that truncates to nothing on a narrow column — a renamed title is asserted with
//     `.first()` against the list row's copy, never the header's alone; it is a SPAN, not a
//     heading — there is no <h1> and no heading role in orb (neo's `locator("h1")` does not port). Title
//     persistence is asserted on a UNIQUE minted title (timestamped), so `getByText(newTitle)` being
//     visible is unambiguous proof regardless of the list-vs-header duplication.
//   • Rename/Star live behind the ⋯ "Chat options" menu (chat-options-menu.tsx) + the per-row kebab "Chat
//     actions" menu (chat-list-row-menu.tsx). Rename opens a Dialog with an `aria-label="Chat title"` input.
//   • stream-open is observed on the wire (`stream-tap.ts`: the room's `chatOpened` frame); orb has no
//     `chat-stream-state` testid.

import { GROUP_OUTPUT_LABELS } from "@orb/contracts/chat";
import { isPlainObject } from "@orb/kit/guards";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { HOST_BAND, openContextSections, SECTION_LABELS } from "@orb/testkit/ct";
import { budget } from "@orb/tooling/floor/host/load-budget";
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { CHARACTER_SEARCH_NAME } from "#client/components/shared-control-names.ts";
import { CHAT_CONTEXT_TAB_LABELS, CHAT_CONTEXT_TABLIST_NAME } from "#client/features/chat/lib/chat-context-tab-labels.ts";
import { CHAT_OPTIONS_NAME } from "#client/features/chat/lib/chat-options-names.ts";
import { CHAT_GROUP_BEHAVIOR_NAME } from "#client/features/chat/lib/chat-settings-names.ts";
import {
  CHAT_COMPOSER_NAME,
  CHAT_LIST_EMPTY_TITLE,
  CHAT_LIST_NAME,
  CHAT_MESSAGE_INPUT_NAME,
  CHAT_SEARCH_NAME,
  CHAT_SEND_NAME,
} from "#client/features/chat/lib/chat-surface-names.ts";
import { APP_READY_ATTR } from "#client/lib/app-ready-attribute.ts";
import { CHAT_TITLE_FIELD_NAME } from "#client/lib/chat-rename-names.ts";
import { CONTEXT_SHEET_BACK_NAME, LIST_PANEL_NOUN, panelEdgeName, sectionBackName } from "#client/lib/context-pane-names.ts";
import { contextToggleLabel } from "#client/lib/context-toggle-label.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import { MESSAGE_TOOLS_LABEL } from "#client/lib/flank-names.ts";
import { PRIMARY_NAV_NAME } from "#client/lib/rail-names.ts";
import { GAME_STRIP_LABEL } from "#client/lib/registry-contracts.ts";
import { ROW_RENAME_NAME } from "#client/lib/row-menu-names.ts";
import { CHAT_WITH_ACTION_LEAD, chatWithActionName, rowActionsName } from "#client/lib/row-qualifiers.ts";
import { streamTapOf, waitForRoomOpened } from "./stream-tap.ts";
import { WAIT_LIVE_TURN_MS, WAIT_SETTLE_MS, WAIT_SHORT_MS, WAIT_SURFACE_MS } from "./timeouts.ts";
import type { CanonMessage } from "./trpc.ts";
import { batchResultData, listCanon } from "./trpc.ts";
import { newReplyRow, newUserRows, soleUserRow } from "./turn-witness.ts";

// The character row's chat affordance (character-card.tsx `NormalRowActions`): the dual-purpose resume-or-new
// Chat CTA. Each row exposes a `aria-label="Chat with <name>"` button — visually hover-revealed on fine
// pointers, but ALWAYS present in the accessibility tree (verified via `pnpm snap --aria` on the live client
// 2026-07-24), so a role/name locator hits it at every width. This is the exemplar path
// (start-chat-with-character.spec.ts, commit b79cf0a871). The stale kebab→"Chat" menuitem flow is dead — this
// client's row kebab ("Actions for <name>") carries only Archive/Duplicate/Delete, NO "Chat" item.
const CHARACTER_ROW_CHAT_CTA = new RegExp(`^${RegExp.escape(CHAT_WITH_ACTION_LEAD)} `, "u");
const APP_READY = `html[${APP_READY_ATTR}]`;
const BOOTSTRAP_MESSAGE = "Hi";
// Wait for the lazy Chats surface without replaying the navigation action.
const CHAT_SURFACE_TIMEOUT = budget(45_000);

/** Identity-scoped locator for ONE message row, keyed on `data-message-id` (message-row.tsx). The
 *  deliberate alternative to a positional `.first()/.last()` pick when the target row's id is known
 *  (from canon or a prior mutation's return value) — strict-mode-safe by construction (exactly one
 *  element can carry a given id). */
export function messageRow(page: Page, messageId: MessageId): ReturnType<Page["locator"]> {
  return page.locator(`[data-message-id="${messageId}"]`);
}

/** All currently-mounted assistant rows (`[data-slot="message-row"][data-role="assistant"]`). Still
 *  positional by nature (no id filter) — callers doing `.first()/.last()` on this locator are making a
 *  DELIBERATE "newest/oldest assistant row" choice, not falling back to strict-mode escape-hatch. */
export function assistantRows(page: Page): ReturnType<Page["locator"]> {
  return page.locator('[data-slot="message-row"][data-role="assistant"]');
}

/** Wait for the app shell + its initial reads to settle (the app-ready idle signal). */
export async function waitForAppReady(page: Page, timeout = 30_000): Promise<void> {
  try {
    await expect(page.locator(APP_READY)).toHaveAttribute(APP_READY_ATTR, "", { timeout });
  } catch (cause) {
    let diagnostic: string;
    try {
      const state = await page.evaluate(
        (attribute) => ({
          path: globalThis.location.pathname,
          ready: document.documentElement.getAttribute(attribute),
          body: document.body.textContent.slice(0, 1000),
          viteErrors: [...document.querySelectorAll("vite-error-overlay")].map((overlay) =>
            [".plugin", ".message-body", ".file"].map((selector) => overlay.shadowRoot?.querySelector(selector)?.textContent ?? "").join(" "),
          ),
        }),
        APP_READY_ATTR,
      );
      diagnostic = JSON.stringify(state);
    } catch (captureFailure) {
      diagnostic = `diagnostic capture failed: ${captureFailure instanceof Error ? captureFailure.message : String(captureFailure)}`;
    }
    throw new Error(`e2e app readiness failed: ${diagnostic}`, { cause });
  }
}

/** Wait until the server has delivered the room's `chatOpened` frame on the live stream — the deterministic
 *  "subscribed" gate before mutating, so a `chatUpdated` event always has a subscriber. The page needs a
 *  `tapStream` installed before its first navigation; `since` is a `frameCursor` taken before the room was opened. */
export async function waitForStreamOpen(page: Page, chatId: ChatId, since: number): Promise<void> {
  await waitForRoomOpened(streamTapOf(page), chatId, since);
}

/** The RAIL's "Characters" nav button, scoped to the Primary navigation. The scoping is load-bearing: the
 *  HOME landing renders its OWN "Characters" list-row tile with the same accessible name, so an unscoped
 *  role+name lookup is a strict-mode violation on any DB whose landing shows the tiles — it went red the day
 *  the e2e stack stopped inheriting the dev DB's data. `exact` also keeps "Collapse Characters panel" out. */
export function charactersRailButton(page: Page): Locator {
  return page.getByRole("navigation", { name: PRIMARY_NAV_NAME }).getByRole("button", { name: SECTION_LABELS.characters, exact: true });
}

/** The RAIL's "Chats" nav button, scoped to the Primary navigation, the same way `charactersRailButton` is.
 *  `exact` keeps "Collapse Chats panel" and the like out. */
function chatsRailButton(page: Page): Locator {
  return page.getByRole("navigation", { name: PRIMARY_NAV_NAME }).getByRole("button", { name: SECTION_LABELS.chats, exact: true });
}

/** Land on the Chats SECTION and wait for its list to settle. The `aria-label="Chats list"` list surface
 *  (chat-list-surface.tsx) MOVED OFF `/` in the owner-approved variant-C home rework (program #102): `/`
 *  is now the Hearth Room hero (masthead + "Pick up where you left off" + "Other rooms" + face shelf), and
 *  the full Chats list lives on the Chats section (`main "Chats content"` + `complementary "Chats list"`),
 *  reached via the Primary rail. Every list-driven helper below routes through here rather than reading a
 *  list off `/` that no longer exists. Reveals a collapsed list through the shell's actual control before
 *  waiting for the list or empty-state — reading the count while the suspense query is in
 *  flight races a false 0. globalSetup guarantees at least one chat, so the list branch is the normal path. */
export async function gotoChatsList(page: Page): Promise<void> {
  await page.goto("/");
  await waitForAppReady(page);
  await openChatsList(page);
}

/** Reach the Chats list through the current document's actual rail and panel controls. */
export async function openChatsList(page: Page): Promise<void> {
  const chatsRail = chatsRailButton(page);
  const closeDetails = page.getByRole("button", { name: CONTEXT_SHEET_BACK_NAME, exact: true });
  const backToChats = page.getByRole("button", { name: sectionBackName(SECTION_LABELS.chats), exact: true });
  const showList = page.getByRole("button", { name: panelEdgeName(LIST_PANEL_NOUN, false), exact: true });
  const chatsList = page.getByRole("list", { name: CHAT_LIST_NAME });
  const emptyState = page.getByText(CHAT_LIST_EMPTY_TITLE);
  if (await closeDetails.isVisible()) {
    await closeDetails.click();
  }
  if (await backToChats.isVisible()) {
    await backToChats.click();
  }
  await expect(chatsRail).toBeVisible({ timeout: WAIT_SHORT_MS });
  await chatsRail.click();
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "chats", { timeout: WAIT_SHORT_MS });
  await expect(chatsList.or(emptyState).or(backToChats).or(showList).first()).toBeVisible({ timeout: WAIT_SHORT_MS });
  if (await backToChats.isVisible()) {
    await backToChats.click();
  }
  if (await showList.isVisible()) {
    await showList.click();
  }
  await expect(chatsList.or(emptyState).first()).toBeVisible({ timeout: WAIT_SHORT_MS });
}

/** Click a character's Chat CTA on a character with no room and return the room `chat.startChat` created. */
async function startChatFrom(page: Page, cta: Locator): Promise<ChatId> {
  const started = page.waitForResponse((candidate) => candidate.url().includes("/api/trpc/chat.startChat"));
  await cta.click();
  const response = await started;
  expect(response.ok()).toBe(true);
  // The click's response is a raw wire observation; read the one field this flow needs and parse its id.
  const data = batchResultData(await response.json())?.data;
  const chat = isPlainObject(data) ? data["chat"] : undefined;
  const rawId = isPlainObject(chat) ? chat["id"] : undefined;
  if (rawId === undefined) {
    throw new Error("chat.startChat returned no chat id");
  }
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME })).toBeVisible({ timeout: WAIT_SURFACE_MS });
  return typeIdSchema(ID_PREFIX.chat).parse(rawId);
}

/** Start a chat with the spec-owned, chatless character `name` from the library, and land in its room. */
export async function openCharacterRoom(page: Page, name: string): Promise<ChatId> {
  await page.goto("/");
  await waitForAppReady(page);
  await charactersRailButton(page).click();
  await page.getByRole("textbox", { name: CHARACTER_SEARCH_NAME, exact: true }).fill(name);
  const cta = page.getByRole("button", { name: chatWithActionName(name), exact: true });
  const row = page.locator('[data-slot="list-row-root"]').filter({ has: cta });
  await expect(row).toBeVisible({ timeout: WAIT_SETTLE_MS });
  await row.hover();
  return await startChatFrom(page, cta);
}

/** Drive the real library→room→send flow to CREATE one listed chat (one real turn). Returns once the user's row
 *  has committed durably. */
async function createChatViaSend(page: Page): Promise<void> {
  const charactersNav = charactersRailButton(page);
  await expect(charactersNav).toBeVisible({ timeout: WAIT_SETTLE_MS });
  await charactersNav.click();

  // The first row's "Chat with <name>" CTA. It is always in the a11y tree, but while hidden it is INERT to the
  // pointer (an invisible control must not be hit-testable), so the ROW is hovered first — a bare click would
  // hang on the actionability check.
  const chatRow = page
    .locator('[data-slot="list-row-root"]')
    .filter({ has: page.getByRole("button", { name: CHARACTER_ROW_CHAT_CTA }) })
    .first();
  await expect(chatRow).toBeVisible({ timeout: WAIT_SETTLE_MS });
  await chatRow.hover();
  const chatId = await startChatFrom(page, chatRow.getByRole("button", { name: CHARACTER_ROW_CHAT_CTA }));
  await sendHeldTurn({ page, chatId }, BOOTSTRAP_MESSAGE);
}

/** Ensure a committed chat exists and OPEN it, landing on the room. Reuses the first existing chat if the
 *  DB already has any (cheap); otherwise bootstraps one via the real send flow (one turn). Leaves the page
 *  in the open room with a live composer. */
export async function openOrCreateChat(page: Page): Promise<void> {
  // The Chats SECTION owns the `aria-label="Chats list"` list surface (chat-list-surface.tsx), suspense-loaded
  // from `chat.listChats` — it moved off `/` in the variant-C home rework (see `gotoChatsList`).
  // `gotoChatsList` settles the list-or-empty-state BEFORE we count rows, so a false 0 can't drop us into
  // the expensive create-via-send path while a chat already exists. globalSetup guarantees ≥1 chat, so the
  // reuse branch is the normal path.
  await gotoChatsList(page);

  const rows = page.getByRole("list", { name: CHAT_LIST_NAME }).getByRole("button");
  if ((await rows.count()) === 0) {
    await createChatViaSend(page);
    return;
  }
  await rows.first().click();
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME })).toBeVisible({ timeout: WAIT_SURFACE_MS });
}

/** The open room a turn is driven in. */
export interface TurnRoom {
  readonly page: Page;
  readonly chatId: ChatId;
}

/** The canon rows one send created. */
export interface SentTurn {
  readonly userId: MessageId;
  readonly assistantId: MessageId;
}

/** A send whose user row has committed and whose reply is still owed. */
export interface HeldTurn {
  readonly userId: MessageId;
  /** Resolves on a NEW assistant row after the user row; retained history never satisfies it. */
  readonly awaitReply: (timeoutMs?: number) => Promise<SentTurn>;
}

async function pollCanon<T>(chatId: ChatId, read: (canon: readonly CanonMessage[]) => T | undefined, message: string, timeout: number): Promise<T> {
  let found: T | undefined;
  await expect
    .poll(
      async () => {
        found = read(await listCanon(chatId));
        return found !== undefined;
      },
      { message, timeout },
    )
    .toBe(true);
  if (found === undefined) {
    throw new Error(message);
  }
  return found;
}

/** Witness the turn `trigger` sends: canon is read first, so only a row this send created can satisfy it. The sent row
 *  is checked again when the reply lands, because a second send can land after the first row is seen. */
export async function witnessTurn(room: TurnRoom, content: string, trigger: () => Promise<void>, userRowTimeoutMs: number = WAIT_SETTLE_MS): Promise<HeldTurn> {
  const before = await listCanon(room.chatId);
  await trigger();
  await pollCanon(
    room.chatId,
    (canon) => newUserRows(before, canon, content)[0],
    `no new user row with the sent content in ${room.chatId}: ${content}`,
    userRowTimeoutMs,
  );
  const userId = soleUserRow(before, await listCanon(room.chatId), content);
  return {
    userId,
    awaitReply: async (timeoutMs = WAIT_LIVE_TURN_MS): Promise<SentTurn> => {
      const assistantId = await pollCanon(
        room.chatId,
        (canon) => newReplyRow(before, canon, userId),
        `no new assistant row after ${userId} in ${room.chatId}`,
        timeoutMs,
      );
      soleUserRow(before, await listCanon(room.chatId), content);
      return { userId, assistantId };
    },
  };
}

// A lost controlled value fails here instead of being retyped.
async function typeMessage(page: Page, message: string): Promise<{ readonly composer: Locator; readonly input: Locator }> {
  const composer = page.getByRole("group", { name: CHAT_COMPOSER_NAME, exact: true });
  const input = composer.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
  await expect(input).toBeEditable({ timeout: WAIT_SETTLE_MS });
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.press("Delete");
  await input.pressSequentially(message, { delay: 15 });
  await expect(input).toHaveValue(message, { timeout: WAIT_SETTLE_MS });
  return { composer, input };
}

// The Send button sends under either `enterSends` preference; plain Enter would insert a newline under one of them.
async function typeAndSubmit(page: Page, message: string): Promise<void> {
  const { composer } = await typeMessage(page, message);
  await composer.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
}

/** Send through the composer and return once the new user row committed. The reply stays owed, for a case that
 *  watches or holds it: the ghost, Stop, a scripted provider's held stream. */
export async function sendHeldTurn(room: TurnRoom, message: string, userRowTimeoutMs?: number): Promise<HeldTurn> {
  return await witnessTurn(room, message, () => typeAndSubmit(room.page, message), userRowTimeoutMs);
}

/** Send by pressing `key` in the composer, the gesture the other drivers leave to the Send button. The `enterSends`
 *  preference decides whether `key` sends: a key that only inserts a newline rejects with "no new user row". */
export async function sendByKey(room: TurnRoom, message: string, key: string, userRowTimeoutMs?: number): Promise<HeldTurn> {
  return await witnessTurn(
    room,
    message,
    async () => {
      const { input } = await typeMessage(room.page, message);
      await input.press(key);
    },
    userRowTimeoutMs,
  );
}

/** Send through the composer and return the ids of the new user row and its reply. */
export async function sendAndAwaitReply(room: TurnRoom, message: string): Promise<SentTurn> {
  return await (await sendHeldTurn(room, message)).awaitReply();
}

/** Navigate to `/` and open the NEWEST chat (the first Chats-list row — the list is desc(updatedAt), and a
 *  just-created chat is newest). The room's composer is live on return. Used by specs that SELF-SEED a fresh
 *  chat via the API (startChat) and then need to drive it in the UI — a fresh, short-transcript chat renders
 *  ALL its rows (no virtualization), so DOM↔canon full-length parity is deterministic. */
export async function openNewestChat(page: Page): Promise<void> {
  await gotoChatsList(page);
  const rows = page.getByRole("list", { name: CHAT_LIST_NAME }).getByRole("button");
  await expect(rows.first()).toBeVisible({ timeout: CHAT_SURFACE_TIMEOUT });
  await rows.first().click();
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME })).toBeVisible({ timeout: WAIT_SURFACE_MS });
}

/** Open the active chat's ⋯ options menu — since D111's relocation (owner ruling 2026-08-09) it is the
 *  COMPOSER's left-gutter control (`composer-chat-options.tsx`), its one home; the topbar trail widget is
 *  gone. Still opened via KEYBOARD (focus + Enter): keyboard activation bypasses hit-testing, which is the
 *  posture that survived the move as well as it served the old topbar mount. */
export async function openChatOptions(page: Page): Promise<void> {
  const options = page.getByRole("button", { name: CHAT_OPTIONS_NAME });
  await expect(options).toBeVisible({ timeout: WAIT_SURFACE_MS });
  await options.focus();
  await options.press("Enter");
}

/** Open the composer's ✨ UTILITY menu (composer-utility-menu.tsx — the wand-v2 home of Recover input /
 *  Corrections / Regenerate / Simple send / Undo · Revert / images / plot steers, D111 §3). Its trigger is
 *  a plain composer-bar button, so a pointer click lands it (nothing overlays the composer row). */
export async function openUtilityMenu(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: MESSAGE_TOOLS_LABEL });
  await expect(trigger).toBeVisible({ timeout: WAIT_SURFACE_MS });
  await trigger.click();
}

/** Rename the OPEN chat via the ⋯ menu → Rename dialog → Save. Waits on the real `chat.updateChatTitle`
 *  round-trip so a subsequent reload reads DB truth, not an in-flight write. */
export async function renameOpenChat(page: Page, title: string): Promise<void> {
  await openChatOptions(page);
  await page.getByRole("menuitem", { name: ROW_RENAME_NAME }).click();
  const input = page.getByRole("textbox", { name: CHAT_TITLE_FIELD_NAME });
  await expect(input).toBeVisible();
  await input.fill(title);
  const resp = page.waitForResponse((r) => r.url().includes("/api/trpc/chat.updateTitle") && r.status() < 500);
  await page.getByRole("button", { name: DIALOG_VERBS.save }).click();
  await resp;
}

/** Rename the FIRST chat via its LIST-ROW kebab (chat-list-row-menu.tsx) — no room navigation. The kebab
 *  is opened via keyboard (the row-body <button> overlaps + intercepts pointer clicks). Waits on the real
 *  `chat.updateTitle` round-trip. Used by the list-only (SHAPE A) multi-tab proof. */
export async function renameFirstChatViaRowKebab(page: Page, title: string): Promise<void> {
  const kebab = page.getByRole("button", { name: "Chat actions" }).first();
  await expect(kebab).toBeVisible({ timeout: WAIT_SURFACE_MS });
  await kebab.focus();
  await kebab.press("Enter");
  await page.getByRole("menuitem", { name: ROW_RENAME_NAME }).click();
  const input = page.getByRole("textbox", { name: CHAT_TITLE_FIELD_NAME });
  await expect(input).toBeVisible();
  await input.fill(title);
  const resp = page.waitForResponse((r) => r.url().includes("/api/trpc/chat.updateTitle") && r.status() < 500);
  await page.getByRole("button", { name: DIALOG_VERBS.save }).click();
  await resp;
}

// ── GROUP-ROOM helpers (group-chat.spec.ts · multi-tab-room-sync.spec.ts). Orb has NO `/chat/$id` URL, so
// the ONLY way to put a page (or a SECOND page in the same context) into a specific room is to click that
// chat's LIST row — which is why every group/hub spec self-seeds a UNIQUELY-titled chat and opens it BY
// TITLE. The group surfaces are roster-size-gated by construction (chats-section.tsx): the Character bar renders
// only above 1 character, and the Members/Group CONTEXT tabs only when the room is a group (>1 character)
// — so their PRESENCE is a behavioral assertion about the roster, never a layout claim. ──

const CHARACTER_BAR = '[aria-label="Characters"]';
const CHARACTER_CHIP = '[data-slot="character-chip"]';

/** Navigate to `/` and open the chat whose LIST row carries `title` (the row's accessible name leads with
 *  it). The room's composer is live on return. Titles are minted unique per spec, so the match is
 *  unambiguous on the shared DB. */
export async function openChatByTitle(page: Page, title: string): Promise<void> {
  await gotoChatsList(page);
  const search = page.getByRole("textbox", { name: CHAT_SEARCH_NAME, exact: true });
  if (!(await search.isVisible())) {
    await page.getByRole("button", { name: sectionBackName(SECTION_LABELS.chats), exact: true }).click();
  }
  await search.fill(title);
  const row = page.getByRole("list", { name: CHAT_LIST_NAME }).getByRole("button", { name: title }).first();
  await expect(row).toBeVisible({ timeout: CHAT_SURFACE_TIMEOUT });
  await row.click();
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME })).toBeVisible({ timeout: WAIT_SURFACE_MS });
}

/** Expand the CONTEXT (detail) panel if it is collapsed — the ONE toggle is the pane's
 *  edge control (`PanelEdges`) on a desktop and the topbar `ContextToggle` on a phone, whose label states the
 *  action it performs. Idempotent. */
export async function openDetailPanel(page: Page): Promise<void> {
  const show = page.getByRole("button", { name: contextToggleLabel(true) });
  if ((await show.count()) > 0) {
    await show.first().click();
  }
  // The panel is the context BRACKET in every room: the "Chat" header TABLIST of real tabs (the pane's one tab
  // strip), plus the "Game state" toolbar under it on a game chat. The "Chat" tablist is what means "the panel
  // is open" for a plain chat and a game chat alike.
  const strip = page.getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME });
  await expect(strip.first()).toBeVisible({ timeout: WAIT_SURFACE_MS });
}

/** Select one CONTEXT tab by its visible label (Members / This chat / Status / …). Assumes the detail
 *  panel is already open (`openDetailPanel`).
 *
 *  A meta tab is a `tab` in the header tablist named "Chat"; a game state cell is a BUTTON carrying
 *  `aria-current` in the toolbar named "Game state". Exact-name matched, so the lookup cannot widen onto some
 *  other control that merely contains the label.
 *
 *  The `.or()` wraps the FULL PATH of each arm (container→control), not just the container (#2251): chaining
 *  a lookup onto an `.or()` union searches only the first-matched branch.
 */
export async function openContextTab(page: Page, label: string): Promise<void> {
  const tab = page
    .getByRole("tablist", { name: CHAT_CONTEXT_TABLIST_NAME })
    .getByRole("tab", { name: label, exact: true })
    .or(page.getByRole("toolbar", { name: GAME_STRIP_LABEL }).getByRole("button", { name: label, exact: true }));
  await expect(tab).toBeVisible({ timeout: WAIT_SURFACE_MS });
  await tab.click();
}

/** Open the group-behavior controls. Since the panel-redesign consolidation there is NO "Group" TAB: the
 *  former Group tab is a host+group-gated SECTION ("Group behavior") inside the ONE "This chat" tab
 *  (chats-section.tsx `settings` → settings-context-tab.tsx — the §8.1 permission-omit moved from tab to
 *  section granularity). Gates on the section's real h3, so a caller acting on its controls can't race the
 *  suspended group-config read.
 *
 *  AND THE TAB IS AN INDEX OF DISCLOSURES (#830, `545e28ff60`) — a closed Base UI panel is REMOVED from the
 *  DOM, not merely hidden, so the section's heading does not exist until its band is pressed. Group behavior
 *  lives inside the host-ops band, which is the one section that defaults CLOSED while its own children stay
 *  open, so ONE press reaches it. Skipping that walk is what made this helper's heading gate fail with
 *  `element(s) not found` in four specs (#1851); the walker itself is the CT side's, shared. */
export async function openGroupBehaviorSection(page: Page): Promise<void> {
  await openContextTab(page, CHAT_CONTEXT_TAB_LABELS.settings);
  await openContextSections(page, HOST_BAND, CHAT_GROUP_BEHAVIOR_NAME);
  await expect(page.getByRole("heading", { name: CHAT_GROUP_BEHAVIOR_NAME })).toBeVisible({ timeout: WAIT_SURFACE_MS });
  // The section body suspends on `chat.getGroupConfig` behind a skeleton, so the HEADING lands before any
  // control exists. Gate on the reply-mode toggle — the first control of the resolved form — or a caller
  // acting immediately races the skeleton.
  await expect(page.getByRole("button", { name: GROUP_OUTPUT_LABELS["per-speaker"], exact: true })).toBeVisible({ timeout: WAIT_SURFACE_MS });
}

/** The character bar's chip locator (chat-character-bar.tsx) — one chip per PRESENT character, and the whole bar is
 *  absent below 2 characters. `characterChipNames` reads the rendered roster; `characterChip` targets one member.
 *  The room renders the strip twice; the copy inside a short room's transcript is a pointer-only twin hidden from
 *  assistive tech, so the copy that names the cast in every regime is the one counted. */
export function characterChips(page: Page): ReturnType<Page["locator"]> {
  return page.locator(`${CHARACTER_BAR}:not([aria-hidden="true"]) ${CHARACTER_CHIP}`);
}

/** The rendered character-bar member names (empty when the bar isn't mounted — a solo room). A chip holds the
 *  avatar initials and then the screen-reader name, so the name is the chip's last element. It is read with
 *  `textContent`, the accessibility-tree read, because the name is `sr-only` and a layout-aware read can drop it. */
export async function characterChipNames(page: Page): Promise<readonly string[]> {
  const texts = await characterChips(page).evaluateAll((chips) => chips.map((chip) => chip.lastElementChild?.textContent.trim() ?? ""));
  return texts.filter((name) => name.length > 0);
}

/** Open one Members-row action menu (member-row.tsx's trailing ⋯, `Actions for <name>`) — the canonical
 *  action home for Mute / Talkativeness… / Make X speak next / Remove X from chat. */
export async function openMemberRowMenu(page: Page, displayName: string): Promise<void> {
  const kebab = page.getByRole("button", { name: rowActionsName(displayName), exact: true });
  await expect(kebab).toBeVisible({ timeout: WAIT_SURFACE_MS });
  await kebab.click();
}

/** Re-open the FIRST chat in the LIST after a reload: re-navigate to the Chats section (`gotoChatsList`),
 *  land on the row, and return once the room's composer is live again. orb has no `/chat/$id` URL, so the
 *  only address of a room is the list row; the in-memory Query cache does NOT survive a reload, so whatever
 *  the room renders afterwards was read from the server — which is the persistence proof the callers want.
 *
 *  THE ACTIVE CHAT IS RESTORED ON RELOAD, AND ASSUMING OTHERWISE IS #1846. This helper used to state that
 *  "a reload returns to the landing state" and unconditionally click `rows.first()`. That premise is false
 *  on the tree: `active-chat-store.ts` is a `createPersistedStore` whose `partialize` keeps `handle`, and
 *  its migrate restores any valid COMMITTED handle — so after `page.reload()` the room is already open and
 *  its list row is already `aria-current="true"`. The click was therefore a no-op that the layout is free
 *  to make UNHITTABLE (the room pane overlays the list at the narrow step), and Playwright's actionability
 *  retry then burned the whole 60 s test budget waiting for a click nobody needed — observed once in the
 *  2026-09-06 `--push` run and once on an immediate solo re-run, with the error-context snapshot showing
 *  exactly that state (first row `data-selected` + `aria-current`, Message textbox already in the tree).
 *  So: click only when the row is NOT already current, and barrier on the composer either way. */
export async function reopenFirstChat(page: Page): Promise<void> {
  await gotoChatsList(page);
  const rows = page.getByRole("list", { name: CHAT_LIST_NAME }).getByRole("button");
  const first = rows.first();
  await expect(first).toBeVisible({ timeout: WAIT_SURFACE_MS });
  if ((await first.getAttribute("aria-current")) !== "true") {
    await first.click();
  }
  await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME })).toBeVisible({ timeout: WAIT_SURFACE_MS });
}
