// The active-chat store: which chat is the CONTENT hero showing. Writers only call a module action;
// readers are render-only (the composition reader in routes/app-root.tsx, or mirror readers like the
// persona panel's "This chat" section that key a Query off the returned id). Subscribe-and-effect on
// the pointer is banned (gate `no-effect-on-shared-selection`) — derive in render instead.
//
// Also homes `DraftSeed` — the founding-roster seed a new chat carries until first send promotes it.
//
// `sessionKey` is separate from `handle`: it's ChatRoomSurface's React key, and changes only on a NEW
// chat or a DIFFERENT existing one — never on commitDraft, which would remount the surface mid-first-
// turn and tear down the live SSE subscription + in-flight send.

import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { withViewTransition } from "#lib";
import type { ChatHandle } from "./chat-handle";
import { committedChat, draftChat, isCommitted, landingChat } from "./chat-handle";
import { createGatedStore } from "./create-gated-store";
import { openModal, setOpenOverlayPanel } from "./shell-store";

/** The founding-roster seed a draft chat carries until its first send calls `chat.startChat`. All
 *  fields optional — an empty seed is a legal narrator-only room. */
export interface DraftSeed {
  /** The founding cast. @defaultValue [] (a narrator-only room). */
  readonly characterIds?: readonly CharacterId[] | undefined;
  readonly anchorPersonaId?: PersonaId | null | undefined;
  readonly title?: string | null | undefined;
  /** ST "Temporary Chat" (PD-65) — start this room EPHEMERAL: it runs turns normally but never joins the
   *  chats list, and it is swept once past the user's own TTL. A CREATION intent, not editable config, so
   *  it rides the seed rather than the draft-config store: `startChat` is the only writer of the column,
   *  and a fork is born non-temporary. @defaultValue undefined (a plain, permanent new chat). */
  readonly temporary?: boolean | undefined;
}

interface ActiveChatState {
  readonly handle: ChatHandle;
  readonly draftSeed: DraftSeed | undefined;
  readonly sessionKey: string;
  /** The seed the new-chat PICKER opens pre-loaded with, so there is ONE creation ceremony: an opener with
   *  a creation-only intent (the home temp-chat tile) presets the flag here and opens the same modal every
   *  other "New chat" affordance opens, instead of forking a second launcher that skips the cast pick.
   *  Lives beside `draftSeed` because it is the same shape at an earlier moment; the picker clears it on
   *  unmount, so a later plain "New chat" can never inherit a stale intent. */
  readonly newChatPreset: DraftSeed | undefined;
}

// Deterministic monotonic counter: each new-chat click mints a fresh key so consecutive drafts remount
// to a clean composer.
let sessionSeq = 0;
function nextSessionKey(): string {
  sessionSeq += 1;
  return `draft-${sessionSeq}`;
}

const INITIAL_SESSION_KEY = nextSessionKey();

const useActiveChatStore = createGatedStore<ActiveChatState>(
  "active-chat",
  (): ActiveChatState => ({
    // Nothing selected → the route renders the landing surface, never an empty room.
    handle: landingChat(),
    draftSeed: undefined,
    sessionKey: INITIAL_SESSION_KEY,
    newChatPreset: undefined,
  }),
);

// ── The write API — intent-named module actions (the store handle never escapes this file). ──

/** Start a brand-new draft chat, optionally seeded with a founding roster. Mints a fresh `sessionKey`
 *  so the composer remounts clean. */
export function startNewChat(seed?: DraftSeed): void {
  // The three user-driven CONTENT pane swaps (new-chat, select-a-chat, return-to-landing) hand-drive
  // the crossfade since the router's VT never fires at a constant route. commitDraft is NOT wrapped —
  // it keeps the same sessionKey (no remount), so animating it would flash the live room.
  withViewTransition(() => {
    const sessionKey = nextSessionKey();
    useActiveChatStore.setState({ handle: draftChat(sessionKey), draftSeed: seed, sessionKey, newChatPreset: undefined }, true, "activeChat/startNew");
  });
}

/** Open the new-chat PICKER with a seed preset — the ONE creation ceremony. An opener whose intent is a
 *  creation-only FLAG (the home temp-chat tile) presets it here rather than bypassing the cast pick. */
export function openNewChatPicker(preset?: DraftSeed): void {
  useActiveChatStore.setState({ newChatPreset: preset }, false, "activeChat/openNewChatPicker");
  openModal("newChat");
}

/** Drop the picker's preset — called by the picker itself on unmount, so a modal dismissed without
 *  starting anything can never leak its intent into the next plain "New chat". */
export function clearNewChatPreset(): void {
  useActiveChatStore.setState({ newChatPreset: undefined }, false, "activeChat/clearNewChatPreset");
}

/** Make an existing committed chat active. Keyed by the chat id, so re-selecting the same chat is
 *  idempotent and switching chats remounts the slot. */
export function selectChat(chatId: ChatId): void {
  withViewTransition(() => {
    useActiveChatStore.setState(
      { handle: committedChat(chatId), draftSeed: undefined, sessionKey: chatId, newChatPreset: undefined },
      true,
      "activeChat/select",
    );
  });
}

/** Record that the active draft has committed to a real chat. Promotes draft→committed without
 *  changing `sessionKey`, so the surface does not remount mid-first-turn.
 *
 *  A no-op unless the active slot is still that exact draft — a late-resolving commit for a draft the
 *  user already navigated away from must not hijack the active slot (would split-brain the room vs.
 *  header/context). */
export function commitDraft(chatId: ChatId, forDraftKey: string): void {
  const { handle, draftSeed, sessionKey } = useActiveChatStore.getState();
  if (handle.kind !== "draft" || handle.draftKey !== forDraftKey) {
    return;
  }
  useActiveChatStore.setState({ handle: committedChat(chatId), draftSeed, sessionKey, newChatPreset: undefined }, true, "activeChat/commitDraft");
}

/** Return to the at-rest landing state. Mints a fresh `sessionKey` so a subsequent new-chat/select
 *  remounts a clean slot. */
export function goToLanding(): void {
  withViewTransition(() => {
    useActiveChatStore.setState(
      { handle: landingChat(), draftSeed: undefined, sessionKey: nextSessionKey(), newChatPreset: undefined },
      true,
      "activeChat/goToLanding",
    );
  });
}

/** Land on a chat from the LIST AND close any open LIST slide-over — the viewport-unaware intent form of
 *  the old route-closure `selectChatFromList`: `openOverlayPanel` is read only in an overlay regime
 *  (`useShellLayout`), so the unconditional write is a no-op when the LIST is docked. */
export function selectChatFromList(chatId: ChatId): void {
  selectChat(chatId);
  setOpenOverlayPanel(null);
}

/** After a host deletes the chat CONTENT is currently showing, return to landing so the room never
 *  points at a dropped chat — a no-op if the deleted chat isn't the active one. */
export function chatDeletedFromList(deletedChatId: ChatId): void {
  const { handle } = useActiveChatStore.getState();
  if (isCommitted(handle) && handle.id === deletedChatId) {
    goToLanding();
  }
}

// ── The read API — narrow hooks so the route re-renders only on the slice it reads. ──

export function useActiveChatHandle(): ChatHandle {
  return useActiveChatStore((s) => s.handle);
}

/** The canonical "which committed chat is active" pointer — `null` while landing or while the active
 *  chat is still an uncommitted draft. Data about the chat is never read from here — key a Query off
 *  the returned id. */
export function useActiveChatId(): ChatId | null {
  return useActiveChatStore((s) => (isCommitted(s.handle) ? s.handle.id : null));
}

/** The seed the new-chat picker was opened with (`openNewChatPicker`), or undefined for a plain open. */
export function useNewChatPreset(): DraftSeed | undefined {
  return useActiveChatStore((s) => s.newChatPreset);
}

/** The active chat's new-chat seed — threaded to `ChatRoomSurface.draftSeed`. */
export function useActiveDraftSeed(): DraftSeed | undefined {
  return useActiveChatStore((s) => s.draftSeed);
}

/** The stable slot key — threaded to `ChatRoomSurface`'s React `key`. */
export function useActiveSessionKey(): string {
  return useActiveChatStore((s) => s.sessionKey);
}
