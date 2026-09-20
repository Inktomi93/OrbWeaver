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

import type { ChatBusEvent, ChatIdentity, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import type { StreamFrame } from "@orb/contracts/stream";
import type { CharacterId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { contrastRatio } from "@orb/tooling/_shared/wcag";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { MESSAGE_EDIT_NAME } from "../../../../../packages/client/src/features/chat/lib/message-action-names.ts";
import { pixelContrast } from "../../../../support/browser/pixel-contrast.ts";
import { routeOrbSocket } from "../../../../support/node/route-orb-socket.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import {
  MessageListFooterDisclosureStory,
  MessageListNoticeBandStory,
  MessageListOverArtStory,
  MessageListStoppingStory,
  MessageListSurfaceStory,
  MessageListTabWalkStory,
} from "../_ct-stories.tsx";
import { MessageListEdgeFadeStory } from "../_edge-fade-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ID, makeMessagesPage, makeMessageView } from "../fixtures.ts";

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
    identities: readonly ChatIdentity[];
    group: GroupConfig;
  } => ({
    participants: [],
    anchorPersonaId: null,
    identities: [],
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
    provider: castId<ProviderId>("openrouter"),
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
    ...CHAT_AMBIENT_ROUTES,
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
    provider: castId<ProviderId>("openrouter"),
    model: "test-model",
    speakerCharacterId: null,
    targetMessageId: null,
  },
];

test("pending phase (turnStarted, no deltas yet): the typing dots render with REAL rendered width, not collapsed", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...PREVIEW_FIT_STUB, "chat.listMessages": () => makeMessagesPage([USER_VIEW]), ...ROSTER_STUB });
  await routeOrbSocket(page, { frames: chatFrames(TURN_START_ONLY), awaitAttaches: 1 });

  const component = await mount(<MessageListSurfaceStory />);

  // Canon renders alongside the pending ghost, whose pre-first-token affordance is the typing dots
  // (§6.4) — a role=status region in the ghost bubble, laid out with real (non-collapsed) width.
  await expect(component.getByText("Ping?")).toBeVisible();
  const pending = component.getByRole("status");
  await expect(pending).toBeVisible();
  await expect(component.locator('[data-slot="typing-dots"] .orb-typing-dot')).toHaveCount(3);
  const readBoxAtAssertion = async (): Promise<typeof box> => await pending.boundingBox();
  const box = await pending.boundingBox();
  await expect.poll(async () => (await readBoxAtAssertion())?.width).toBeGreaterThan(100);
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
    provider: castId<ProviderId>("openrouter"),
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
    ...CHAT_AMBIENT_ROUTES,
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
    provider: castId<ProviderId>("openrouter"),
    model: "test-model",
    speakerCharacterId: null,
    targetMessageId: null,
  },
  // `slotSeq` = the canon slot these tokens fill (the AI reply this turn commits) — the D16 clamp anchor.
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "Hello " } },
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "world" } },
];

// #937: the live ghost uses the same card-attribution resolver as a committed row. This is the rendered
// streaming seam (SSE -> turn speaker -> roster card -> resolveRowAttribution -> GhostMessageRow), not an
// isolated ghost handed test-authored tokens. A card may color the stream, but it cannot re-stamp the
// viewer's density while the reply is arriving.
const THEMED_STREAM_CHARACTER = castId<CharacterId>("char_stream_theme");
const STREAM_ACCENT = "oklch(0.64 0.18 305)";
const THEMED_STREAM_HEAD: ChatBusEvent[] = [
  {
    type: "turnStarted",
    chatId: CHAT_ID,
    intent: "send",
    api: "chat-completions",
    provider: castId<ProviderId>("openrouter"),
    model: "test-model",
    speakerCharacterId: THEMED_STREAM_CHARACTER,
    targetMessageId: null,
  },
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "The themed stream arrives. " } },
];

test("#937 a streaming card theme carries palette but inherits viewer density", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage([USER_VIEW], [{ kind: "character", id: THEMED_STREAM_CHARACTER, name: "Aria", avatarHash: null }]),
    "chat.getChat": () => ({
      participants: [
        {
          id: "cp_stream_theme",
          kind: "character",
          characterId: THEMED_STREAM_CHARACTER,
          displayName: "Aria",
          leftSeq: null,
          avatarHash: null,
          role: "member",
          themeOverride: { accent: STREAM_ACCENT, dialogueColor: "oklch(0.82 0.08 305)", density: "compact" },
        },
      ],
      anchorPersonaId: null,
      identities: [],
      group: DEFAULT_GROUP_CONFIG,
    }),
  });
  await routeOrbSocket(page, { frames: chatFrames(THEMED_STREAM_HEAD), awaitAttaches: 1 });

  const component = await mount(<MessageListSurfaceStory />);
  await component.evaluate((node) => node.setAttribute("data-density", "comfortable"));
  const ghost = component.locator('[data-slot="ghost-message-row"]');
  await expect(ghost).toContainText("The themed stream arrives.");
  const scopes = ghost.locator('[data-slot="theme-scope"]');
  await expect(scopes).toHaveCount(2);
  await expect.poll(() => scopes.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-density")))).toEqual([null, null]);
  await expect.poll(() => ghost.evaluate((node) => node.closest("[data-density]")?.getAttribute("data-density"))).toBe("comfortable");
  await expect.poll(() => scopes.first().evaluate((node) => getComputedStyle(node).getPropertyValue("--color-primary").trim())).toBe(STREAM_ACCENT);
});

// Bug 2 regression — "Stop flashes the reply away" (isLiveTurnPhase). The store keeps accumulated text
// through `stopping` (appendDelta writes streaming||stopping), so the render side must keep the ghost
// MOUNTED + its text VISIBLE the instant Stop is hit — before the fix, three render seams excluded
// `stopping` and the ghost blanked/unmounted on click. `mark-stopping` drives the client-only
// `markStopping` (streaming→stopping, no bus event).
test("the ghost row stays mounted with its streamed text after Stop (stopping phase)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...PREVIEW_FIT_STUB, "chat.listMessages": () => makeMessagesPage([USER_VIEW]), ...ROSTER_STUB });
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
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...PREVIEW_FIT_STUB, "chat.listMessages": () => makeMessagesPage([USER_VIEW]), ...ROSTER_STUB });
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
// trailing `chatOpened` stamped seq 0 — the SOLE getChat invalidator here — is admitted by TYPE.
//
// THE ARM THIS PIN ASSERTS MOVED (#514), and the mechanism it guards did not. `chatOpened`'s `getChat` row
// is now gated on the room having been DARK (`data/invalidation.ts` → the registry's `liveEpoch`), because a
// room's FIRST attach in a page re-fetched the read that same open had just issued — the third hop of the
// measured chat-open waterfall. So the re-fire this pin is about is scripted where it actually heals: a
// DROPPED connection, after which the link reconnects, the room re-announces past the dedupe, and the whole
// script — including the trailing `chatOpened` — replays onto a room that has now been dark. Both halves are
// still proven, and by the same frame: the seq guard admits the synthetic (a regression that ran it through
// the mark would drop it, its id ≤ the mark), AND the seam heals on a re-attach. The complement — the same
// synthetic on a FIRST attach fetching NOTHING — is the test below it.
const MARK_THEN_REOPEN: StreamFrame[] = [
  ...chatFrames(HEAD_DELTAS), // turnStarted + two deltas (seqs 1..3) — climb the mark, invalidate nothing.
  // The reopen re-fire: a synthesized attach signal at the NON-advancing cursor seq 0 (mark is now 3).
  { channel: "chat", chatId: CHAT_ID, seq: 0, event: { type: "chatOpened", chatId: CHAT_ID } },
];

test("a chatOpened at a non-advancing cursor seq STILL invalidates on RE-attach (the seq guard exempts synthetics by type)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...PREVIEW_FIT_STUB, "chat.listMessages": () => makeMessagesPage([USER_VIEW]), ...ROSTER_STUB });
  // `dropFirstConnection` ends the first body WITHOUT the terminal `return` frame → EOF → the link
  // reconnects, the registry force-announces every room past its dedupe, and the script replays. That
  // second delivery is the one whose `chatOpened` heals: the room has been dark across the drop.
  await routeOrbSocket(page, { frames: MARK_THEN_REOPEN, awaitAttaches: 1, dropFirstConnection: true });

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

  // The trailing chatOpened("0") is the ONLY getChat invalidator. Admitted-by-type, on a room that went dark
  // across the dropped connection ⇒ a SECOND getChat fetch. A regression that ran the synthetic through the
  // mark would drop it (its id ≤ the mark) and this stays 1; so would a heal gate that never re-opened.
  // Generous timeout: under full-suite parallel CPU contention the invalidate→refetch round-trip can lag.
  await expect.poll(() => trpc.count("chat.getChat"), { intervals: [50, 100, 200], timeout: 15_000 }).toBeGreaterThanOrEqual(2);
});

// THE COMPLEMENT (#514): the SAME synthetic on a room's FIRST attach must fetch NOTHING. `chatOpened`
// re-fires on every attach, and on the first one the `chat.getChat` it would refetch is the read this very
// open issued — measured on the isolated stage, that refetch left 541ms after the open click for a row
// nothing could have changed, the third hop of a four-hop waterfall. The heal itself is untouched (the test
// above); its INPUT narrowed to "the room has been dark", which on a first attach it has not.
//
// The trailing delta is the BARRIER, and it is why this is not an un-failable "count stayed 1": frames are
// delivered in order, so "Hello world!" on screen proves the `chatOpened` before it was applied. A node-side
// request count is never a browser-side settle — the rendered text is.
const FIRST_ATTACH_OPENED: StreamFrame[] = [
  ...chatFrames(HEAD_DELTAS), // turnStarted + two deltas (seqs 1..3): "Hello world" in the ghost.
  { channel: "chat", chatId: CHAT_ID, seq: 0, event: { type: "chatOpened", chatId: CHAT_ID } },
  // Seq 4 advances the mark, so it is admitted — and it can only render AFTER the frame before it applied.
  {
    channel: "chat",
    chatId: CHAT_ID,
    seq: 4,
    event: { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "!" } },
  },
];

test("a chatOpened on the room's FIRST attach refetches NOTHING — the open's own read IS the fresh state", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...PREVIEW_FIT_STUB, "chat.listMessages": () => makeMessagesPage([USER_VIEW]), ...ROSTER_STUB });
  await routeOrbSocket(page, { frames: FIRST_ATTACH_OPENED, awaitAttaches: 1 });

  // The SAME deterministic-race gate as the test above, and here it is what makes the assertion mean
  // anything: an invalidate landing on a still-in-flight first fetch is absorbed by query-core and starts no
  // second call, so without the gate this test would go green on the OLD code too (a lying pass). Holding the
  // stream until canon has rendered guarantees `getChat` is IDLE when `chatOpened` arrives — i.e. the exact
  // condition under which the old seam DID spend a second round trip.
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

  await expect(component.getByText("Ping?")).toBeVisible();
  await expect.poll(() => trpc.count("chat.getChat"), { intervals: [20, 50, 100] }).toBe(1);
  releaseStream?.();

  // The barrier: the delta AFTER the synthetic is on screen, so the synthetic has been applied.
  await expect(component.getByText("Hello world!")).toBeVisible();

  // Settled snapshot: settled by the barrier above — the frame after `chatOpened` has rendered, so any fetch that
  // event caused is already recorded. A poll would be wrong here (the count only climbs; poll goes green on
  // a value it merely transits).
  await expect.poll(async () => trpc.count("chat.getChat")).toBe(1);
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
    ...CHAT_AMBIENT_ROUTES,
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
    ...CHAT_AMBIENT_ROUTES,
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

// DENSITY S6 (UI-Density-Law.md §2.3): the divider names a REGION of the transcript ("everything below
// this line is in context"), which is the `kicker` voice — micro caps at the section-name weight, with the
// hairline rules either side. Read back computed, because the caps + micro half of that shape was already
// true by taste and only the WEIGHT (and the `voice` attribute that pins the intent) distinguishes a
// kicker from a hand-assembled lookalike.
test("the context-boundary divider's label speaks the kicker voice (a region name, not body prose)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...ROSTER_STUB,
    ...COMPACTED_PREVIEW_FIT,
    "chat.listMessages": () => makeMessagesPage([USER_VIEW, AI_VIEW]),
  });
  await routeOrbSocket(page, { frames: [] });

  const component = await mount(<MessageListSurfaceStory />);

  const label = component.locator('[data-slot="context-boundary-divider"] [data-slot="text"]').first();
  await expect(label).toBeVisible();
  await expect(label).toHaveAttribute("data-voice", "kicker");
  const readTypeAtAssertion = async (): Promise<typeof type> =>
    await label.evaluate((el) => {
      const style = getComputedStyle(el);
      const probe = el.ownerDocument.createElement("div");
      el.ownerDocument.body.append(probe);
      probe.style.fontSize = "var(--text-micro)";
      const micro = getComputedStyle(probe).fontSize;
      probe.remove();
      return { size: style.fontSize, weight: style.fontWeight, transform: style.textTransform, micro };
    });
  const type = await label.evaluate((el) => {
    const style = getComputedStyle(el);
    const probe = el.ownerDocument.createElement("div");
    el.ownerDocument.body.append(probe);
    probe.style.fontSize = "var(--text-micro)";
    const micro = getComputedStyle(probe).fontSize;
    probe.remove();
    return { size: style.fontSize, weight: style.fontWeight, transform: style.textTransform, micro };
  });
  await expect.poll(async () => (await readTypeAtAssertion()).size).toBe(type.micro);
  await expect.poll(async () => (await readTypeAtAssertion()).transform).toBe("uppercase");
  await expect.poll(async () => (await readTypeAtAssertion()).weight).toBe("600");
});

// ── THE TAIL FLASH: the ghost must hand over to a canon row that is ALREADY CORRECT ─────────────────
// The defect (measured live 2026-08-14, 100-400 ms on EVERY turn — `domain/chat/verbs/turn.ts`
// FLAG[aux-turns-have-no-accept]): `turnCompleted` closes the client turn slot SYNCHRONOUSLY, so the ghost —
// which is holding the finished text — unmounted while the `listMessages` refetch was still in flight, and
// the canon row underneath repainted its PRE-TURN content for the whole round trip. On a swipe that is the
// OLD VARIANT coming back after the new one had been read; on a fresh reply it is the row vanishing.
//
// The fix is two halves, and each test below fails without EITHER: the seam applies the commit's `view`
// carrier into the message-list cache (`data/invalidation.ts` applyCanonView), and the ghost yields at that
// commit instead of at `turnCompleted` (`use-message-items.ts`, via the slot's `committedMessageId`).
//
// WHY THE REFETCH IS HELD OPEN rather than delayed: a flash is a timing window, and asserting "the old text
// never appeared" inside one is exactly the CT that passes in isolation and flakes under contention. Holding
// the post-turn refetch open FOREVER turns the window into a SETTLED state — the rendered arm under test is
// then stable and the assertion is a barrier, not a race. It is also the honest model of the defect: what
// the reader saw for those 400 ms is what these tests read with the refetch permanently outstanding.

/** Hold every `chat.listMessages` request after the first one OPEN (never fulfilled) — see the note above.
 *  Registered AFTER routeTrpc so it runs FIRST per request (Playwright routes are LIFO); everything else
 *  falls through unchanged. */
async function holdListMessagesRefetch(page: Page): Promise<void> {
  let served = 0;
  await page.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("chat.listMessages")) {
      served += 1;
      if (served > 1) {
        return; // deliberately never settled — the refetch is "still in flight" for the rest of the test
      }
    }
    await route.fallback();
  });
}

/** The swiped slot's NEW variant, as the server's `messageCommitted` carrier hands it over: same row id,
 *  new selected variant. This is the row a refetch would return — the carrier is the same `loadMessageView`
 *  projection `listMessages` runs (`engine.ts` readCommittedView). */
const AI_REROLLED = makeMessageView({
  id: AI_VIEW.id,
  role: "assistant",
  content: "Fresh take",
  seq: AI_VIEW.seq,
  selectedVariantIdx: 1,
  variantCount: 2,
});

const SWIPE_TURN: ChatBusEvent[] = [
  {
    type: "turnStarted",
    chatId: CHAT_ID,
    intent: "swipe",
    api: "chat-completions",
    provider: castId<ProviderId>("openrouter"),
    model: "test-model",
    speakerCharacterId: null,
    targetMessageId: AI_VIEW.id,
  },
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "Fresh " } },
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: "take" } },
  { type: "messageCommitted", chatId: CHAT_ID, messageId: AI_VIEW.id, view: AI_REROLLED },
  { type: "turnCompleted", chatId: CHAT_ID, intent: "swipe", messageId: AI_VIEW.id },
];

test("a completed SWIPE keeps the new variant on screen with the refetch still in flight (no old-variant repaint)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...PREVIEW_FIT_STUB,
    // The FIRST read is the pre-swipe canon; every later one is held open (see holdListMessagesRefetch), so
    // the only way the new variant can be on screen is the carrier the seam applied.
    "chat.listMessages": () => makeMessagesPage([USER_VIEW, AI_VIEW]),
    // FED, not incidental (the unfed-read ratchet named it): the carrier lands `AI_REROLLED` with
    // `variantCount: 2`, which is exactly what UN-GATES `useVariantHistory` (`useGatedQuery` fires only
    // for a slot that HAS siblings) — so this is the one mount in the file whose swipe strip really asks
    // for the sibling set, and answering it `null` left that resolver running inert behind a green test.
    "chat.listMessageVariants": () => [
      { variantId: AI_VIEW.selectedVariantId, idx: 0 },
      { variantId: AI_REROLLED.selectedVariantId, idx: 1 },
    ],
    ...ROSTER_STUB,
  });
  await routeOrbSocket(page, { frames: chatFrames(SWIPE_TURN), awaitAttaches: 1 });
  await holdListMessagesRefetch(page);

  const component = await mount(<MessageListSurfaceStory />);

  // Settled state: the turn is over (slot closed, ghost gone) and the refetch will never land.
  await expect(component.locator('[data-slot="ghost-message-row"]')).toHaveCount(0);
  // The rerolled variant is CANON now — one row, carrying the new bytes.
  await expect(component.locator('[data-message-id="msg_ai"]')).toHaveCount(1);
  await expect(component.getByText("Fresh take")).toBeVisible();
  // The defect's signature: the pre-swipe variant coming back the moment the ghost unmounted.
  await expect(component.getByText("Hello world")).toHaveCount(0);
});

// The same defect on a FRESH REPLY, where it reads as the row disappearing rather than reverting: the ghost
// unmounts at `turnCompleted` and canon has no row for the reply until the refetch lands.
const SEND_TURN: ChatBusEvent[] = [
  ...TURN.slice(0, 3), // turnStarted(send) + the two deltas
  { type: "messageCommitted", chatId: CHAT_ID, messageId: AI_VIEW.id, view: AI_VIEW },
  { type: "turnCompleted", chatId: CHAT_ID, intent: "send", messageId: AI_VIEW.id },
];

test("a completed SEND leaves the reply on screen as CANON with the refetch still in flight (no vanishing row)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...PREVIEW_FIT_STUB, "chat.listMessages": () => makeMessagesPage([USER_VIEW]), ...ROSTER_STUB });
  await routeOrbSocket(page, { frames: chatFrames(SEND_TURN), awaitAttaches: 1 });
  await holdListMessagesRefetch(page);

  const component = await mount(<MessageListSurfaceStory />);

  await expect(component.locator('[data-slot="ghost-message-row"]')).toHaveCount(0);
  // Appended by the carrier — the row the refetch would have brought, without waiting for it.
  await expect(component.locator('[data-message-id="msg_ai"]')).toHaveCount(1);
  await expect(component.getByText("Hello world")).toBeVisible();
  await expect(component.getByText("Ping?")).toBeVisible();
});

// THE HANDOVER ITSELF, pinned at the commit — the frames stop at `messageCommitted`, so the slot is still
// LIVE. The ghost must already be gone (canon carries its bytes) and the reply must appear EXACTLY ONCE:
// applying the carrier while the ghost still held would paint the committed row BESIDE it for the whole
// commit→complete window, which is the defect this half of the fix exists not to introduce.
const SEND_TO_COMMIT: ChatBusEvent[] = SEND_TURN.slice(0, 4);

test("the ghost yields AT THE COMMIT — one row, never the canon row beside a still-mounted ghost", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...PREVIEW_FIT_STUB, "chat.listMessages": () => makeMessagesPage([USER_VIEW]), ...ROSTER_STUB });
  await routeOrbSocket(page, { frames: chatFrames(SEND_TO_COMMIT), awaitAttaches: 1 });
  await holdListMessagesRefetch(page);

  const component = await mount(<MessageListSurfaceStory />);

  await expect(component.locator('[data-message-id="msg_ai"]')).toHaveCount(1);
  await expect(component.locator('[data-slot="ghost-message-row"]')).toHaveCount(0);
  // One copy of the reply — not the ghost's and canon's.
  await expect(component.getByText("Hello world")).toHaveCount(1);
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

/** Scroll the thread off its top edge so `data-fade-top` arms, then sample a proven text-free inset
 * INSIDE the fade band. The old horizontal centre crossed the rendered message glyphs, so it compared
 * ink to CARD_RGB and called the expected dark text a leaking backdrop. */
async function sampleTopBandPixel(page: Page, scroller: Locator): Promise<{ readonly r: number; readonly g: number; readonly b: number }> {
  await scroller.evaluate((el: HTMLElement) => {
    el.scrollTop = 200;
  });
  await expect(scroller).toHaveAttribute("data-fade-top", "");
  await expect.poll(async () => scroller.boundingBox()).not.toBeNull();
  const box = await scroller.boundingBox();
  // 8px below the top edge: deep inside the 10% (~40px) band, where the mask's alpha is ~0.2.
  const point = { x: Math.round((box?.x ?? 0) + (box?.width ?? 0) - 24), y: Math.round((box?.y ?? 0) + 8) };
  const crossesText = await scroller.evaluate((element, sample) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some((rect) => sample.x >= rect.left && sample.x <= rect.right && sample.y >= rect.top && sample.y <= rect.bottom)) {
        return true;
      }
    }
    return false;
  }, point);
  expect(crossesText, "edge-fade framebuffer probe must land on card paint, not text ink").toBe(false);
  return await samplePixel(page, point.x, point.y);
}

test("EDGE FADE: over an art backdrop the thread's top band paints the CARD, not the art behind it", async ({ mount, page }) => {
  const component = await mount(<MessageListEdgeFadeStory artBackdrop={true} />);
  const scroller = component.locator(FADE_SCROLLER);
  await expect(scroller).toHaveCSS("mask-image", "none");
  const pixel = await sampleTopBandPixel(page, scroller);

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
  const scroller = component.locator(FADE_SCROLLER);
  await expect(scroller).not.toHaveCSS("mask-image", "none");
  const pixel = await sampleTopBandPixel(page, scroller);

  // Green pulls far away from the cream card's blue channel long before it reaches the backdrop.
  expect(pixel.b).toBeLessThan(CARD_RGB.b - 24);
});

// ── THE LOADING STATE MUST BE LEGIBLE OVER ART (#468) ─────────────────────────────────────────────
// Resume is the most-pressed action in the app, and the transcript's skeleton DOES paint on the first
// room frame (rAF sampler, #454: skeletonsAtFirstRoomPaint=22 every run). It was still read as an empty
// room for ~400ms, because the fallback painted three `bg-muted` bars straight onto the room's wallpaper
// with nothing behind them — the §0 reading-surface defect the transcript's settled rows solved years
// earlier with `message-row-backing.ts`'s plate family. The loading state now takes the SAME plate, so
// what the reader sees at frame one is a transcript-shaped object rather than three faint bands.
//
// It is a PIXEL assertion for the same reason its edge-fade neighbour above is: what is being asserted is
// what the framebuffer composites (a translucent plate + `backdrop-blur` over art), and `getComputedStyle`
// reports the class list either way. The plate is `in-data-[has-bg-image]`-gated, so the flag-off case is
// this probe's planted positive control — it must still read the raw backdrop.

/** The story's backdrop, restated here (a `_ct-stories` spec import may name COMPONENTS only). */
const ART_BACKDROP_GREEN = 255;

/** One pixel of the transcript's loading band, sampled just ABOVE the first skeleton bar — inside the
 *  plate's own block padding, at the horizontal centre so no rounded corner is in play. */
async function sampleLoadingPlatePixel(page: Page, skeleton: Locator): Promise<{ readonly r: number; readonly g: number; readonly b: number }> {
  await expect(skeleton).toBeVisible();
  await expect.poll(async () => skeleton.boundingBox()).not.toBeNull();
  const box = await skeleton.boundingBox();
  return await samplePixel(page, Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2), Math.round((box?.y ?? 0) - 4));
}

test("LOADING OVER ART: the transcript's skeleton rides a reading plate, not the raw wallpaper", async ({ mount, page }) => {
  // A hold that is never released makes the suspense fallback a SETTLED render — the CT never has to
  // catch a flash, and the state it asserts is the one Resume actually shows for its first frames.
  const hold = trpcHold();
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": hold });
  const component = await mount(<MessageListOverArtStory artBackdrop={true} />);
  await hold.requested;

  const pixel = await sampleLoadingPlatePixel(page, component.locator('[data-slot="skeleton"]').first());

  // The backdrop is pure green. Anything backing the skeleton knocks that channel down hard; the raw
  // wallpaper leaves it pinned at the top of the range.
  expect(pixel.g).toBeLessThan(ART_BACKDROP_GREEN - 48);
});

// ── #690: THE BARS ON THAT PLATE, in a LIGHT carried room ─────────────────────────────────────────
// The pair above proves the loading block is an OBJECT over art. This one asks the question that leaves
// open: can you see the three bars ON it? On a LIGHT palette `muted` (−0.03) and `accent` (−0.05) sit
// ΔL 0.008 / 0.012 from the reading plate (−0.038) — and the shimmer's 200%-wide `::after` means those two
// ARE the bar whenever motion is on. Measured pre-fix at 1.01:1 over bright art: a blank card where the
// transcript's "something is happening" belongs. Both stops + the reduced-motion base fill now take the
// palette's polarity-DERIVED alpha washes (`message-row-backing.ts` states the algebra).
//
// PIXELS, not computed style: the bar is composited over a translucent plate over art, and the class list
// is identical in both arms. The ratio is the shared WCAG kernel over two framebuffer samples — the bar's
// own centre against the plate 4px above it.
/** The worst legal art for a LIGHT plate is the BRIGHT one (D144/#217's polarity inversion), and it is
 *  where the pre-fix bar measured its 1.01. */
const LIGHT_ROOM_WORST_ART = "#ffffff";
/** A near-white carried base — the Light seed's own surface, the polarity this defect lives on. */
const LIGHT_ROOM_PALETTE = "oklch(0.98 0.004 75)";
/** Visibly distinct, not merely non-identical. `muted`-on-plate could reach 1.22 over the DARKEST art and
 *  still vanish over the brightest; the derived washes hold ~1.26 whatever the art is, so this floor is
 *  one the old token cannot reach in the arm that failed. */
const SKELETON_ON_PLATE_FLOOR = 1.2;

test("#690 LOADING OVER ART, LIGHT ROOM: the skeleton bars are visibly distinct from the plate they ride", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": hold });
  const component = await mount(<MessageListOverArtStory artBackdrop={true} art={LIGHT_ROOM_WORST_ART} palette={LIGHT_ROOM_PALETTE} />);
  await hold.requested;

  const skeleton = component.locator('[data-slot="skeleton"]').first();
  await expect(skeleton).toBeVisible();
  await expect.poll(async () => skeleton.boundingBox()).not.toBeNull();
  const box = await skeleton.boundingBox();
  // Settled snapshot: the visibility barrier settled the box; a framebuffer read is a SEQUENTIAL browser op.
  const plate = await sampleLoadingPlatePixel(page, skeleton);
  const bar = await samplePixel(page, Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2), Math.round((box?.y ?? 0) + (box?.height ?? 0) / 2));
  const ratio = contrastRatio(bar, plate);
  expect(ratio, `bar ${JSON.stringify(bar)} on plate ${JSON.stringify(plate)}`).toBeGreaterThan(SKELETON_ON_PLATE_FLOOR);
});

test("#690 LOADING OVER ART, REDUCED MOTION: the flat base fill carries the same separation the sweep does", async ({ mount, page }) => {
  // The sweep's `::after` is REMOVED under reduced motion, so this arm measures the bar's own `bg-*` — the
  // one a reduced-motion reader sees, and the half of the fix the two rows above structurally cannot see
  // (the pseudo covers the base whenever motion is on). `page.emulateMedia` re-resolves the mounted tree
  // live; the harness page outlives the test, so it is reset at the end.
  const hold = trpcHold();
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": hold });
  const component = await mount(<MessageListOverArtStory artBackdrop={true} art={LIGHT_ROOM_WORST_ART} palette={LIGHT_ROOM_PALETTE} />);
  await hold.requested;
  await page.emulateMedia({ reducedMotion: "reduce" });

  const skeleton = component.locator('[data-slot="skeleton"]').first();
  await expect(skeleton).toBeVisible();
  await expect.poll(async () => skeleton.boundingBox()).not.toBeNull();
  const box = await skeleton.boundingBox();
  const plate = await sampleLoadingPlatePixel(page, skeleton);
  const bar = await samplePixel(page, Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2), Math.round((box?.y ?? 0) + (box?.height ?? 0) / 2));
  const ratio = contrastRatio(bar, plate);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(ratio, `flat bar ${JSON.stringify(bar)} on plate ${JSON.stringify(plate)}`).toBeGreaterThan(SKELETON_ON_PLATE_FLOOR);
});

test("#690 LOADING OVER ART, DARK ROOM: the same bars stay distinct on the polarity that was never broken", async ({ mount, page }) => {
  // The other arm of the same change — the washes replace `muted`/`accent` on BOTH polarities, so the dark
  // room owes a receipt too. Its worst art is the DARK one (the plate is dark, its inks are light).
  const hold = trpcHold();
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": hold });
  const component = await mount(<MessageListOverArtStory artBackdrop={true} art="#000000" palette="oklch(0.158 0.006 60)" />);
  await hold.requested;

  const skeleton = component.locator('[data-slot="skeleton"]').first();
  await expect(skeleton).toBeVisible();
  await expect.poll(async () => skeleton.boundingBox()).not.toBeNull();
  const box = await skeleton.boundingBox();
  const plate = await sampleLoadingPlatePixel(page, skeleton);
  const bar = await samplePixel(page, Math.round((box?.x ?? 0) + (box?.width ?? 0) / 2), Math.round((box?.y ?? 0) + (box?.height ?? 0) / 2));
  const ratio = contrastRatio(bar, plate);
  expect(ratio, `bar ${JSON.stringify(bar)} on plate ${JSON.stringify(plate)}`).toBeGreaterThan(SKELETON_ON_PLATE_FLOOR);
});

test("LOADING OVER ART CONTROL: the same probe reads the raw backdrop where no art flag is set", async ({ mount, page }) => {
  // No `data-has-bg-image` ⇒ the plate is inert by construction (a plain-background room is byte-identical
  // to before this fix). This is the planted positive control: if the sampler ever stops seeing the naked
  // backdrop here, the assertion above is measuring nothing.
  const hold = trpcHold();
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": hold });
  const component = await mount(<MessageListOverArtStory artBackdrop={false} />);
  await hold.requested;

  const pixel = await sampleLoadingPlatePixel(page, component.locator('[data-slot="skeleton"]').first());

  expect(pixel.g).toBeGreaterThan(ART_BACKDROP_GREEN - 8);
});

// ── #681: THE ERROR STATE'S READING SURFACE (the over-art family's fifth member) ───────────────────
// The sibling pair directly above proves the LOADING state rides a plate over art. The ERROR state — the
// other side of the same read, rendered into the same empty column by the same `QueryBoundary` — had no
// surface at all: side-eye pixel-measured its `[role=status]` line at 1.50:1 and its Retry at 1.57:1 over
// a carried-art room. These are PIXEL receipts through the shared `pixelContrast` kernel, because the
// composite is what a reader sees and `getComputedStyle` reports the same class list in both arms.
//
// TWO WIDTHS, because a point measurement never proves a range property (the desktop mount and the
// narrow one wrap the copy differently, and the plate must follow the text either way).
//
// THE ART IS WHITE ON PURPOSE: the story's palette is the dark seed, so the error ink is the LIGHT muted
// tone and the worst legal wallpaper is the BRIGHT one (D144/#217's polarity inversion).
const ERROR_WORST_ART = "#ffffff";
/** WCAG AA for normal text — what a room's failure message and its recovery control owe their backdrop. */
const AA_NORMAL_TEXT = 4.5;
const ERROR_CONTRAST_WIDTHS = [
  { label: "desktop", width: 1280, height: 800 },
  { label: "mobile", width: 430, height: 932 },
] as const;

for (const { label, width, height } of ERROR_CONTRAST_WIDTHS) {
  test(`#681 ${label} (${String(width)}px): the transcript's ERROR state clears AA over worst-case art`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height });
    // The read FAILS — the one input that makes `renderError` the settled render of this column.
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": trpcError({ code: "INTERNAL_SERVER_ERROR", message: "boom" }) });

    const component = await mount(<MessageListOverArtStory artBackdrop={true} art={ERROR_WORST_ART} fullWidth={true} />);

    // The barrier: the error state is actually rendered, so neither measurement below can be vacuous.
    const status = component.getByRole("status");
    await expect(status).toBeVisible();
    await expect(status).toHaveText("Couldn't load this conversation.");
    const retry = component.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();

    // Settled snapshot: both boxes are settled by the visibility barriers above; a framebuffer read is a
    // SEQUENTIAL browser operation, so the two samples cannot be taken concurrently.
    const statusContrast = await pixelContrast(page, status);
    expect(statusContrast.ratio, `error copy: ${statusContrast.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    const retryContrast = await pixelContrast(page, retry);
    expect(retryContrast.ratio, `retry control: ${retryContrast.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
}

test("#681 CONTROL: with no art flag the SAME probe reads the raw backdrop — the plate is self-gated", async ({ mount, page }) => {
  // The planted positive control for the pair above, and the byte-identity half of the fix: the plate is
  // self-gated on `in-data-[has-bg-image]` exactly like its four siblings, so a plain-background room
  // paints nothing new. If this probe ever stops seeing the naked backdrop here, the two measurements
  // above are measuring nothing (the LOADING pair's control, same argument, same shape).
  await page.setViewportSize({ width: 1280, height: 800 });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": trpcError({ code: "INTERNAL_SERVER_ERROR", message: "boom" }) });

  const component = await mount(<MessageListOverArtStory artBackdrop={false} art={ERROR_WORST_ART} fullWidth={true} />);

  const status = component.getByRole("status");
  await expect(status).toBeVisible();
  // Settled snapshot: the visibility barrier above settled the box; a framebuffer read is sequential.
  const contrast = await pixelContrast(page, status);
  // The raw white story backdrop, unplated — and therefore the DEFECT's own number, which is what makes
  // the ≥AA assertions above a receipt for the plate rather than for the palette.
  expect(contrast.backdrop.r, contrast.describe).toBeGreaterThan(240);
  expect(contrast.ratio, contrast.describe).toBeLessThan(AA_NORMAL_TEXT);
});

// ── #107: the transcript's cost to a keyboard reader ──────────────────────────────────────────────
// The defect this pins: BEFORE the roving mode, every message contributed its whole action cluster to
// the document tab order (measured live: ~7 stops per message — Edit / Fork / More / View raw / Expand
// card / Collapse card / the card iframe), so reaching the composer cost O(thread length) Tabs — 32 of
// them on a real room without arriving. The contract is not "few stops"; it is that the number does not
// MOVE when the thread grows, which is why this is one assertion across two thread lengths and not a
// magic-number check.

/** N canon rows, alternating user/assistant so every row renders the editable action cluster. */
function walkThread(count: number): ReturnType<typeof makeMessageView>[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessageView({
      id: castId<MessageId>(`msg_walk_${i}`),
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Walk row ${i}`,
      seq: i + 1,
    }),
  );
}

/** Tabs from `walk-start` until `walk-end` holds focus, and returns how many presses that took.
 *  Returns `cap` when the walk never arrives — a number, so the assertion reads as a comparison rather
 *  than a timeout. */
async function tabsToReachEnd(page: Page, cap: number): Promise<number> {
  await page.getByTestId("walk-start").focus();
  for (let pressed = 1; pressed <= cap; pressed += 1) {
    await page.keyboard.press("Tab");
    const arrived = await page.getByTestId("walk-end").evaluate((el) => el === document.activeElement);
    if (arrived) {
      return pressed;
    }
  }
  return cap;
}

const TAB_WALK_CAP = 60;

test("TAB BUDGET: the transcript costs the same number of Tab presses at 3 messages and at 15", async ({ mount, page }) => {
  const shortThread = walkThread(3);
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(shortThread) });
  await routeOrbSocket(page, { frames: [], awaitAttaches: 0 });

  const shortMount = await mount(<MessageListTabWalkStory />);
  await expect(shortMount.getByText("Walk row 2")).toBeVisible();
  const shortWalk = await tabsToReachEnd(page, TAB_WALK_CAP);
  expect(shortWalk).toBeLessThan(TAB_WALK_CAP);
  await shortMount.unmount();

  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(walkThread(15)) });
  const longMount = await mount(<MessageListTabWalkStory />);
  await expect(longMount.getByText("Walk row 14")).toBeVisible();
  const longWalk = await tabsToReachEnd(page, TAB_WALK_CAP);

  expect(longWalk).toBe(shortWalk);
});

test("ROVING: arrows move the tab stop between rows, and Escape hands focus back from a row's controls", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(walkThread(6)) });
  await routeOrbSocket(page, { frames: [], awaitAttaches: 0 });
  const component = await mount(<MessageListTabWalkStory />);
  await expect(component.getByText("Walk row 5")).toBeVisible();

  const activeRow = component.locator('[data-slot="message-list-row"][data-active]');
  const rowFour = component.locator('[data-slot="message-list-row"][data-index="4"]');
  const rowFourFocused = async (): Promise<boolean> => await rowFour.evaluate((el) => el === document.activeElement);

  // The single stop lands on the TAIL row (where a bottom-anchored reader is looking).
  await page.getByTestId("walk-start").focus();
  await page.keyboard.press("Tab");
  await expect(activeRow).toHaveAttribute("data-index", "5");

  // ArrowUp walks the stop up a row and takes focus with it.
  await page.keyboard.press("ArrowUp");
  await expect(activeRow).toHaveAttribute("data-index", "4");
  await expect.poll(rowFourFocused).toBe(true);

  // Tab enters that row's own controls (auto-entry restored them to the tab order) …
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Edit message");

  // … and Escape hands focus back to the row, which is the documented exit gesture.
  await page.keyboard.press("Escape");
  await expect.poll(rowFourFocused).toBe(true);
});

test("ROVING: the edit-in-place path survives suppression — reached by MOUSE, then Tabbed through by keyboard", async ({ mount, page }) => {
  // The failure mode a naive suppression would ship: a reader clicks Edit (pointer focus still works on a
  // tabindex=-1 control), lands in the textarea, and then cannot Tab to Save because the row was never
  // "entered". Auto-entry on focusin is what prevents it, and this is the case that proves it.
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(walkThread(4)) });
  await routeOrbSocket(page, { frames: [], awaitAttaches: 0 });
  const component = await mount(<MessageListTabWalkStory />);
  await expect(component.getByText("Walk row 3")).toBeVisible();

  // The cluster rests hidden + pointer-events-none (`messageActionsRevealClass`), so a real pointer
  // reaches it only over the row — hover first, exactly as a mouse user does.
  await component.locator('[data-slot="message-row"]').last().hover();
  await component.getByRole("button", { name: MESSAGE_EDIT_NAME }).last().click();
  const textarea = component.getByRole("textbox", { name: MESSAGE_EDIT_NAME });
  await expect(textarea).toBeVisible();
  await textarea.focus();

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Cancel edit");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Save edit");
});

// ── #488 (REFUTED, and pinned so it stays refuted): a FEATURE-CONTRIBUTED disclosure IS in the walk ──
// A review filed the rpg turn-tool-calls trigger as keyboard-unreachable on the evidence that it carries
// `tabindex="-1"` while enabled, and attributed the attribute to Base UI. Both halves are wrong and the
// second is why the first looked true: `row-roving.ts` writes that -1 — every control in an unentered row
// wears it, `Edit message` included — and it is RESTORED the moment focus enters the row. Re-derived live
// on :5173 (2026-08-22, row 39 of "Example — The Ashen Spire"): focus the row, then Tab →
// `Edit message → Fork chat here → More message actions → "Game actions on this turn — 1" → composer`.
// The review's own walk is that list MINUS the disclosure because it was taken on a row that has none.
//
// This is a FENCE, not a defect proof — it passes at pre-fix HEAD, deliberately. What it protects is the
// property that made the report wrong: the sweep is a DOM sweep, so a control contributed through the
// `message-footer` anchor — one the row's React tree never declares — is suppressed and restored exactly
// like a first-party button. Forcing `tabIndex={0}` on it (the review's prescribed fix) would put every
// thread's disclosures back in the document tab order and re-break the #107 budget above.
test("#488 a message-footer CONTRIBUTED disclosure is a Tab stop inside the entered row", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(walkThread(4)) });
  await routeOrbSocket(page, { frames: [], awaitAttaches: 0 });
  const component = await mount(<MessageListFooterDisclosureStory />);
  await expect(component.getByText("Walk row 3")).toBeVisible();

  const trigger = component.getByRole("button", { name: "What this turn did" }).last();
  await expect(trigger).toBeVisible();
  // At REST it is out of the sequential order — the #107 budget, and the exact observation the review read
  // as the defect.
  await expect(trigger).toHaveAttribute("tabindex", "-1");

  // Enter the row the way a reader does, then Tab until the disclosure holds focus.
  const row = component.locator('[data-slot="message-list-row"]').last();
  await row.focus();
  for (let pressed = 0; pressed < TAB_WALK_CAP; pressed += 1) {
    const landed = await trigger.evaluate((el) => el === document.activeElement);
    if (landed) {
      break;
    }
    await page.keyboard.press("Tab");
  }
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("tabindex", "0");
});

// ── #113: sticky speaker attribution inside a turn taller than the screen ─────────────────────────
// In a group room a long reply scrolls its own name row off the top and the reader loses the speaker.
// The verdict is the VIRTUALIZER'S measurement of this row against the scrollport, not a content-length
// proxy — which is why the control below (a short row in the same mount shape) must come out bare.

const NAME_ROW = '[data-slot="message-name-row"]';
const STUCK_NAME_ROW = '[data-slot="message-name-row"][data-sticky]';
const LIST_SCROLLER = '[data-slot="message-list-scroll"]';

/** Prose long enough to exceed the story's 480px box several times over at the 75ch measure. */
const TALL_BODY = "Sabine turns the lamp down and keeps talking, and the paragraph does not stop. ".repeat(90);

test("#113 a turn taller than the scrollport pins its speaker row to the top of the viewport while the body scrolls under it", async ({ mount, page }) => {
  // `kind: "narrator"` gives the row a REAL resolved speaker name against this file's empty roster stub,
  // so the assertion is about what the reader can still SEE, not merely about a container element.
  const tall = makeMessageView({ id: castId<MessageId>("msg_tall"), role: "assistant", kind: "narrator", content: TALL_BODY, seq: 1 });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage([tall]) });
  await routeOrbSocket(page, { frames: [], awaitAttaches: 0 });
  const component = await mount(<MessageListSurfaceStory />);

  const scroller = component.locator(LIST_SCROLLER);
  await expect(component.locator(STUCK_NAME_ROW)).toHaveCount(1);
  await expect(component.locator(STUCK_NAME_ROW)).toHaveCSS("position", "sticky");
  await expect(component.locator(STUCK_NAME_ROW).getByText("Narrator")).toBeVisible();

  // #204 (the 12px guillotine): the scroller carries NO block padding of its own — the breathing lives
  // in the virtualizer's coordinate space (`blockPaddingToken`). Chrome resolves `sticky; top: 0`
  // against the scroll container's CONTENT box, so a `py-block` here pinned the band 12px below the
  // visible top with a strip of the row's own prose permanently guillotined above it (all four rooms,
  // owner screenshot). RED on the pre-fix source (padding-top was 12px).
  await expect(scroller).toHaveCSS("padding-top", "0px");
  await expect(scroller).toHaveCSS("padding-bottom", "0px");

  // Deep inside the turn, the attribution is STILL on screen and pinned FLUSH to the scrollport's top
  // edge — not one strip of prose renders above it (#204; was `< 24`, tolerating the guillotine).
  await scroller.evaluate((el: HTMLElement) => {
    el.scrollTop = 900;
  });
  const readOffsetFromTop = async (): Promise<number> =>
    scroller.evaluate((el: HTMLElement) => {
      const name = el.querySelector('[data-slot="message-name-row"][data-sticky]');
      if (name === null) {
        return Number.NaN;
      }
      return name.getBoundingClientRect().top - el.getBoundingClientRect().top;
    });
  await expect.poll(readOffsetFromTop).toBeGreaterThanOrEqual(0);
  await expect.poll(readOffsetFromTop).toBeLessThan(1);
  await expect(component.locator(STUCK_NAME_ROW).getByText("Narrator")).toBeVisible();

  // …and the breathing did not vanish, it MOVED: scrolled to the very top, the first row still sits one
  // spacing.block (12px) off the scrollport edge, now provided by the virtualizer's paddingStart.
  await scroller.evaluate((el: HTMLElement) => {
    el.scrollTop = 0;
  });
  const readFirstRowGapAtAssertion = async (): Promise<typeof firstRowGap> =>
    await scroller.evaluate((el: HTMLElement) => {
      const row = el.querySelector('[data-slot="message-list-row"]');
      if (row === null) {
        return Number.NaN;
      }
      return row.getBoundingClientRect().top - el.getBoundingClientRect().top;
    });
  const firstRowGap = await scroller.evaluate((el: HTMLElement) => {
    const row = el.querySelector('[data-slot="message-list-row"]');
    if (row === null) {
      return Number.NaN;
    }
    return row.getBoundingClientRect().top - el.getBoundingClientRect().top;
  });
  await expect.poll(async () => Math.round(await readFirstRowGapAtAssertion())).toBe(12);
});

test("#113 CONTROL: a short turn is left alone — no sticky, no chip, no measured height change", async ({ mount, page }) => {
  const shortRow = makeMessageView({ id: castId<MessageId>("msg_short"), role: "assistant", content: "Two words.", seq: 1 });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage([shortRow]) });
  await routeOrbSocket(page, { frames: [], awaitAttaches: 0 });
  const component = await mount(<MessageListSurfaceStory />);

  await expect(component.locator(NAME_ROW)).toHaveCount(1);
  await expect(component.locator(STUCK_NAME_ROW)).toHaveCount(0);
  await expect(component.locator(NAME_ROW)).toHaveCSS("position", "static");
});

// ── #1873: a capability WARNING landing mid-turn must not leave the transcript oscillating ──────────
// The owner's report: generating against an endpoint that lacks a requested capability raises the
// `tools_unsupported` notice, and when it arrives DURING a turn the streaming message enters an infinite
// rendering jitter and never settles.
//
// THE MECHANISM THIS PINS (measured — the story's own header carries the mount):
//   1. the engine emits its capability drops AFTER the last delta and BEFORE the turn terminal
//      (`emitCapabilityDropWarnings`, engine.ts) — exactly ONCE per turn — so the notice lands while the
//      turn is still live on the client and the ghost has STOPPED growing;
//   2. `AppToaster` puts the notice in the shell's NOTICE BAND, a flow row of `.shell-main`, so the
//      transcript's containing block genuinely SHRINKS (`shell.css`, #193);
//   3. a smaller scrollport flips `MessageListRowMeta.exceedsViewport` for the live row, which is the
//      `stickyAttribution` verdict — and that verdict must change NO BOX (`message-row-backing.ts`:
//      "going sticky changes NO box", the #167 precedent). When it does, the row's own height re-crosses
//      the threshold that produced the verdict and the verdict inverts, forever.
// The scrollport is therefore CALIBRATED onto that boundary rather than guessed: the test measures the
// live row and the band, then sets the column so the row sits just past the port — the one state where a
// height-changing verdict cannot converge.

const JITTER_SCROLLER = '[data-slot="message-list-scroll"]';
const GHOST_LI = 'li[data-slot="message-list-row"]:has([data-slot="ghost-message-row"])';
const TOAST_ROOT = '[data-slot="toast-root"]';
const NOTICE_BAND = '[data-slot="notice-band"]';

/** Eight paragraphs: taller than a phone's transcript, shorter than the 900px calibration column. */
const JITTER_REPLY = Array.from({ length: 8 }, (_, i) => `Paragraph ${i} of a reply that keeps going for a while yet.`).join("\n\n");

const WARNED_TURN: ChatBusEvent[] = [
  {
    type: "turnStarted",
    chatId: CHAT_ID,
    intent: "send",
    api: "chat-completions",
    provider: castId<ProviderId>("openrouter"),
    model: "test-model",
    speakerCharacterId: null,
    targetMessageId: null,
  },
  { type: "delta", chatId: CHAT_ID, slotSeq: AI_VIEW.seq, delta: { chatId: CHAT_ID, kind: "text", text: JITTER_REPLY } },
  // The production ORDER: the drop warning rides between the last delta and the terminal.
  { type: "warning", chatId: CHAT_ID, code: "tools_unsupported" },
];

/** A room whose output dial is `narrator`, so the GHOST resolves a real speaker name (and therefore a
 *  real name row to make sticky) against this file's empty roster — the #113 test's own idiom. */
const NARRATOR_ROSTER_STUB = {
  ...PREVIEW_FIT_STUB,
  "chat.getChat": (): { participants: never[]; anchorPersonaId: null; identities: readonly ChatIdentity[]; group: GroupConfig } => ({
    participants: [],
    anchorPersonaId: null,
    identities: [],
    group: { ...DEFAULT_GROUP_CONFIG, output: "narrator" },
  }),
};

/** Tall enough that the live row fits inside it with the band up — the calibration state. */
const CALIBRATION_COLUMN_PX = 900;
/** How far INSIDE the live row's own height the calibrated scrollport lands: the row then exceeds the
 *  port (⇒ sticky) by less than the box a height-changing sticky verdict removes (⇒ not sticky). */
const PORT_INSET_PX = 16;

test("#1873 a capability warning raised mid-turn settles: the notice band reflows the transcript ONCE, it does not oscillate", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...NARRATOR_ROSTER_STUB, "chat.listMessages": () => makeMessagesPage([USER_VIEW]) });
  await routeOrbSocket(page, { frames: chatFrames(WARNED_TURN), awaitAttaches: 1 });

  const component = await mount(<MessageListNoticeBandStory columnHeight={CALIBRATION_COLUMN_PX} />);
  const ghost = component.locator(GHOST_LI);
  await expect(ghost).toContainText("Paragraph 7");

  // The notice arrived through the real reducer → the real copy mapper → the real outlet, and it landed
  // in the BAND (a flow row), which is what makes the reflow half reachable at all.
  await expect(component.locator(TOAST_ROOT)).toContainText("Tools were turned off");
  const band = component.locator(NOTICE_BAND);
  await expect.poll(async () => await band.evaluate((el: HTMLElement) => el.getBoundingClientRect().height)).toBeGreaterThan(0);

  // CALIBRATION + the planted control: in a column this tall the live row fits, so the verdict is a
  // settled NO — were it already sticky here, the height measured below would be of the wrong arm.
  await expect(component.locator(STUCK_NAME_ROW)).toHaveCount(0);
  const rowPx = await ghost.evaluate((el: HTMLElement) => el.getBoundingClientRect().height);
  const portPx = await component.locator(JITTER_SCROLLER).evaluate((el: HTMLElement) => el.clientHeight);
  const chromePx = CALIBRATION_COLUMN_PX - portPx;

  // …now put the scrollport just inside the row, which is where the reported defect lives.
  await component.update(<MessageListNoticeBandStory columnHeight={Math.round(rowPx) - PORT_INSET_PX + chromePx} />);

  // THE OBSERVABLE IS THE ROW'S RENDERED HEIGHT, SAMPLED PER FRAME — a judder is a geometry fact, and a
  // two-point read across two idle windows catches the same phase of a per-frame alternation half the time
  // (measured: 250 → 226 → 250 on three consecutive 400ms samples of the defect). 30 frames of DISTINCT
  // heights answers "did it settle" without a phase lottery: a settled row reports exactly one.
  const heightsOverFrames = async (): Promise<readonly number[]> =>
    await ghost.evaluate(
      async (el: HTMLElement) =>
        await new Promise<number[]>((resolve) => {
          const seen: number[] = [];
          const tick = (): void => {
            seen.push(Math.round(el.getBoundingClientRect().height));
            if (seen.length < 30) {
              requestAnimationFrame(tick);
              return;
            }
            resolve([...new Set(seen)]);
          };
          requestAnimationFrame(tick);
        }),
    );
  await page.evaluate(
    async () =>
      await new Promise<void>((resolve) => {
        // One settle window for the reflow the resize legitimately causes.
        setTimeout(resolve, 400);
      }),
  );
  const distinctHeights = await heightsOverFrames();

  expect(distinctHeights).toHaveLength(1);
  // The sticky verdict changed NO box: the row measures what it measured before it went sticky.
  expect(distinctHeights[0]).toBe(Math.round(rowPx));

  // The notice is STILL up (its 12s life has not expired) — otherwise the band would have released its
  // height and the sampling above would be of a state the defect cannot occur in.
  await expect(component.locator(TOAST_ROOT)).toBeVisible();
  // …and the row really is past the port, i.e. the sample was taken at the boundary this test exists for
  // — and the verdict SETTLED there, rather than alternating across it.
  await expect(component.locator(STUCK_NAME_ROW)).toHaveCount(1);
});
