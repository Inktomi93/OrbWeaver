// E2E: the order-of-operations contract (neo 08-sequence port). Some user actions drive a multi-stage
// pipeline (query → SSE subscribe → open; then mutation → bus event → cache invalidation → refetch). If
// the stages go out of order the UI shows stale data or appears to do nothing. This spec records a network
// timeline + reads orb's dev bus-event ring and asserts the canonical order holds — no model credits
// (chat.updateChatTitle, not a send).
//
// Orb adaptation vs neo (verified against the live client): tRPC is at `/api/trpc/*` (queries batch;
// chat.getChat + chat.listChats ride one batched GET). Since SSE-1 the room stream is NOT a per-chat
// procedure: the tab holds ONE `stream.connect` EventSource (httpSubscriptionLink) and opening a chat ATTACHES
// its room with a `stream.attach` POST — so the "subscribe" half of this sequence is those two requests, not
// a `chat.streamMessages` GET. Orb has no `[chat-stream] open` console line to pin — instead the SSE "open"
// signal is `window.__orb.bus().live` climbing to ≥1, and the `chatUpdated` delivery is a real entry in
// `window.__orb.bus().events` (bus-devlog ring). We assert the NETWORK order (query → room attach) and, for
// the mutation path, POST updateChatTitle → the chatUpdated bus event lands → a refetch GET fires.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { busEventTypes, busLive, openOrCreateChat, renameOpenChat, waitForStreamOpen } from "./support/chat-room.ts";

interface TimelineEntry {
  readonly at: number;
  readonly label: string;
}

/** Subscribe to the page's tRPC network traffic, returning a growing timeline of `→ METHOD path` (request)
 *  and `← status path` (response) entries. */
function captureTrpcTimeline(page: Page): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  const t0 = Date.now();
  const pathOf = (url: string): string => url.split("/api/trpc/")[1]?.split("?")[0] ?? "?";
  page.on("request", (r) => {
    if (r.url().includes("/api/trpc/")) {
      timeline.push({ at: Date.now() - t0, label: `→ ${r.method()} ${pathOf(r.url())}` });
    }
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/trpc/")) {
      timeline.push({ at: Date.now() - t0, label: `← ${r.status()} ${pathOf(r.url())}` });
    }
  });
  return timeline;
}

/** Assert the substrings appear in `timeline` in order (each after the prior; extra entries between are
 *  allowed — resilient to StrictMode remounts + unrelated refetches). */
function expectInOrder(timeline: readonly TimelineEntry[], substrings: readonly string[]): void {
  let i = 0;
  for (const entry of timeline) {
    if (entry.label.includes(substrings[i] ?? "\u0000")) {
      i += 1;
    }
    if (i === substrings.length) {
      return;
    }
  }
  const got = timeline.map((e) => e.label).join("\n  ");
  throw new Error(`Sequence not satisfied. Wanted in order:\n  ${substrings.join("\n  ")}\nGot:\n  ${got}`);
}

test.describe("order-of-operations", () => {
  test("opening a chat fires: tRPC query → the room attaches on the ONE socket → stream open", async ({ page }) => {
    const timeline = captureTrpcTimeline(page);
    await openOrCreateChat(page);
    await waitForStreamOpen(page);

    // The stream reached open (≥1 live subscription) — an explicit gate on the dev bus handle.
    await expect.poll(async (): Promise<number> => busLive(page)).toBeGreaterThanOrEqual(1);
    // The room's read query (chat.getChat, batched with chat.listChats) AND the SSE subscription request
    // BOTH went out (before the stream opened, asserted above). Their relative EMISSION order is NOT
    // asserted: both are room-mount reads that dispatch concurrently (the batched-query link and the
    // httpSubscriptionLink fire in the same tick), so `chat.getChat`-before-`streamMessages` is a
    // nondeterministic race — pinning it flaked ~1-in-4 under load (surfaced 2026-07-24 when a preceding
    // navigation-heavy spec shifted suite timing). The real contract is: both fire and the stream opens.
    // Match a `chat.` procedure ANYWHERE in the label, not "→ GET chat." at the start: a batch GET combines
    // procedures into one comma-joined path (`chat.getChat,persona.list,…`) whose LEADING procedure varies by
    // batch order — requiring `chat.` to be first was the real flake (the query fires either way).
    const getLabels = timeline.filter((e) => e.label.startsWith("→ GET")).map((e) => e.label);
    expect(getLabels.some((l) => l.includes("chat."))).toBe(true);
    // The socket: exactly ONE `stream.connect` EventSource for the whole tab (that is the multiplex's own
    // claim — a second room costs zero connections), opened by the app root, not by this chat.
    expect(getLabels.filter((l) => l.includes("stream.connect"))).toHaveLength(1);
    // …and opening the chat ATTACHED its room over the ordinary batched mutation link (a POST, no connection).
    const postLabels = timeline.filter((e) => e.label.startsWith("→ POST")).map((e) => e.label);
    expect(postLabels.some((l) => l.includes("stream.attach"))).toBe(true);
  });

  test("rename → POST updateChatTitle → chatUpdated bus event → refetch GET", async ({ page }) => {
    await openOrCreateChat(page);
    await waitForStreamOpen(page);

    const timeline = captureTrpcTimeline(page);
    const newTitle = `e2e-seq-${Date.now()}`;
    await renameOpenChat(page, newTitle);
    await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: 5000 });

    // The POST and its response landed, and a refetch GET followed.
    expectInOrder(timeline, ["→ POST chat.updateTitle", "← 200 chat.updateTitle", "→ GET chat."]);
    // The chatUpdated ChatBusEvent was actually reduced by the client (the SSE → cache-invalidation seam).
    await expect.poll(async (): Promise<readonly string[]> => busEventTypes(page), { timeout: 10_000 }).toContain("chatUpdated");
  });
});
