// useInvalidation CT (data/use-invalidation.ts, PD-124) — proves the hoisted hook wires the LIVE
// `useTRPC()`/`useQueryClient()` context into `createInvalidation` end-to-end (never a hand-built
// `{ queryClient, trpc }` pair — the exact seam `invalidation.test.ts` already pins in isolation;
// this CT is what proves the CONTEXT WIRING, the part a pure unit test can't reach). The mounted
// `getChat` query is ACTIVE (an observer is subscribed), so `invalidateQueries` doesn't just mark
// it stale — it triggers an immediate refetch; a second network call is the load-bearing proof the
// hook reached the real client + the real query cache, not a no-op.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { InvalidationStory, StartChatBurstStory } from "./_ct-stories.tsx";

const CHAT_ID = castId<ChatId>("chat_ctinvalidationtest");

test("invalidate() (via the hook's live context) refetches the mounted getChat query", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": (input: unknown) => ({
      title: `room for ${(input as { chatId: ChatId }).chatId}`,
    }),
  });

  await mount(<InvalidationStory chatId={CHAT_ID} />);

  await expect(page.getByTestId("invalidation-state")).toContainText(`room for ${CHAT_ID}`);
  await expect.poll(() => trpc.count("chat.getChat")).toBe(1);

  await page.getByRole("button", { name: "invalidate" }).click();

  await expect.poll(() => trpc.count("chat.getChat")).toBe(2);
});

// ── The startChat BURST (bus-invalidation hygiene): `chat.startChat` lands FOUR events on the creating
//    client inside ~80ms — user-bus `chatsChanged` (member fan) + the chat bus's `chatOpened` (attach) +
//    `chatCreated` + `messageCommitted` (the draft→committed from-zero replay). `invalidateQueries` does
//    NOT dedupe against an in-flight fetch (it cancels and restarts), so every redundant map row is a real
//    round-trip: the measured pre-fix burst was listChats ×3 and getChat ×4 in one 80ms window.
//
//    ABSENCE IS PROVEN WITH A ROUND-TRIP BARRIER, never a bare `expect.poll` on the count under test: the
//    counts only climb, and `poll` goes green the instant a value TRANSITS the expectation — so a
//    `poll(...).toBe(2)` passes on the way to a wrong 3. Each test instead fires the suspect event, then a
//    barrier event that MUST fetch a DIFFERENT key, awaits that key's fetch, and only then hard-`expect`s the
//    key under test. Requests are recorded at INTERCEPTION, and the barrier's request is issued after the
//    suspect's click, so once the barrier landed any request the suspect caused is already counted.

interface BurstChatRow {
  readonly id: ChatId;
}

const BURST_ROUTES = {
  "chat.getChat": (input: unknown): { title: string } => ({ title: `room for ${(input as { chatId: ChatId }).chatId}` }),
  "chat.listChats": (): readonly BurstChatRow[] => [{ id: CHAT_ID }],
};

/** Fire an event that MUST refetch `listChats` (`messageEdited` → the non-terminal canon arm, which never
 *  names `getChat`) and await its wire fetch — the time barrier for a `getChat` absence assertion. */
async function listChatsBarrier(page: Parameters<typeof routeTrpc>[0], trpc: Awaited<ReturnType<typeof routeTrpc>>): Promise<void> {
  const before = trpc.count("chat.listChats");
  await page.getByRole("button", { name: "messageEdited", exact: true }).click();
  await expect.poll(() => trpc.count("chat.listChats")).toBeGreaterThan(before);
}

/** The mirror barrier: fire `chatOpened` (the attach synthesis — `getChat` only, never the list) and await
 *  its wire fetch, for a `listChats` absence assertion. */
async function getChatBarrier(page: Parameters<typeof routeTrpc>[0], trpc: Awaited<ReturnType<typeof routeTrpc>>): Promise<void> {
  const before = trpc.count("chat.getChat");
  await page.getByRole("button", { name: "chatOpened", exact: true }).click();
  await expect.poll(() => trpc.count("chat.getChat")).toBeGreaterThan(before);
}

test("chatCreated does NOT refetch the chat list — the same-commit chatsChanged fan is the one driver", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, BURST_ROUTES);

  await mount(<StartChatBurstStory chatId={CHAT_ID} />);
  await expect(page.getByTestId("burst-state")).toContainText(`room for ${CHAT_ID}`);
  // Both mount fetches must SETTLE before any invalidate: an invalidate landing on a query's FIRST,
  // still-in-flight fetch is absorbed (query-core reuses the in-flight promise), which would fake a green.
  await expect.poll(() => trpc.count("chat.listChats")).toBe(1);

  await page.getByRole("button", { name: "chatCreated", exact: true }).click();
  await getChatBarrier(page, trpc);

  // Still the mount's single fetch: the chatCreated click fetched NOTHING (pre-fix it made this 2).
  // ONESHOT-OK: settled by the barrier above — the getChat request was issued AFTER the chatCreated click and
  // has already landed, so any listChats request that click caused is necessarily already recorded. A poll here
  // would be WRONG (the count only climbs; poll goes green on a value it merely transits).
  expect(trpc.count("chat.listChats")).toBe(1);
});

test("messageCommitted does NOT refetch getChat — nothing in ChatDetail derives from canon", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, BURST_ROUTES);

  await mount(<StartChatBurstStory chatId={CHAT_ID} />);
  await expect(page.getByTestId("burst-state")).toContainText(`room for ${CHAT_ID}`);
  await expect.poll(() => trpc.count("chat.getChat")).toBe(1);

  await page.getByRole("button", { name: "messageCommitted", exact: true }).click();
  await listChatsBarrier(page, trpc);

  // Still the mount's single fetch: a canon commit leaves the room read alone (pre-fix it made this 2).
  // ONESHOT-OK: settled by the listChats barrier above — its request was issued after the messageCommitted
  // click and has landed, so any getChat request that click caused is already recorded.
  expect(trpc.count("chat.getChat")).toBe(1);
});

test("the whole startChat burst fetches the chat list EXACTLY once", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, BURST_ROUTES);

  await mount(<StartChatBurstStory chatId={CHAT_ID} />);
  await expect(page.getByTestId("burst-state")).toContainText(`room for ${CHAT_ID}`);
  await expect.poll(() => trpc.count("chat.listChats")).toBe(1);

  await page.getByRole("button", { name: "whole-burst", exact: true }).click();
  await getChatBarrier(page, trpc);

  // 1 mount + EXACTLY 1 burst refetch (the `chatsChanged` member fan). Pre-fix: 3 — `chatCreated` fetched
  // the list a second time, which is the ⚠ "listChats invalidated 3× in 79ms" the devlog tripwire reported.
  // ONESHOT-OK: settled by the getChat barrier above — issued after the burst click and already landed, so
  // every request the burst caused is recorded by now.
  expect(trpc.count("chat.listChats")).toBe(2);
});
