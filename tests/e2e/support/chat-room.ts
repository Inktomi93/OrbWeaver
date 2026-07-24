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
// Chat CTA. In the docked library width the e2e viewport lands on (the list is <320px — the
// `ACTIONS_COLLAPSE_BELOW_PX` fold), Star + Chat COLLAPSE INTO the per-row kebab as menu items, so the inline
// `aria-label="Chat with <name>"` button is never rendered. The deterministic path at every width is
// therefore the kebab: open the row's "Actions for <name>" menu, then click its "Chat" item.
const CHARACTER_ROW_KEBAB = /^Actions for /u;
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

  // Open the first character row's kebab and start a chat from it. Keyboard activation (focus + Enter) —
  // the row-body <button> overlaps the kebab in stacking and intercepts pointer clicks (same posture as the
  // chat-list row kebabs). The "Chat" item is the resume-or-new affordance folded into the collapsed row.
  const kebab = page.getByRole("button", { name: CHARACTER_ROW_KEBAB }).first();
  await expect(kebab).toBeVisible({ timeout: 30_000 });
  await kebab.focus();
  await kebab.press("Enter");
  await page.getByRole("menuitem", { name: "Chat", exact: true }).click();

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
