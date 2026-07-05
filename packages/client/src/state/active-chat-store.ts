// The ACTIVE-CHAT store (UI-Arch §5.1) — the shared state substrate below BOTH the chat and character
// features that homes "which chat is the CONTENT hero showing". It is the `this_chid` successor done
// RIGHT: the anti-jank rule (§5.1) forbids a surface that reads an ambient active-chat AND effects off
// it (the neo `this_chid` chase). Here that is impossible BY CONSTRUCTION — every writer (the character
// card's "start chat", the message row's Fork, the chat-list's select) only CALLS a module action; the
// ONLY reactive reader is the route (routes/home-page.tsx), which reads the handle and renders the right
// CONTENT. No surface reads-and-effects, so nothing can chase. Same blessed shape as `shell-store.ts`
// (many leaf writers, one reader), one layer down (per-chat, not per-section).
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
  const sessionKey = nextSessionKey();
  useActiveChatStore.setState(
    { handle: draftChat(sessionKey), draftSeed: seed, sessionKey },
    true,
    "activeChat/startNew",
  );
}

/** Make an existing committed chat active (the chat-list select, and the Fork-nav landing). Keyed by
 *  the chat id, so re-selecting the same chat is idempotent and switching chats remounts the slot. */
export function selectChat(chatId: ChatId): void {
  useActiveChatStore.setState(
    { handle: committedChat(chatId), draftSeed: undefined, sessionKey: chatId },
    true,
    "activeChat/select",
  );
}

/** Record that the active DRAFT has committed to a real chat (fired from the route's `onChatStarted`
 *  seam). Promotes the handle draft→committed WITHOUT changing `sessionKey`, so the surface does NOT
 *  remount mid-first-turn (see THE KEY DISCIPLINE) — a later rail round-trip then reconstructs the
 *  committed chat, not a stale draft. A no-op if the active chat is no longer that draft (the user
 *  navigated on): the committed id would not match the current slot, so we only apply when still a draft. */
export function commitDraft(chatId: ChatId): void {
  const { handle, draftSeed, sessionKey } = useActiveChatStore.getState();
  if (isCommitted(handle)) {
    return; // already committed / moved on — nothing to promote
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
  useActiveChatStore.setState(
    { handle: landingChat(), draftSeed: undefined, sessionKey: nextSessionKey() },
    true,
    "activeChat/goToLanding",
  );
}

// ── The read API — narrow hooks so the route re-renders only on the slice it reads. ──

/** The active chat's handle (draft|committed) — the route's read gate for which CONTENT to render. */
export function useActiveChatHandle(): ChatHandle {
  return useActiveChatStore((s) => s.handle);
}

/** The active chat's new-chat seed — threaded to `ChatRoomSurface.draftSeed`. */
export function useActiveDraftSeed(): DraftSeed | undefined {
  return useActiveChatStore((s) => s.draftSeed);
}

/** The stable slot key — threaded to `ChatRoomSurface`'s React `key` (see THE KEY DISCIPLINE). */
export function useActiveSessionKey(): string {
  return useActiveChatStore((s) => s.sessionKey);
}
