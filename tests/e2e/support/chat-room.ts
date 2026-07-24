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

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

// The character row's chat affordance (character-card.tsx `NormalRowActions`): the dual-purpose resume-or-new
// Chat CTA. Each row exposes a `aria-label="Chat with <name>"` button — visually hover-revealed on fine
// pointers, but ALWAYS present in the accessibility tree (verified via `pnpm snap --aria` on the live client
// 2026-07-24), so a role/name locator hits it at every width. This is the exemplar path
// (start-chat-with-character.spec.ts, commit 34d1829a). The stale kebab→"Chat" menuitem flow is dead — this
// client's row kebab ("Actions for <name>") carries only Archive/Duplicate/Delete, NO "Chat" item.
const CHARACTER_ROW_CHAT_CTA = /^Chat with /u;
const APP_READY = "html[data-app-ready]";
const BOOTSTRAP_MESSAGE = "Hi";

// The dev introspection handle's shape, as read from inside a browser-context `page.evaluate`. Declared
// locally (not imported from the client's ambient `declare global`) because the e2e tsconfig is a DOM-less
// NODE program (tsconfig.json — it excludes the browser `.tsx` trees + carries no lib.dom), so neither the
// client's `globalThis.__orb` augmentation nor `window`/`document` are in scope here. This plain object
// type needs no DOM lib, so it typechecks; the cast is the sanctioned bridge across that boundary.
interface OrbBusHandle {
  readonly __orb?: {
    readonly bus: () => {
      readonly live: number;
      readonly events: ReadonlyArray<{ readonly type: string }>;
    };
  };
}

/** The live SSE-subscription count off the dev handle (0 if the handle isn't installed yet). */
export function busLive(page: Page): Promise<number> {
  // FABRICATION-OK: bridge to the real dev `__orb` global; the e2e tsconfig is DOM-less so the type isn't visible.
  return page.evaluate(() => (globalThis as unknown as OrbBusHandle).__orb?.bus().live ?? 0);
}

/** The recent bus-event types the client has reduced (dev introspection ring; empty if not installed). */
export function busEventTypes(page: Page): Promise<readonly string[]> {
  return page.evaluate(
    // FABRICATION-OK: bridge to the real dev `__orb` global (DOM-less e2e tsconfig).
    () => (globalThis as unknown as OrbBusHandle).__orb?.bus().events.map((e) => e.type) ?? [],
  );
}

/** Wait for the app shell + its initial reads to settle (the agent-bridge idle signal). */
export async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.locator(APP_READY)).toBeAttached({ timeout: 30_000 });
}

/** Poll until the room's chat-bus SSE stream is observably open (≥1 live subscription via the dev
 *  introspection handle) — the deterministic "subscribed" gate before mutating, so a `chatUpdated` event
 *  always has a subscriber (no race; the orb equivalent of neo's `chat-stream-state` == "open"). */
export async function waitForStreamOpen(page: Page): Promise<void> {
  await expect.poll(async (): Promise<number> => busLive(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
}

/** Drive the real library→draft→send flow to CREATE one committed chat (one real turn). Returns once the
 *  user's row has committed durably (the chat row exists in the DB from that point). */
async function createChatViaSend(page: Page): Promise<void> {
  const charactersNav = page.getByRole("button", { name: "Characters", exact: true });
  await expect(charactersNav).toBeVisible({ timeout: 30_000 });
  await charactersNav.click();

  // The first row's "Chat with <name>" CTA — the resume-or-new library→chat seam (the exemplar path). It's
  // hover-revealed visually but always in the a11y tree, so a role/name click lands it (Playwright hovers
  // before clicking, which also fires the visual reveal). `toBeAttached` (not `toBeVisible`) mirrors the
  // exemplar: the button is in the tree before its hover-driven paint settles.
  const chatCta = page.getByRole("button", { name: CHARACTER_ROW_CHAT_CTA }).first();
  await expect(chatCta).toBeAttached({ timeout: 30_000 });
  await chatCta.click();

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
  await page.goto("/");
  await waitForAppReady(page);

  // `/` lands on the Chats LIST surface (chat-list-surface.tsx `aria-label="Chats"`), suspense-loaded from
  // `chat.listChats`. Wait for the list OR the "No chats yet" empty-state to settle BEFORE counting rows —
  // reading the count while the suspense query is still in flight races a false 0 (which would drop into the
  // expensive create-via-send path even though a chat exists). globalSetup guarantees ≥1 chat, so the reuse
  // branch is the normal path.
  const chatsList = page.getByRole("list", { name: "Chats" });
  const emptyState = page.getByText("No chats yet");
  await expect(chatsList.or(emptyState).first()).toBeVisible({ timeout: 15_000 });

  const rows = chatsList.getByRole("button");
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
  await page.goto("/");
  await waitForAppReady(page);
  const rows = page.getByRole("list", { name: "Chats" }).getByRole("button");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  await rows.first().click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
}

/** Open the active chat's ⋯ options menu (chat-header.tsx `ChatOptionsMenu`). Opened via KEYBOARD (focus +
 *  Enter) — the topbar ⋯ can be pointer-intercepted by an overlapping layer, and keyboard activation
 *  bypasses hit-testing (the same posture the per-row kebab needs). */
export async function openChatOptions(page: Page): Promise<void> {
  const options = page.getByRole("button", { name: "Chat options" });
  await expect(options).toBeVisible({ timeout: 15_000 });
  await options.focus();
  await options.press("Enter");
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

/** Re-open the FIRST chat in the LIST after a reload (orb has no `/chat/$id` URL — the active chat is
 *  store-only, so a reload returns to the landing state; the row still exists in the refetched list, and
 *  re-opening reads DB truth). Returns once the room's composer is live again. */
export async function reopenFirstChat(page: Page): Promise<void> {
  const rows = page.getByRole("list", { name: "Chats" }).getByRole("button");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  await rows.first().click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
}
