// Seed the PERSISTED active-chat store before any page script runs — the CT seam for every arm that only
// exists with a room open. The one that drove this out: `MessageMediaBlock`'s click→imageDetail route reads
// `useActiveChatId` during its FIRST commit, so a mount with no active chat silently takes the plain-zoom
// fallback and the test goes green-looking-red for the wrong reason.
//
// Both halves below are load-bearing and each was paid for. An effect (or a `selectChat` call) lands AFTER
// that first commit, so the block would already have chosen the null-chat arm — and `addInitScript` alone is
// not enough either, because the CT fixture has already navigated to the harness page by the time a test body
// runs, so the script would not fire until some later navigation. After the reload the store rehydrates at
// module init from SYNCHRONOUS localStorage, so there is no rehydrate race left to barrier on.

import type { ChatId } from "@orb/kit/ids";
import type { Page } from "@playwright/test";

/** The persisted active-chat store's localStorage key. Unbound identity ⇒ the legacy (un-namespaced) key
 *  (`durable-local.ts`: `orb:` + the store name); a CT binds no user. */
const ACTIVE_CHAT_STORAGE_KEY = "orb:active-chat";

/**
 * Put `chatId` in the persisted active-chat store, then reload so the store rehydrates from it at module
 * init — i.e. before the mounted tree's first commit reads `useActiveChatId`.
 *
 * `chatId` MUST be MINTED (`mintTypeId(ID_PREFIX.chat)`), never a readable literal: rehydrate runs the
 * persisted handle through `typeIdSchema(ID_PREFIX.chat)`, which demands a real 26-char base32 suffix — a
 * fake id is DISCARDED and the store heals to `landing` (measured: `chat_ct_room_image_01` did exactly that).
 */
export async function seedActiveChat(page: Page, chatId: ChatId): Promise<void> {
  await page.addInitScript(
    ([key, id]: readonly [string, string]) => {
      globalThis.localStorage.setItem(key, JSON.stringify({ state: { handle: { kind: "committed", id } }, version: 1 }));
    },
    [ACTIVE_CHAT_STORAGE_KEY, chatId] as const,
  );
  await page.reload();
}
