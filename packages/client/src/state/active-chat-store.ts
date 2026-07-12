// The ACTIVE-CHAT store (UI-Arch §5.1) — the shared state substrate below BOTH the chat and character
// features that homes "which chat is the CONTENT hero showing". It is the `this_chid` successor done
// RIGHT: the anti-jank rule (§5.1) forbids a surface that reads an ambient active-chat AND EFFECTS off
// it (the neo `this_chid` chase). Writers (the character card's "start chat", the message row's Fork,
// the chat-list's select) only CALL a module action. Readers come in exactly the two §5.1 sanctioned
// shapes — both RENDER-only:
//   • the COMPOSITION reader — the route (routes/home-page.tsx) reads the handle and renders the right
//     CONTENT/LIST/CONTEXT; chat surfaces then receive the handle as a PROP, never re-reading it.
//   • MIRROR readers — shell-chrome panels whose JOB is reflecting the active artifact and that the
//     route cannot prop-thread (they mount in shell slots, and app-shell is domain-agnostic): e.g. the
//     rail-foot persona panel's "This chat" section reads `useActiveChatId()` and fetches its own data
//     via Query keyed by that id. The store carries the POINTER, never entity data.
// What stays banned is subscribe-and-EFFECT: an effect keyed on a selection pointer is the chase (gate
// `no-effect-on-shared-selection`); the sanctioned escape for "do X when the selection changes" render
// work is deriving in render — not an effect. Same blessed shape as `shell-store.ts` (many leaf
// writers, render-only readers), one layer down (per-chat, not per-section).
//
// This file also HOMES `DraftSeed` — the founding-roster seed a new chat carries until first send
// promotes it (relocated from features/chat/hooks/use-send-message.ts): state owns the seed the same way
// it already owns `ChatHandle`, keeping the flow one-directional (feature → state, never a cycle). The
// chat feature re-exports it from use-send-message so its own front door stays stable.
//
// THE KEY DISCIPLINE (why `sessionKey` is separate from `handle`): the route uses `sessionKey` as
// `ChatRoomSurface`'s React `key`. It changes ONLY when the user starts a NEW chat or selects a
// DIFFERENT existing one — NOT when a draft commits (`commitDraft`). If the key flipped at commit
// (draftKey → chatId), React would REMOUNT the surface exactly mid-first-turn: tearing down the live
// `useChatBus` SSE subscription and the in-flight `useSendMessage` instance that is still awaiting the
// send. A stable key lets the very first generation stream through uninterrupted (the whole point of
// this flow). `handle` still carries the draft|committed discriminant for the read gate; `sessionKey`
// carries slot identity.
//
// State-law recap (gate `state:files`): one store per file, ≤10 fields, no exported set/getState —
// callers use the intent-named module actions + narrow read hooks below, never the raw handle.

import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { withViewTransition } from "#lib";
import type { ChatHandle } from "./chat-handle";
import { committedChat, draftChat, isCommitted, landingChat } from "./chat-handle";
import { createGatedStore } from "./create-gated-store";

/** The founding-roster seed a draft chat carries until its first send calls `chat.startChat` (see the
 *  header for the home relocation). All fields optional — an empty seed is a legal narrator-only room. */
export interface DraftSeed {
  /** The founding cast. @defaultValue [] (a narrator-only room). */
  readonly characterIds?: readonly CharacterId[] | undefined;
  readonly anchorPersonaId?: PersonaId | null | undefined;
  readonly title?: string | null | undefined;
}

interface ActiveChatState {
  /** The active chat's handle — a draft (composer-only, no server row) or a committed chat. */
  readonly handle: ChatHandle;
  /** The new-chat seed (roster/persona/title) — consumed by the composer's draft→committed send. */
  readonly draftSeed: DraftSeed | undefined;
  /** The stable React key for the active-chat slot — see THE KEY DISCIPLINE in the header. */
  readonly sessionKey: string;
}

// A monotonic session counter (deterministic — no randomness): each new-chat click mints a fresh key so
// consecutive drafts remount to a clean composer. Module-scope singleton, same posture as chat-stream's
// module helpers (the store is a singleton; this counter rides with it).
let sessionSeq = 0;
function nextSessionKey(): string {
  sessionSeq += 1;
  return `draft-${sessionSeq}`;
}

const INITIAL_SESSION_KEY = nextSessionKey();

const useActiveChatStore = createGatedStore<ActiveChatState>(
  "active-chat",
  (): ActiveChatState => ({
    // The at-rest LANDING state (D62 P4 / J1): nothing selected → the route renders the landing surface
    // (hero + recents + quick-picks), never an empty room. `startNewChat`/`selectChat` transition out of
    // it; `goToLanding` returns to it. The `sessionKey` still carries slot identity (unused while landing,
    // since no `ChatRoomSurface` mounts).
    handle: landingChat(),
    draftSeed: undefined,
    sessionKey: INITIAL_SESSION_KEY,
  }),
);

// ── The write API — intent-named module actions (the store handle never escapes this file, §5). ──

/** Start a brand-new draft chat, optionally seeded with a founding roster (the character library's
 *  "start chat with X"). Mints a fresh `sessionKey` so the composer remounts clean. */
export function startNewChat(seed?: DraftSeed): void {
  // D5 crossfade (UI-Arch §4a): the three USER-driven CONTENT pane swaps (new-chat, select-a-chat,
  // return-to-landing) each swap what the CONTENT hero shows at a constant `/`, so the router's VT never
  // fires — hand-drive it here so every leaf writer inherits the crossfade. `commitDraft` is deliberately
  // NOT wrapped: it's a mid-first-turn draft→committed promotion that keeps the SAME `sessionKey` (no
  // remount, THE KEY DISCIPLINE above), not a visible pane swap — animating it would flash the live room.
  // `withViewTransition` gates reduced-motion + support once.
  withViewTransition(() => {
    const sessionKey = nextSessionKey();
    useActiveChatStore.setState(
      { handle: draftChat(sessionKey), draftSeed: seed, sessionKey },
      true,
      "activeChat/startNew",
    );
  });
}

/** Make an existing committed chat active (the chat-list select, and the Fork-nav landing). Keyed by
 *  the chat id, so re-selecting the same chat is idempotent and switching chats remounts the slot. */
export function selectChat(chatId: ChatId): void {
  // D5 crossfade (see startNewChat) — a user-driven CONTENT pane swap.
  withViewTransition(() => {
    useActiveChatStore.setState(
      { handle: committedChat(chatId), draftSeed: undefined, sessionKey: chatId },
      true,
      "activeChat/select",
    );
  });
}

/** Record that the active DRAFT has committed to a real chat (fired from the route's `onChatStarted`
 *  seam, which carries the ORIGINATING draft's `forDraftKey`). Promotes the handle draft→committed
 *  WITHOUT changing `sessionKey`, so the surface does NOT remount mid-first-turn (see THE KEY
 *  DISCIPLINE) — a later rail round-trip then reconstructs the committed chat, not a stale draft.
 *
 *  A no-op UNLESS the active slot is STILL that exact draft
 *  (`kind === "draft" && draftKey === forDraftKey`). A late-resolving commit for a draft the user already
 *  navigated away from — a NEWER draft they just started (different draftKey), a `landing` return, or a
 *  chat they selected — must NOT
 *  hijack the active slot: promoting chat A over draft B would flip the handle while `sessionKey` stays
 *  B's, so the room surface keeps rendering draft B while the header/context show chat A (split-brain).
 *  The draftKey correlation is what the old `isCommitted`-only guard was missing. */
export function commitDraft(chatId: ChatId, forDraftKey: string): void {
  const { handle, draftSeed, sessionKey } = useActiveChatStore.getState();
  if (handle.kind !== "draft" || handle.draftKey !== forDraftKey) {
    return; // committed / landing / a DIFFERENT (newer) draft is active now — nothing to promote
  }
  useActiveChatStore.setState(
    { handle: committedChat(chatId), draftSeed, sessionKey },
    true,
    "activeChat/commitDraft",
  );
}

/** Return to the at-rest LANDING state (the topbar brand/home affordance + the "Close chat" action, and
 *  J5's delete-of-the-active-chat: after a delete the CONTENT can't keep pointing at a now-404 chat id).
 *  Mints a fresh `sessionKey` so a subsequent new-chat/select remounts a clean slot. */
export function goToLanding(): void {
  // D5 crossfade (see startNewChat) — a user-driven CONTENT pane swap back to the landing hero.
  withViewTransition(() => {
    useActiveChatStore.setState(
      { handle: landingChat(), draftSeed: undefined, sessionKey: nextSessionKey() },
      true,
      "activeChat/goToLanding",
    );
  });
}

// ── The read API — narrow hooks so the route re-renders only on the slice it reads. ──

/** The active chat's handle (draft|committed) — the route's read gate for which CONTENT to render. */
export function useActiveChatHandle(): ChatHandle {
  return useActiveChatStore((s) => s.handle);
}

/** THE canonical "which committed chat is active" pointer — `null` while landing OR while the active
 *  chat is still an uncommitted draft (no server row → nothing to fetch). Mirror readers use THIS, not
 *  a hand-rolled `isCommitted(handle) ? handle.id : null` (one derivation, one home — re-deriving it
 *  per call site is how the draft case gets forgotten). A primitive selector (id or null, no fresh
 *  object). Data about the chat is NEVER read from here — key a Query off the returned id. */
export function useActiveChatId(): ChatId | null {
  return useActiveChatStore((s) => (isCommitted(s.handle) ? s.handle.id : null));
}

/** The active chat's new-chat seed — threaded to `ChatRoomSurface.draftSeed`. */
export function useActiveDraftSeed(): DraftSeed | undefined {
  return useActiveChatStore((s) => s.draftSeed);
}

/** The stable slot key — threaded to `ChatRoomSurface`'s React `key` (see THE KEY DISCIPLINE). */
export function useActiveSessionKey(): string {
  return useActiveChatStore((s) => s.sessionKey);
}
