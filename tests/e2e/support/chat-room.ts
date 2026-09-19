// Shared e2e helpers for the chat-room persistence/sync ports (chat-persistence · multi-tab-sync ·
// event-sequence · injection-roundtrip). Orb has NO zero-cost "create committed chat" affordance: a draft
// only commits on first `send` (use-send-message.ts → chat.startChat then chat.send), and startChat seeds
// the character's greeting (assistant rows, no model call) while the send fires ONE real turn. So the
// cheapest way to guarantee a committed chat is: reuse an existing one if the DB already has any, else
// drive the real start-chat+send flow ONCE (the exemplar start-chat-with-character.spec.ts pattern). Under
// serial `workers:1`, the first spec that bootstraps pays the turn cost and the rest reuse the row.
//
// SELECTOR STRATEGY (orb has no neo-style chat testids — verified against the live client source):
//   • chat LIST rows are native <button>s (@orb/ui/list-row clickable), accessible name = the chat title.
//   • the topbar chat identity (chat-header.tsx) renders the title as a <Text size="title"> SPAN, not a
//     heading — there is no <h1> and no heading role in orb (neo's `locator("h1")` does not port). Title
//     persistence is asserted on a UNIQUE minted title (timestamped), so `getByText(newTitle)` being
//     visible is unambiguous proof regardless of the list-vs-header duplication.
//   • Rename/Star live behind the ⋯ "Chat options" menu (chat-options-menu.tsx) + the per-row kebab "Chat
//     actions" menu (chat-list-row-menu.tsx). Rename opens a Dialog with an `aria-label="Chat title"` input.
//   • stream-open is observed via the DEV `window.__orb.bus().live` count (agent-bridge.ts) — vite serves
//     the e2e app in dev mode so the handle exists; orb has no `chat-stream-state` testid.

import type { MessageId } from "@orb/kit/ids";
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { HOST_BAND, openContextSections } from "../../support/node/open-context-sections.ts";

// The character row's chat affordance (character-card.tsx `NormalRowActions`): the dual-purpose resume-or-new
// Chat CTA. Each row exposes a `aria-label="Chat with <name>"` button — visually hover-revealed on fine
// pointers, but ALWAYS present in the accessibility tree (verified via `pnpm snap --aria` on the live client
// 2026-07-24), so a role/name locator hits it at every width. This is the exemplar path
// (start-chat-with-character.spec.ts, commit 34d1829a). The stale kebab→"Chat" menuitem flow is dead — this
// client's row kebab ("Actions for <name>") carries only Archive/Duplicate/Delete, NO "Chat" item.
const CHARACTER_ROW_CHAT_CTA = /^Chat with /u;
const APP_READY = "html[data-app-ready]";
const BOOTSTRAP_MESSAGE = "Hi";
// The first lazy Chats route can trigger Vite dependency optimization after the boot shell has already
// marked itself ready. Vite then reloads the page and compiles the route graph; the cold push-gate receipt
// measured 42s before the list appeared. This budget stays below the spec's 60s ceiling while covering
// that one-time dev-server restart. Warm navigation remains immediate.
const COLD_CHAT_SURFACE_TIMEOUT = 45_000;

// The dev introspection handle's shape, as read from inside a browser-context `page.evaluate`. Declared
// locally (not imported from the client's ambient `declare global`) — the e2e support tree stays
// import-free of the package trees on purpose. `__orb` is a dev-only global no lib declares, so the
// direct cast (all-optional target — always assignable) is the one sanctioned bridge to it.
interface OrbBusHandle {
  readonly __orb?: {
    readonly bus: () => {
      readonly live: number;
      readonly events: ReadonlyArray<{ readonly type: string }>;
    };
  };
}

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

/** The live SSE-subscription count off the dev handle (0 if the handle isn't installed yet). */
export function busLive(page: Page): Promise<number> {
  return page.evaluate(() => (globalThis as OrbBusHandle).__orb?.bus().live ?? 0);
}

/** The recent bus-event types the client has reduced (dev introspection ring; empty if not installed). */
export function busEventTypes(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (globalThis as OrbBusHandle).__orb?.bus().events.map((e) => e.type) ?? []);
}

/** Wait for the app shell + its initial reads to settle (the app-ready idle signal). */
export async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.locator(APP_READY)).toBeAttached({ timeout: 30_000 });
}

/** Poll until the room's chat-bus SSE stream is observably open (≥1 live subscription via the dev
 *  introspection handle) — the deterministic "subscribed" gate before mutating, so a `chatUpdated` event
 *  always has a subscriber (no race; the orb equivalent of neo's `chat-stream-state` == "open"). */
export async function waitForStreamOpen(page: Page): Promise<void> {
  await expect.poll(async (): Promise<number> => busLive(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
}

/** The RAIL's "Characters" nav button, scoped to the Primary navigation. The scoping is load-bearing: the
 *  HOME landing renders its OWN "Characters" list-row tile with the same accessible name, so an unscoped
 *  role+name lookup is a strict-mode violation on any DB whose landing shows the tiles — it went red the day
 *  the e2e stack stopped inheriting the dev DB's data. `exact` also keeps "Collapse Characters panel" out. */
export function charactersRailButton(page: Page): Locator {
  return page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Characters", exact: true });
}

/** The RAIL's "Chats" nav button, scoped to the Primary navigation. Scoping is load-bearing the same way
 *  `charactersRailButton` is: the variant-C HOME (program #102) renders its OWN "Chats" section-jump tile
 *  with the same accessible name, so an unscoped role+name lookup is a strict-mode violation on the home
 *  surface. `exact` keeps "Collapse Chats panel" and the like out. */
function chatsRailButton(page: Page): Locator {
  return page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Chats", exact: true });
}

/** Land on the Chats SECTION and wait for its list to settle. The `aria-label="Chats list"` list surface
 *  (chat-list-surface.tsx) MOVED OFF `/` in the owner-approved variant-C home rework (program #102): `/`
 *  is now the Hearth Room hero (masthead + "Pick up where you left off" + "Other rooms" + face shelf), and
 *  the full Chats list lives on the Chats section (`main "Chats content"` + `complementary "Chats list"`),
 *  reached via the Primary rail. Every list-driven helper below routes through here rather than reading a
 *  list off `/` that no longer exists. Waits for the `aria-label="Chats list"` list OR the "No chats yet"
 *  empty-state to settle BEFORE the caller counts rows — reading the count while the suspense query is in
 *  flight races a false 0. globalSetup guarantees >=1 chat, so the list branch is the normal path. */
export async function gotoChatsList(page: Page): Promise<void> {
  await page.goto("/");
  await waitForAppReady(page);
  const chatsRail = chatsRailButton(page);
  const chatsList = page.getByRole("list", { name: "Chats list" });
  const emptyState = page.getByText("No chats yet");
  // COLD-BOOT RESILIENCE (the reason this is a retry loop, not a bare click). The FIRST navigation into the
  // lazy Chats route can trigger a Vite dependency re-optimization that RELOADS the page AFTER `data-app-ready`
  // already fired (same mechanism the COLD_CHAT_SURFACE_TIMEOUT budget documents) — which silently drops a
  // one-shot rail click and lands the caller back on the home surface. So poll: (re-)click the rail and
  // confirm the list surface settled; a mid-boot reload just re-enters the loop. Warm navigation clicks once.
  await expect(async () => {
    await chatsRail.click({ timeout: 5000 });
    await expect(chatsList.or(emptyState).first()).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: COLD_CHAT_SURFACE_TIMEOUT });
}

/** Drive the real library→draft→send flow to CREATE one committed chat (one real turn). Returns once the
 *  user's row has committed durably (the chat row exists in the DB from that point). */
async function createChatViaSend(page: Page): Promise<void> {
  const charactersNav = charactersRailButton(page);
  await expect(charactersNav).toBeVisible({ timeout: 30_000 });
  await charactersNav.click();

  // The first row's "Chat with <name>" CTA — the resume-or-new library→chat seam (the exemplar path). It is
  // always in the a11y tree, but while hidden it is INERT to the pointer (an invisible control must not be
  // hit-testable), so the ROW is hovered first — a bare click would hang on the actionability check.
  const chatRow = page
    .locator('[data-slot="list-row-root"]')
    .filter({ has: page.getByRole("button", { name: CHARACTER_ROW_CHAT_CTA }) })
    .first();
  await expect(chatRow).toBeVisible({ timeout: 30_000 });
  await chatRow.hover();
  await chatRow.getByRole("button", { name: CHARACTER_ROW_CHAT_CTA }).click();

  const composer = page.getByRole("textbox", { name: "Message" });
  await expect(composer).toBeVisible();
  await composer.pressSequentially(BOOTSTRAP_MESSAGE);
  await composer.press("Enter");

  // The user's row committing == the draft was promoted to a real chat row (chat.startChat resolved).
  const userRow = page.locator('[data-slot="message-row"][data-role="user"]');
  await expect(userRow.first()).toContainText(BOOTSTRAP_MESSAGE, { timeout: 60_000 });
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

  const rows = page.getByRole("list", { name: "Chats list" }).getByRole("button");
  if ((await rows.count()) === 0) {
    await createChatViaSend(page);
    return;
  }
  await rows.first().click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
}

// The typeAndSend retry ledger — a module counter incremented once per EXTRA typing attempt (0 = the text
// landed on the first pass, the healthy case now that #13 is fixed at source). It exists so an
// anti-regression spec can pin zero-retry instant typing WITHOUT changing typeAndSend's behavior: the
// helper still retries (belt, for any residual settle jitter), but a resurfaced remount would push this
// above zero. Read it via `takeTypeAndSendRetries()` (reads + resets), so each assertion scopes to its own
// call.
let typeAndSendRetries = 0;

/** Read-and-reset the retry counter accumulated by `typeAndSend` since the last read. */
export function takeTypeAndSendRetries(): number {
  const n = typeAndSendRetries;
  typeAndSendRetries = 0;
  return n;
}

/** Type a message into the OPEN room's composer and send it (Enter). `fill` is unusable (it bypasses React's
 *  onChange so the controlled value never updates), and a raw pressSequentially FLAKES: the composer re-mounts
 *  when the room's initial reads / an SSE event settle mid-type, dropping focus + every keystroke after the
 *  first (verified live: "Reply…" left the textarea at just "R"). So RETRY: focus → clear → type → verify the
 *  controlled value STUCK; if a re-mount ate it, the composer is now settled and the retry lands cleanly. The
 *  retry LEDGER (`takeTypeAndSendRetries`) exposes whether a retry was actually needed — #13's fix should
 *  keep it at zero (instant typing survives room settle). Behavior is unchanged: the poll still retries. */
export async function typeAndSend(composer: ReturnType<Page["getByRole"]>, message: string): Promise<void> {
  let attempt = 0;
  await expect
    .poll(
      async (): Promise<string> => {
        // Every pass after the first is a retry — count it BEFORE the attempt so a mid-type remount that
        // never lets the value stick still registers as a retry (the poll re-enters).
        if (attempt > 0) {
          typeAndSendRetries += 1;
        }
        attempt += 1;
        await composer.click();
        await composer.press("ControlOrMeta+A");
        await composer.press("Delete");
        await composer.pressSequentially(message, { delay: 15 });
        return composer.inputValue();
      },
      { timeout: 30_000, intervals: [250] },
    )
    .toBe(message);
  await composer.press("Enter");
}

/** Navigate to `/` and open the NEWEST chat (the first Chats-list row — the list is desc(updatedAt), and a
 *  just-created chat is newest). The room's composer is live on return. Used by specs that SELF-SEED a fresh
 *  chat via the API (startChat) and then need to drive it in the UI — a fresh, short-transcript chat renders
 *  ALL its rows (no virtualization), so DOM↔canon full-length parity is deterministic. */
export async function openNewestChat(page: Page): Promise<void> {
  await gotoChatsList(page);
  const rows = page.getByRole("list", { name: "Chats list" }).getByRole("button");
  await expect(rows.first()).toBeVisible({ timeout: COLD_CHAT_SURFACE_TIMEOUT });
  await rows.first().click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
}

/** Open the active chat's ⋯ options menu — since D111's relocation (owner ruling 2026-08-09) it is the
 *  COMPOSER's left-gutter control (`composer-chat-options.tsx`), its one home; the topbar trail widget is
 *  gone. Still opened via KEYBOARD (focus + Enter): keyboard activation bypasses hit-testing, which is the
 *  posture that survived the move as well as it served the old topbar mount. */
export async function openChatOptions(page: Page): Promise<void> {
  const options = page.getByRole("button", { name: "Chat options" });
  await expect(options).toBeVisible({ timeout: 15_000 });
  await options.focus();
  await options.press("Enter");
}

/** Open the composer's ✨ UTILITY menu (composer-utility-menu.tsx — the wand-v2 home of Recover input /
 *  Corrections / Regenerate / Simple send / Undo · Revert / images / plot steers, D111 §3). Its trigger is
 *  a plain composer-bar button, so a pointer click lands it (nothing overlays the composer row). */
export async function openUtilityMenu(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: "Message tools" });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
}

/** Rename the OPEN chat via the ⋯ menu → Rename dialog → Save. Waits on the real `chat.updateChatTitle`
 *  round-trip so a subsequent reload reads DB truth, not an in-flight write. */
export async function renameOpenChat(page: Page, title: string): Promise<void> {
  await openChatOptions(page);
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByRole("textbox", { name: "Chat title" });
  await expect(input).toBeVisible();
  await input.fill(title);
  const resp = page.waitForResponse((r) => r.url().includes("/api/trpc/chat.updateTitle") && r.status() < 500);
  await page.getByRole("button", { name: "Save" }).click();
  await resp;
}

/** Rename the FIRST chat via its LIST-ROW kebab (chat-list-row-menu.tsx) — no room navigation. The kebab
 *  is opened via keyboard (the row-body <button> overlaps + intercepts pointer clicks). Waits on the real
 *  `chat.updateTitle` round-trip. Used by the list-only (SHAPE A) multi-tab proof. */
export async function renameFirstChatViaRowKebab(page: Page, title: string): Promise<void> {
  const kebab = page.getByRole("button", { name: "Chat actions" }).first();
  await expect(kebab).toBeVisible({ timeout: 15_000 });
  await kebab.focus();
  await kebab.press("Enter");
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByRole("textbox", { name: "Chat title" });
  await expect(input).toBeVisible();
  await input.fill(title);
  const resp = page.waitForResponse((r) => r.url().includes("/api/trpc/chat.updateTitle") && r.status() < 500);
  await page.getByRole("button", { name: "Save" }).click();
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
  const row = page.getByRole("list", { name: "Chats list" }).getByRole("button", { name: title }).first();
  await expect(row).toBeVisible({ timeout: COLD_CHAT_SURFACE_TIMEOUT });
  await row.click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
}

/** Expand the CONTEXT (detail) panel if it is collapsed — the ONE toggle is the topbar
 *  `ContextToggle` (context-toggle.tsx), whose label states the action it performs. Idempotent. */
export async function openDetailPanel(page: Page): Promise<void> {
  const show = page.getByRole("button", { name: "Show details" });
  if ((await show.count()) > 0) {
    await show.first().click();
  }
  // The panel is the context BRACKET in every room (#860, Context-Panel-Program §4.2): the "Chat" meta rail
  // — a TOOLBAR of buttons carrying `aria-current` (#112) — pinned to the pane's foot, plus the "Game state"
  // rail above the viewport on a game chat. The "Chat" rail is what means "the panel is open" for a plain
  // chat and a game chat alike.
  const strip = page.getByRole("toolbar", { name: "Chat" });
  await expect(strip.first()).toBeVisible({ timeout: 15_000 });
}

/** Select one CONTEXT tab by its visible label (Members / This chat / Status / …). Assumes the detail
 *  panel is already open (`openDetailPanel`).
 *
 *  ONE affordance in every room (#860): a rail cell is a BUTTON carrying `aria-current` (#112), inside a
 *  toolbar named "Chat" or "Game state". Exact-name matched, so the lookup cannot widen onto some other
 *  control that merely contains the label; scoped to the rails so a body button named like a tab (the
 *  band's "Members — N" chip is `exact`-safe already) can never be seated as the cell.
 *
 *  The `.or()` wraps the FULL PATH (toolbar→button), not just the toolbar (#2251): chaining
 *  `.getByRole("button", …)` on a two-toolbar `.or()` union hangs when the first-matched toolbar
 *  does not contain the target button — Playwright's `.or()` resolves to the first match, so the
 *  chained lookup searches only that branch. Distributing the button lookup into each arm ensures the
 *  locator resolves in GAME rooms (two rails) and plain chats (one rail) alike. */
export async function openContextTab(page: Page, label: string): Promise<void> {
  const tab = page
    .getByRole("toolbar", { name: "Chat" })
    .getByRole("button", { name: label, exact: true })
    .or(page.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: label, exact: true }));
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
}

/** Open the group-behavior controls. Since the panel-redesign consolidation there is NO "Group" TAB: the
 *  former Group tab is a host+group-gated SECTION ("Group behavior") inside the ONE "This chat" tab
 *  (chats-section.tsx `settings` → settings-context-tab.tsx — the §8.1 permission-omit moved from tab to
 *  section granularity). Gates on the section's real h3, so a caller acting on its controls can't race the
 *  suspended group-config read.
 *
 *  AND THE TAB IS AN INDEX OF DISCLOSURES (#830, `195085e2c`) — a closed Base UI panel is REMOVED from the
 *  DOM, not merely hidden, so the section's heading does not exist until its band is pressed. Group behavior
 *  lives inside the host-ops band, which is the one section that defaults CLOSED while its own children stay
 *  open, so ONE press reaches it. Skipping that walk is what made this helper's heading gate fail with
 *  `element(s) not found` in four specs (#1851); the walker itself is the CT side's, shared. */
export async function openGroupBehaviorSection(page: Page): Promise<void> {
  await openContextTab(page, "This chat");
  await openContextSections(page, HOST_BAND, "Group behavior");
  await expect(page.getByRole("heading", { name: "Group behavior" })).toBeVisible({ timeout: 15_000 });
  // The section body suspends on `chat.getGroupConfig` behind a skeleton, so the HEADING lands before any
  // control exists. Gate on the reply-mode toggle — the first control of the resolved form — or a caller
  // acting immediately races the skeleton.
  await expect(page.getByRole("button", { name: "Per-speaker", exact: true })).toBeVisible({ timeout: 15_000 });
}

/** The character bar's chip locator (chat-character-bar.tsx) — one chip per PRESENT character, and the whole bar is
 *  absent below 2 characters. `characterChipNames` reads the rendered roster; `characterChip` targets one member. */
export function characterChips(page: Page): ReturnType<Page["locator"]> {
  return page.locator(`${CHARACTER_BAR} ${CHARACTER_CHIP}`);
}

/** The rendered character-bar member names (empty when the bar isn't mounted — a solo room). A chip's text is
 *  `<avatar initials>\n<display name>`, so the NAME is its last non-empty line.
 *
 *  FINE-POINTER ONLY, and that is now load-bearing (#511): the strip's names are `pointer-coarse:sr-only`,
 *  and `allInnerTexts` is LAYOUT-aware — an sr-only name reads as empty, so this helper would report an
 *  empty roster on any coarse-pointer project rather than failing loudly. The e2e config is
 *  `devices["Desktop Chrome"]` (playwright.config.ts) so today every run is fine-pointer; a mobile project
 *  added here must read the names off `textContent` (the accessibility-tree read) instead. */
export async function characterChipNames(page: Page): Promise<readonly string[]> {
  const texts = await characterChips(page).allInnerTexts();
  return texts
    .map(
      (text) =>
        text
          .split("\n")
          .map((line) => line.trim())
          .findLast((line) => line.length > 0) ?? "",
    )
    .filter((name) => name.length > 0);
}

/** Open one Members-row action menu (member-row.tsx's trailing ⋯, `Actions for <name>`) — the canonical
 *  action home for Mute / Talkativeness… / Make X speak next / Remove X from chat. */
export async function openMemberRowMenu(page: Page, displayName: string): Promise<void> {
  const kebab = page.getByRole("button", { name: `Actions for ${displayName}`, exact: true });
  await expect(kebab).toBeVisible({ timeout: 15_000 });
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
  const rows = page.getByRole("list", { name: "Chats list" }).getByRole("button");
  const first = rows.first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  if ((await first.getAttribute("aria-current")) !== "true") {
    await first.click();
  }
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
}
