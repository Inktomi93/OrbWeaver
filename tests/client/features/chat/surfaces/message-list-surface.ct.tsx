// CT: the keystone surface end-to-end. Drives the PRODUCTION path — listMessages read (routeTrpc) +
// the live room stream (routeOrbSocket fulfills a real tRPC SSE body of `chat` FRAMES) → useOrbSocket →
// the room registry → useChatBus → applyChatBusEvent
// → the chat-stream store → the invalidation refetch. Asserts: canon renders; a send turn streams a
// ghost then swaps to the canonical row after turnCompleted refetches listMessages; and a draft handle
// (no server id) shows the empty state without ever hitting the server (skipToken).
//
// NOTE: `trpc.chat.listMessages` is stubbed at the NETWORK (routeTrpc) — the tRPC proxy builds the path
// structurally, so the CT runs even before the transport verb lands (it's being wired in parallel).
//
// ROSTER STUB: `ChatThread` now also suspends on `chat.getChat` (roster threading — see
// message-list-surface.tsx's header). Every committed-chat test below stubs it with an EMPTY roster +
// `cast` producer (`ROSTER_STUB`) — these CTs assert canon rendering + streaming, not
// attribution/macro chrome (that's message-row.ct.tsx's lane); an empty roster still exercises the
// real read + producer-merge path without pulling attribution assertions into this file's scope.
// `chat.listMessages` now returns `MessagesPage { messages, cast }` (Chat-Macro-Resolution.md §1/§3 /
// D137, its shape CHANGED from a bare `MessageView[]`) — every stub below wraps via `makeMessagesPage`.
// The owner-scoped `persona.list` read is GONE (the member-gated producer replaced it), so no stub for
// it remains.

import type { CastEntry, ChatBusEvent, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { StreamFrame } from "@orb/contracts/stream";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeOrbSocket } from "../../../../support/ct/route-orb-socket.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { MessageListStoppingStory, MessageListSurfaceStory } from "../_ct-stories.tsx";
import { MessageListEdgeFadeStory } from "../_edge-fade-stories.tsx";
import { CHAT_ID, makeMessagesPage, makeMessageView } from "../fixtures.ts";

// The divider's present-tense preview (PD-#7). Every map stubs it with a VALID resolved shape — the
// harness's unlisted-proc default (`data: null`) is out-of-contract for this query and crashes the
// surface (integration find, 2026-07-24). boundaryMessageId null = "everything fits" (no divider).
const PREVIEW_FIT_STUB = {
  "chat.previewContextFit": (): {
    boundaryMessageId: null;
    usedTokens: number;
    ceilingTokens: number;
    ceilingEstimated: boolean;
    reserveOutputTokens: number;
    droppedCount: number;
    compactSummary: null;
  } => ({
    boundaryMessageId: null,
    usedTokens: 120,
    ceilingTokens: 32_768,
    ceilingEstimated: false,
    reserveOutputTokens: 2048,
    droppedCount: 0,
    compactSummary: null,
  }),
};

const USER_VIEW = makeMessageView({
  id: castId<MessageId>("msg_user"),
  role: "user",
  content: "Ping?",
  seq: 1,
});
const AI_VIEW = makeMessageView({
  id: castId<MessageId>("msg_ai"),
  role: "assistant",
  content: "Hello world",
  seq: 2,
});

// The roster stub every test below wires alongside `chat.listMessages` (see header) — an empty roster
// + empty cast, just enough for `ChatThread`'s `chat.getChat` suspense read to resolve to a real
// (if empty) shape rather than routeTrpc's generic `null` unlisted-procedure default.
const ROSTER_STUB = {
  ...PREVIEW_FIT_STUB,
  "chat.getChat": (): {
    participants: never[];
    anchorPersonaId: null;
    cast: readonly CastEntry[];
    group: GroupConfig;
  } => ({
    participants: [],
    anchorPersonaId: null,
    cast: [],
    group: DEFAULT_GROUP_CONFIG,
  }),
};

/** Script a `chat`-room frame sequence out of bus events: each event takes the next durable `seq` (1…N),
 *  exactly as the room source stamps a durable row. An attach SYNTHETIC (`chatOpened`/`historyTruncated`)
 *  carries an explicit NON-ADVANCING cursor seq instead — see `MARK_THEN_REOPEN`. */
function chatFrames(events: readonly ChatBusEvent[]): StreamFrame[] {
  return events.map((event, i) => ({ channel: "chat", chatId: CHAT_ID, seq: i + 1, event }) as const);
}

/** The room this surface joins — every scripted body waits for its attach before it is served. */
const CHAT_ROOM = { channel: "chat", chatId: CHAT_ID } as const;

// The scripted turn: start → two text deltas → complete. `targetMessageId: null` (a fresh SEND) → the
// ghost APPENDS at the tail. Contrast `SWIPE_HEAD` below, where a non-null `targetMessageId` on a `swipe`
// intent makes the ghost REPLACE its target message in place (one row, no appended second row).
const TURN: ChatBusEvent[] = [
  {
    type: "turnStarted",
    chatId: CHAT_ID,
    intent: "send",
    api: "chat-completions",
    source: "openrouter",
    model: "test-model",
    speakerCharacterId: null,
    targetMessageId: null,
  },
  // `slotSeq` = the canon slot these tokens fill (the AI reply this turn commits) — the D16 clamp anchor.
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "Hello " } },
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "world" } },
  { type: "turnCompleted", chatId: CHAT_ID, intent: "send", messageId: AI_VIEW.id },
];

test("renders canon, then streams a turn and swaps the ghost for the canonical row", async ({ mount, page }) => {
  let listCall = 0;
  const trpc = await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    // First read = just the user turn; the post-turnCompleted refetch adds the assistant reply.
    "chat.listMessages": () => makeMessagesPage(listCall++ === 0 ? [USER_VIEW] : [USER_VIEW, AI_VIEW]),
    ...ROSTER_STUB,
  });
  await routeOrbSocket(page, { frames: chatFrames(TURN), awaitAttaches: 1 });

  // Deterministic-race gate (was the flake under full-suite parallelism): hold the EventSource
  // response — hence the whole scripted turn — until the INITIAL listMessages fetch has resolved
  // and rendered. Registered last, so it runs FIRST per request (Playwright routes are LIFO) and
  // `route.fallback()`s everything through to routeOrbSocket/routeTrpc unchanged.
  //
  // Why this is needed: `turnCompleted` synchronously flips the chat-stream store to "completed"
  // (chat-stream.ts completeTurn), which drops the ghost row on the very next render — independent
  // of when the post-turn `invalidate()` refetch resolves. That invalidate() calls
  // `queryClient.invalidateQueries`, which calls the query's `fetch()`. Per TanStack Query
  // (`@tanstack/query-core` query.js `Query#fetch`), if the query is STILL mid-flight on its first
  // fetch (`fetchStatus !== "idle"`, `data === undefined`), `fetch()` does NOT start a second
  // network call — it just reuses the in-flight retryer's promise. So if the scripted SSE burst
  // (turnStarted → 2 deltas → turnCompleted, delivered in one HTTP response) gets fully processed
  // before the FIRST `chat.listMessages` fetch settles — plausible only under heavy parallel CPU
  // contention, never in isolation — the post-turn refetch silently never happens: the ghost is
  // already gone, the assistant row never lands, and both `getByText("Hello world")` and the
  // `trpc.count` poll hang out to their timeout. Gating the stream on the canon read actually having
  // rendered ("Ping?" visible ⇒ the first fetch is done) makes the invalidate always land on an
  // idle query, so the refetch always fires for real.
  let releaseStream: (() => void) | undefined;
  const canonSettled = new Promise<void>((resolve) => {
    releaseStream = resolve;
  });
  await page.route("**/api/trpc/**", async (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    if (accept.includes("text/event-stream")) {
      await canonSettled;
    }
    await route.fallback();
  });

  const component = await mount(<MessageListSurfaceStory />);

  // Canon renders — the initial listMessages fetch is now settled; safe to let the stream through.
  await expect(component.getByText("Ping?")).toBeVisible();
  releaseStream?.();

  // The turn completes → listMessages refetches → the assistant reply lands as a canonical row.
  await expect(component.getByText("Hello world")).toBeVisible();
  await expect.poll(() => trpc.count("chat.listMessages"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(2);
});

// The bare START of a turn — turnStarted with NO deltas (the "pending" TTFT phase, before the ghost
// has any text: `phase === "pending"`, chat-stream.ts). GhostMessageRow shows `<StreamShimmer>` while
// `held.length === 0` — this drives that path through the REAL ancestor flex chain
// (MessageListSurfaceStory → @orb/ui/message-list → GhostMessageRow), unlike GhostRowStory's isolated
// `width: 360` wrapper (_ct-stories.tsx), which hardcodes a width specifically to dodge the flex-
// collapse-to-0 regression this test guards against (a real row gets its width from the list, not a
// hardcoded style).
const TURN_START_ONLY: ChatBusEvent[] = [
  {
    type: "turnStarted",
    chatId: CHAT_ID,
    intent: "send",
    api: "chat-completions",
    source: "openrouter",
    model: "test-model",
    speakerCharacterId: null,
    targetMessageId: null,
  },
];

test("pending phase (turnStarted, no deltas yet): the typing dots render with REAL rendered width, not collapsed", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage([USER_VIEW]),
    ...ROSTER_STUB,
  });
  await routeOrbSocket(page, { frames: chatFrames(TURN_START_ONLY), awaitAttaches: 1 });

  const component = await mount(<MessageListSurfaceStory />);

  // Canon renders alongside the pending ghost, whose pre-first-token affordance is the typing dots
  // (§6.4) — a role=status region in the ghost bubble, laid out with real (non-collapsed) width.
  await expect(component.getByText("Ping?")).toBeVisible();
  const pending = component.getByRole("status");
  await expect(pending).toBeVisible();
  await expect(component.locator('[data-slot="typing-dots"] .orb-typing-dot')).toHaveCount(3);
  const box = await pending.boundingBox();
  expect(box?.width).toBeGreaterThan(100);
});

// SWIPE reroll (append-variant), streamed head only (start + two deltas, NO completion) so the in-place
// ghost is held live for a deterministic assertion. `turnStarted` carries intent `swipe` + a NON-NULL
// `targetMessageId` (AI_VIEW.id) — the whole point of this regression: `useMessageItems` must place the
// ghost INTO AI_VIEW's slot (keyed by that id) and SUPPRESS the committed AI_VIEW row while streaming, so
// the new variant streams in place as ONE row. The bug appended the ghost at the tail instead, leaving the
// old "Hello world" row beside the streaming variant (two visible copies until turn-complete reconciled).
const SWIPE_HEAD: ChatBusEvent[] = [
  {
    type: "turnStarted",
    chatId: CHAT_ID,
    intent: "swipe",
    api: "chat-completions",
    source: "openrouter",
    model: "test-model",
    speakerCharacterId: null,
    targetMessageId: AI_VIEW.id,
  },
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "Fresh " } },
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "take" } },
];

test("a swipe reroll streams the new variant IN PLACE — one row, the committed variant's row suppressed (no appended second row)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    // Canon carries the existing variant ("Hello world" on AI_VIEW); the swipe rerolls it in place.
    "chat.listMessages": () => makeMessagesPage([USER_VIEW, AI_VIEW]),
    ...ROSTER_STUB,
  });
  await routeOrbSocket(page, { frames: chatFrames(SWIPE_HEAD), awaitAttaches: 1 });

  const component = await mount(<MessageListSurfaceStory />);

  // The reroll streams into AI_VIEW's slot — the new variant appears...
  await expect(component.getByText("Fresh take")).toBeVisible();
  // ...as the ONLY assistant row: exactly one ghost, and the committed AI_VIEW row is GONE (suppressed
  // in place). The bug's signature was BOTH present — the committed "Hello world" row AND the appended
  // ghost — so asserting the committed row's absence is the precise regression guard.
  await expect(component.locator('[data-slot="ghost-message-row"]')).toHaveCount(1);
  await expect(component.locator('[data-message-id="msg_ai"]')).toHaveCount(0);
  await expect(component.getByText("Hello world")).toHaveCount(0);
  // The user prompt row is untouched — only the swiped assistant row is replaced.
  await expect(component.getByText("Ping?")).toBeVisible();
});

// D124 retired the rpg "state anchor" — a content-less assistant row a host resync/edit used to post to
// key a hand-written snapshot. `postNarratorMessage` now REFUSES a blank post at the write boundary
// (Core-Path-Registry.md D124), so that row can no longer exist in canon at all; the render-filter this
// file used to regression-guard (a hidden anchor stealing the swipe strip from the last VISIBLE reply) has
// no subject anymore — every canon row IS a real reply, so `lastAssistantId` trivially lands on the last
// one. Deleted rather than kept green on a fabricated blank-content fixture (D124 moots D111 W-A).

// The head of a turn (start + two deltas, NO completion) — the ghost holds its streamed text; shared by
// the stopping-phase pin and the replay-seed recovery below.
const HEAD_DELTAS: ChatBusEvent[] = [
  {
    type: "turnStarted",
    chatId: CHAT_ID,
    intent: "send",
    api: "chat-completions",
    source: "openrouter",
    model: "test-model",
    speakerCharacterId: null,
    targetMessageId: null,
  },
  // `slotSeq` = the canon slot these tokens fill (the AI reply this turn commits) — the D16 clamp anchor.
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "Hello " } },
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "world" } },
];

// Bug 2 regression — "Stop flashes the reply away" (isLiveTurnPhase). The store keeps accumulated text
// through `stopping` (appendDelta writes streaming||stopping), so the render side must keep the ghost
// MOUNTED + its text VISIBLE the instant Stop is hit — before the fix, three render seams excluded
// `stopping` and the ghost blanked/unmounted on click. `mark-stopping` drives the client-only
// `markStopping` (streaming→stopping, no bus event).
test("the ghost row stays mounted with its streamed text after Stop (stopping phase)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage([USER_VIEW]),
    ...ROSTER_STUB,
  });
  await routeOrbSocket(page, { frames: chatFrames(HEAD_DELTAS), awaitAttaches: 1 });

  const component = await mount(<MessageListStoppingStory />);

  // The turn streams into the ghost row.
  await expect(component.getByText("Hello world")).toBeVisible();

  // Stop → the slot goes streaming→stopping. The ghost must NOT vanish and its accumulated text survives.
  await component.getByTestId("mark-stopping").click();
  await expect(component.getByText("Hello world")).toBeVisible();
  // The canonical user row is still present too (the list wasn't torn down).
  await expect(component.getByText("Ping?")).toBeVisible();
});

// THE BUG-1 REGRESSION PIN IS RETIRED (chat-creation-draft-mode-replacement.md §4.1, R1). It mounted a
// DRAFT surface and flipped it draft→committed within ONE mount — the real first-send shape — and asserted
// the just-created chat's room attached with `sinceSeq: 0` so the server replayed the head deltas that had
// raced past the fresh attach. That transition is now unrepresentable (a chat row exists from the creation
// click; `useChatBus` takes a required `ChatId`), and the `sinceSeq: 0` seed it pinned is deleted with it.
// What covers the same gap is the test BELOW plus the canon read: a room's FIRST attach carries no cursor,
// and the greeting rows `startChat` seeded before the client could attach arrive through `listMessages`.

// The complement: an EXISTING chat opened directly makes its FIRST attach with no replay request (never
// re-replays a finished turn as a ghost — the re-animate glitch the capture-once transition-detection guard
// closes) — and the whole tab holds exactly ONE socket, which is the multiplex's own claim.
//
// FIRST attach only, and the qualifier is load-bearing (R3 — R1-2). A RE-announce of the same room carries a
// cursor: this client's applied high-water once it has one, and before that the floor the server stamped on
// the `chatOpened` synthetic. A room that stayed cursor-less across a reconnect asked for no replay at all,
// which is a real message-loss window — pinned in `tests/client/data/bus/use-chat-bus.ct.tsx`. This CT scripts
// no frames and never drops the connection, so what it sees is the first attach, and null is still correct.
test("an existing committed chat makes its FIRST attach with NO replay cursor (never re-replays prior turns)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage([USER_VIEW]),
    ...ROSTER_STUB,
  });
  const socket = await routeOrbSocket(page, { frames: [] });

  const component = await mount(<MessageListSurfaceStory />); // committed=true (default)

  await expect(component.getByText("Ping?")).toBeVisible();
  await expect.poll(() => socket.attachRequests(), { intervals: [20, 50, 100] }).toContainEqual({ ref: CHAT_ROOM, sinceSeq: null });
  // ONE EventSource for the tab, no matter how many rooms it carries.
  expect(socket.connects()).toBe(1);
});

// REOPEN-CATCH-UP regression (the seq-guard blast-radius fix). `chatOpened`/`historyTruncated` are
// attach-SYNTHESIZED signals stamped with a NON-advancing frame `seq` (a resuming attach's own cursor, or —
// since R3/R1-2 — the room's durable high-water on a cursor-less one; either way a number the client already
// holds, never a fresh row), and their per-attach re-fire is the SOLE reopen invalidate (staleTime is
// Infinity — the SSE bus is the only freshness path). The monotonic seq guard must NOT run them through the
// high-water mark: a naive guard would drop `chatOpened(seq 0)` once the chat's durable mark had climbed in
// an earlier session, swallowing the reopen `chat.getChat` refetch → a stale surface until some new live
// event. This drives the real path (SSE → the room registry → useChatBus → seq guard → applyChatBusEvent →
// invalidate): non-invalidating durable events (turnStarted + deltas, seqs 1..3) climb the mark, then a
// trailing `chatOpened` stamped seq 0 — the SOLE getChat invalidator here — must STILL fetch `chat.getChat`
// a second time (it is exempt by TYPE).
const MARK_THEN_REOPEN: StreamFrame[] = [
  ...chatFrames(HEAD_DELTAS), // turnStarted + two deltas (seqs 1..3) — climb the mark, invalidate nothing.
  // The reopen re-fire: a synthesized attach signal at the NON-advancing cursor seq 0 (mark is now 3).
  { channel: "chat", chatId: CHAT_ID, seq: 0, event: { type: "chatOpened", chatId: CHAT_ID } },
];

test("a chatOpened at a non-advancing cursor seq STILL invalidates on reopen (the seq guard exempts synthetics by type)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const trpc = await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage([USER_VIEW]),
    ...ROSTER_STUB,
  });
  await routeOrbSocket(page, { frames: MARK_THEN_REOPEN, awaitAttaches: 1 });

  // Deterministic-race gate (same class as the first test above): hold the EventSource response — hence the
  // whole scripted burst, INCLUDING the trailing `chatOpened("0")` — until the surface's initial mount reads
  // have rendered. `chatOpened`'s invalidate calls `queryClient.invalidateQueries(getChat)`, which per
  // TanStack Query only starts a SECOND network fetch when the query is IDLE; if the query's FIRST fetch is
  // still in flight (`fetchStatus !== "idle"`, `data === undefined`) it merely marks it stale and reuses the
  // in-flight promise — NO second call. Under heavy parallel CPU contention the SSE burst can be fully
  // processed (deltas climb the seq mark, then `chatOpened` invalidates) before the mount's `chat.getChat`
  // fetch settles, so the invalidate lands on an in-flight query and the second getChat never fires →
  // `trpc.count("chat.getChat")` sticks at 1 and the poll times out. Gating the stream on the canon read
  // having RENDERED ("Ping?" visible ⇒ the mount batch settled, getChat is idle) makes the reopen invalidate
  // always land on an idle query, so the refetch always fires for real. Registered last ⇒ runs FIRST per
  // request (Playwright routes are LIFO) and falls through unchanged for non-stream traffic.
  let releaseStream: (() => void) | undefined;
  const mountSettled = new Promise<void>((resolve) => {
    releaseStream = resolve;
  });
  await page.route("**/api/trpc/**", async (route) => {
    const accept = route.request().headers()["accept"] ?? "";
    if (accept.includes("text/event-stream")) {
      await mountSettled;
    }
    await route.fallback();
  });

  const component = await mount(<MessageListSurfaceStory />); // committed=true

  // The surface reads its roster once at mount (getChat #1). Once canon has rendered, the mount reads are
  // settled (getChat idle) — release the stream so its trailing chatOpened invalidate lands on an idle query.
  await expect(component.getByText("Ping?")).toBeVisible();
  releaseStream?.();

  // The streamed turn advances the seq mark but fires NO getChat invalidate (turnStarted/delta invalidate nothing).
  await expect(component.getByText("Hello world")).toBeVisible();

  // The trailing chatOpened("0") is the ONLY getChat invalidator. Admitted-by-type ⇒ a SECOND getChat fetch.
  // A regression that ran the synthetic through the mark would drop it (its id ≤ the mark) and this stays 1.
  // Generous timeout: under full-suite parallel CPU contention the invalidate→refetch round-trip can lag.
  await expect.poll(() => trpc.count("chat.getChat"), { intervals: [50, 100, 200], timeout: 15_000 }).toBeGreaterThanOrEqual(2);
});

// #9 (B): the ONE present-tense divider carries the COMPACTION FACT when previewContextFit reports a
// compactSummary covering the span above the boundary — "older messages compacted into a summary" + a PEEK
// popover revealing the summary text. The boundary row is AI_VIEW (its id === boundaryMessageId), so the
// divider renders above it. The noun is COMPACTION, never "memory" (`chats.compactSummary` is its own thing,
// not the Memory plane) — vocab repaired 2026-08-02.
const COMPACTED_INTO_SUMMARY = /compacted into a summary/i;
const IN_CONTEXT_FROM_HERE = /in context from here/i;

const COMPACTED_PREVIEW_FIT = {
  "chat.previewContextFit": (): {
    boundaryMessageId: MessageId;
    usedTokens: number;
    ceilingTokens: number;
    ceilingEstimated: boolean;
    reserveOutputTokens: number;
    droppedCount: number;
    compactSummary: string;
  } => ({
    boundaryMessageId: AI_VIEW.id,
    usedTokens: 900,
    ceilingTokens: 1000,
    ceilingEstimated: false,
    reserveOutputTokens: 128,
    droppedCount: 3,
    compactSummary: "Long ago the heroes met and swore an oath by the river.",
  }),
};

test("the divider carries the compaction fact + a peek that reveals the summary", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    ...ROSTER_STUB,
    ...COMPACTED_PREVIEW_FIT,
    "chat.listMessages": () => makeMessagesPage([USER_VIEW, AI_VIEW]),
  });
  await routeOrbSocket(page, { frames: [] });

  const component = await mount(<MessageListSurfaceStory />); // committed=true

  // The boundary divider announces the compaction fact (not the plain "in context from here" line).
  const divider = component.locator('[data-slot="context-boundary-divider"]');
  await expect(divider).toContainText(COMPACTED_INTO_SUMMARY);

  // The peek is closed by default — the summary text is not in the DOM until opened. (The popover PORTALS to
  // the themed portal root outside #root, so the popup is asserted on `page`, not the mounted `component`.)
  await expect(page.locator('[data-slot="compact-summary-text"]')).toHaveCount(0);

  // Open the peek → the summary text becomes visible (the popover popup mounts on trigger).
  await component.locator('[data-slot="compact-summary-peek"]').click();
  await expect(page.locator('[data-slot="compact-summary-text"]')).toContainText("swore an oath by the river");
});

test("no compaction fact when previewContextFit reports no covering summary (plain cutoff line)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    ...ROSTER_STUB,
    "chat.previewContextFit": (): {
      boundaryMessageId: MessageId;
      usedTokens: number;
      ceilingTokens: number;
      ceilingEstimated: boolean;
      reserveOutputTokens: number;
      droppedCount: number;
      compactSummary: null;
    } => ({
      boundaryMessageId: AI_VIEW.id,
      usedTokens: 900,
      ceilingTokens: 1000,
      ceilingEstimated: false,
      reserveOutputTokens: 128,
      droppedCount: 3,
      compactSummary: null,
    }),
    "chat.listMessages": () => makeMessagesPage([USER_VIEW, AI_VIEW]),
  });
  await routeOrbSocket(page, { frames: [] });

  const component = await mount(<MessageListSurfaceStory />);

  const divider = component.locator('[data-slot="context-boundary-divider"]');
  await expect(divider).toContainText(IN_CONTEXT_FROM_HERE);
  await expect(divider).not.toContainText(COMPACTED_INTO_SUMMARY);
  // No peek affordance when there's no summary.
  await expect(component.locator('[data-slot="compact-summary-peek"]')).toHaveCount(0);
});

// DENSITY S6 (density-pass-spec.md §2.3): the divider names a REGION of the transcript ("everything below
// this line is in context"), which is the `kicker` voice — micro caps at the section-name weight, with the
// hairline rules either side. Read back computed, because the caps + micro half of that shape was already
// true by taste and only the WEIGHT (and the `voice` attribute that pins the intent) distinguishes a
// kicker from a hand-assembled lookalike.
test("the context-boundary divider's label speaks the kicker voice (a region name, not body prose)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    ...ROSTER_STUB,
    ...COMPACTED_PREVIEW_FIT,
    "chat.listMessages": () => makeMessagesPage([USER_VIEW, AI_VIEW]),
  });
  await routeOrbSocket(page, { frames: [] });

  const component = await mount(<MessageListSurfaceStory />);

  const label = component.locator('[data-slot="context-boundary-divider"] [data-slot="text"]').first();
  await expect(label).toBeVisible();
  await expect(label).toHaveAttribute("data-voice", "kicker");
  const type = await label.evaluate((el) => {
    const style = getComputedStyle(el);
    const probe = el.ownerDocument.createElement("div");
    el.ownerDocument.body.append(probe);
    probe.style.fontSize = "var(--text-micro)";
    const micro = getComputedStyle(probe).fontSize;
    probe.remove();
    return { size: style.fontSize, weight: style.fontWeight, transform: style.textTransform, micro };
  });
  expect(type.size).toBe(type.micro);
  expect(type.transform).toBe("uppercase");
  expect(type.weight).toBe("600");
});

// ── THE EDGE FADE MUST NOT FADE PROSE ONTO THE ART (side-eye 2026-08-07 finding 5) ───────────────────
// `[data-slot="message-list-scroll"]`'s `mask-image` fades EVERY pixel of the subtree at the same rate —
// the row's opaque card AND the body prose painted on it. Over the flat page background that is a dissolve
// into the colour the reader is already looking at; over a background PHOTO the card dissolves and the
// prose lands on the ART, measured at 1.29–3.34:1 across the top band with the first row clearing AA only
// at y≈128. The rule is inert under the shell's `data-has-bg-image` flag now.
//
// WHY THIS IS A PIXEL ASSERTION AND NOT A COMPUTED-STYLE ONE — the finding's most reusable half: a mask is
// PAINT. `elementFromPoint` + `getComputedStyle` report the fully-opaque cream card for every faded row, so
// design-audit and snap's css-resolve path are both structurally blind to it. Only sampling the framebuffer
// sees it, so that is what this does: screenshot a 1px clip, decode it in the page, read the channel.
//
// ITS OWN POSITIVE CONTROL: the second case mounts the SAME story with the art flag OFF, where the mask is
// still live, and REQUIRES the bleed-through to be detected. A green from an unprobed instrument is not a
// result — if the control ever stops seeing the defect, the first case's green means nothing.

const FADE_SCROLLER = '[data-slot="message-list-scroll"]';

// The story's own two colours, restated here rather than imported: playwright-ct rewrites a `.ct.tsx`'s
// named imports from a story module into generated component consts, so a MIXED import (a component AND a
// constant) fails to parse — `_edge-fade-stories.tsx` may export components only. Kept in lockstep by the
// control case below, which fails the moment the story's backdrop stops being what this expects.
/** The row card the story paints — an opaque cream. */
const CARD_RGB = { b: 227, g: 239, r: 245 } as const;

/** One framebuffer pixel at page coordinates, decoded in-browser (no image dependency in the runner). */
async function samplePixel(page: Page, x: number, y: number): Promise<{ readonly r: number; readonly g: number; readonly b: number }> {
  const clip = await page.screenshot({ clip: { height: 1, width: 1, x, y } });
  const dataUrl = `data:image/png;base64,${clip.toString("base64")}`;
  return await page.evaluate(async (url: string) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("no 2d context");
    }
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return { b: data[2] ?? 0, g: data[1] ?? 0, r: data[0] ?? 0 };
  }, dataUrl);
}

/** Scroll the thread off its top edge so `data-fade-top` arms, then sample INSIDE the fade band. */
async function sampleTopBandPixel(page: Page, scroller: Locator): Promise<{ readonly r: number; readonly g: number; readonly b: number }> {
  await scroller.evaluate((el: HTMLElement) => {
    el.scrollTop = 200;
  });
  await expect(scroller).toHaveAttribute("data-fade-top", "");
  const box = await scroller.boundingBox();
  expect(box).not.toBeNull();
  // 8px below the top edge: deep inside the 10% (~40px) band, where the mask's alpha is ~0.2.
  return await samplePixel(page, Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2), Math.round((box?.y ?? 0) + 8));
}

test("EDGE FADE: over an art backdrop the thread's top band paints the CARD, not the art behind it", async ({ mount, page }) => {
  const component = await mount(<MessageListEdgeFadeStory artBackdrop={true} />);
  const pixel = await sampleTopBandPixel(page, component.locator(FADE_SCROLLER));

  // The backdrop is pure green; the card is cream. A dissolved card reads green-dominant. This asserts the
  // sampled pixel IS the card — within a generous tolerance, because this fences "does the art show
  // through", not the card's exact hue.
  expect(Math.abs(pixel.r - CARD_RGB.r)).toBeLessThan(24);
  expect(Math.abs(pixel.g - CARD_RGB.g)).toBeLessThan(24);
  expect(Math.abs(pixel.b - CARD_RGB.b)).toBeLessThan(24);
});

test("EDGE FADE CONTROL: the same probe DOES see the dissolve where the fade is still live", async ({ mount, page }) => {
  // No art flag ⇒ the mask runs, and the row's card blends toward the backdrop. This is the planted
  // positive control for the assertion above — it proves the instrument can see the defect at all.
  const component = await mount(<MessageListEdgeFadeStory artBackdrop={false} />);
  const pixel = await sampleTopBandPixel(page, component.locator(FADE_SCROLLER));

  // Green pulls far away from the cream card's blue channel long before it reaches the backdrop.
  expect(pixel.b).toBeLessThan(CARD_RGB.b - 24);
});
