// CT: the keystone surface end-to-end. Drives the PRODUCTION path — listMessages read (routeTrpc) +
// the live room stream (routeChatStream fulfills a real tRPC SSE body) → useChatBus → applyChatBusEvent
// → the chat-stream store → the invalidation refetch. Asserts: canon renders; a send turn streams a
// ghost then swaps to the canonical row after turnCompleted refetches listMessages; and a draft handle
// (no server id) shows the empty state without ever hitting the server (skipToken).
//
// NOTE: `trpc.chat.listMessages` is stubbed at the NETWORK (routeTrpc) — the tRPC proxy builds the path
// structurally, so the CT runs even before the transport verb lands (it's being wired in parallel).
//
// ROSTER STUB: `ChatThread` now also suspends on `chat.getChat` (roster threading — see
// message-list-surface.tsx's header). Every committed-chat test below stubs it with an EMPTY roster +
// `macroNames` producer (`ROSTER_STUB`) — these CTs assert canon rendering + streaming, not
// attribution/macro chrome (that's message-row.ct.tsx's lane); an empty roster still exercises the
// real read + producer-merge path without pulling attribution assertions into this file's scope.
// `chat.listMessages` now returns `MessagesPage { messages, macroNames }` (Chat-Macro-Resolution.md
// §1/§3, its shape CHANGED from a bare `MessageView[]`) — every stub below wraps via `makeMessagesPage`.
// The owner-scoped `persona.list` read is GONE (the member-gated producer replaced it), so no stub for
// it remains.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { routeChatStream } from "../../../../support/ct/route-trpc-subscription";
import { MessageListReplaySeedStory, MessageListStoppingStory, MessageListSurfaceStory } from "../_ct-stories";
import { CHAT_ID, makeMacroNameProducer, makeMessagesPage, makeMessageView } from "../fixtures";

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
// + empty producer, just enough for `ChatThread`'s `chat.getChat` suspense read to resolve to a real
// (if empty) shape rather than routeTrpc's generic `null` unlisted-procedure default.
const ROSTER_STUB = {
  "chat.getChat": (): {
    participants: never[];
    anchorPersonaId: null;
    macroNames: ReturnType<typeof makeMacroNameProducer>;
    personaAvatars: never[];
  } => ({
    participants: [],
    anchorPersonaId: null,
    macroNames: makeMacroNameProducer(),
    personaAvatars: [],
  }),
};

// The scripted turn: start → two text deltas → complete (targetMessageId null → the ghost appends).
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
  { type: "delta", chatId: CHAT_ID, delta: { chatId: CHAT_ID, kind: "text", text: "Hello " } },
  { type: "delta", chatId: CHAT_ID, delta: { chatId: CHAT_ID, kind: "text", text: "world" } },
  { type: "turnCompleted", chatId: CHAT_ID, intent: "send", messageId: AI_VIEW.id },
];

test("renders canon, then streams a turn and swaps the ghost for the canonical row", async ({ mount, page }) => {
  let listCall = 0;
  const trpc = await routeTrpc(page, {
    // First read = just the user turn; the post-turnCompleted refetch adds the assistant reply.
    "chat.listMessages": () => makeMessagesPage(listCall++ === 0 ? [USER_VIEW] : [USER_VIEW, AI_VIEW]),
    ...ROSTER_STUB,
  });
  await routeChatStream(page, { events: TURN });

  // Deterministic-race gate (was the flake under full-suite parallelism): hold the EventSource
  // response — hence the whole scripted turn — until the INITIAL listMessages fetch has resolved
  // and rendered. Registered last, so it runs FIRST per request (Playwright routes are LIFO) and
  // `route.fallback()`s everything through to routeChatStream/routeTrpc unchanged.
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

test("pending phase (turnStarted, no deltas yet): the TTFT shimmer renders with REAL rendered width, not collapsed", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage([USER_VIEW]),
    ...ROSTER_STUB,
  });
  await routeChatStream(page, { events: TURN_START_ONLY });

  const component = await mount(<MessageListSurfaceStory />);

  // Canon renders alongside the pending ghost.
  await expect(component.getByText("Ping?")).toBeVisible();
  const shimmer = component.getByRole("status");
  await expect(shimmer).toBeVisible();
  const box = await shimmer.boundingBox();
  expect(box?.width).toBeGreaterThan(100);
});

test("a draft handle shows the empty state and never reads the server", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage([USER_VIEW]),
  });

  const component = await mount(<MessageListSurfaceStory committed={false} />);

  await expect(component.getByText("No messages yet.")).toBeVisible();
  // skipToken: a draft never builds the key, so the server is never hit.
  expect(trpc.count("chat.listMessages")).toBe(0);
});

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
  { type: "delta", chatId: CHAT_ID, delta: { chatId: CHAT_ID, kind: "text", text: "Hello " } },
  { type: "delta", chatId: CHAT_ID, delta: { chatId: CHAT_ID, kind: "text", text: "world" } },
];

// Bug 2 regression — "Stop flashes the reply away" (isLiveTurnPhase). The store keeps accumulated text
// through `stopping` (appendDelta writes streaming||stopping), so the render side must keep the ghost
// MOUNTED + its text VISIBLE the instant Stop is hit — before the fix, three render seams excluded
// `stopping` and the ghost blanked/unmounted on click. `mark-stopping` drives the client-only
// `markStopping` (streaming→stopping, no bus event).
test("the ghost row stays mounted with its streamed text after Stop (stopping phase)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage([USER_VIEW]),
    ...ROSTER_STUB,
  });
  await routeChatStream(page, { events: HEAD_DELTAS });

  const component = await mount(<MessageListStoppingStory />);

  // The turn streams into the ghost row.
  await expect(component.getByText("Hello world")).toBeVisible();

  // Stop → the slot goes streaming→stopping. The ghost must NOT vanish and its accumulated text survives.
  await component.getByTestId("mark-stopping").click();
  await expect(component.getByText("Hello world")).toBeVisible();
  // The canonical user row is still present too (the list wasn't torn down).
  await expect(component.getByText("Ping?")).toBeVisible();
});

// Bug 1 regression — first-turn streaming race (use-chat-bus.ts replay-cursor seed). A DRAFT surface whose
// handle flips draft→committed within ONE mount (the real first-send shape; the stable session key means
// no remount). The just-created chat's subscription must carry `lastEventId:"0"` so the server replays
// this chat's durable head deltas that raced past the fresh attach.
test("a just-created chat (draft→committed) seeds lastEventId '0' and streams the head deltas", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, { "chat.listMessages": () => makeMessagesPage([]), ...ROSTER_STUB });
  const stream = await routeChatStream(page, { events: HEAD_DELTAS });

  const component = await mount(<MessageListReplaySeedStory />);

  // Draft: the discriminant gates OUT the read/subscription (skipToken — no committed id).
  await expect(component.getByText("No messages yet.")).toBeVisible();

  // First send promotes the draft → the surface mounts the SSE subscription for the new chat.
  await component.getByTestId("commit-draft").click();

  // The scripted head deltas animate the ghost (recovered because the subscription seeded the cursor)...
  await expect(component.getByText("Hello world")).toBeVisible();
  // ...and the committed subscription carried the replay cursor (bounded to THIS chat's baseline).
  await expect.poll(() => stream.lastInput(), { intervals: [20, 50, 100] }).toMatchObject({ chatId: CHAT_ID, lastEventId: "0" });
});

// The complement: an EXISTING chat opened directly subscribes with NO cursor (never re-replays a finished
// turn as a ghost — the re-animate glitch the capture-once transition-detection guard closes).
test("an existing committed chat subscribes with NO replay cursor (never re-replays prior turns)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage([USER_VIEW]),
    ...ROSTER_STUB,
  });
  const stream = await routeChatStream(page, { events: [] });

  const component = await mount(<MessageListSurfaceStory />); // committed=true (default)

  await expect(component.getByText("Ping?")).toBeVisible();
  await expect.poll(() => stream.count(), { intervals: [20, 50, 100] }).toBe(1);

  const input = stream.lastInput() as { chatId: string; lastEventId?: unknown };
  expect(input.chatId).toBe(CHAT_ID);
  expect(input.lastEventId).toBeUndefined();
});
