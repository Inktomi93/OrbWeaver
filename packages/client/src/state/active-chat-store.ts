// The active-chat store: which chat is the CONTENT hero showing. Writers only call a module action;
// readers are render-only (the composition reader in routes/app-root.tsx, or mirror readers like the
// persona panel's "This chat" section that key a Query off the returned id). Subscribe-and-effect on
// the pointer is banned (gate `no-effect-on-shared-selection`) — derive in render instead.
//
// Also homes `NewChatIntent` — the creation-only parameters a launcher hands the picker (and the picker
// hands `chat.startChat`). It is an INTENT, not state a room carries: once the row exists there is nothing
// left to stage, which is why nothing here mirrors a draft config any more.
//
// THE HUSK SEAM (chat-creation-draft-mode-replacement.md §4.6 / fork F3). A room is real from the creation
// click, so a user who starts one and immediately leaves has minted a row nobody claimed. `enterCreatedChat`
// remembers exactly one such room; leaving it fires `subscribeHuskAbandoned`'s listeners with its id, and the
// `#data` reaper turns that into a best-effort `chat.reapHusk`. THE STORE STAYS tRPC-FREE — it publishes a
// fact and knows nothing about the network (the `subscribeUserMessageCommitted` precedent, chat-stream.ts).
// The client NEVER decides that a room is a husk: the verb re-checks `started_at IS NULL` and no-ops
// otherwise, and the 24h TTL belt is the real guarantee. Nav is never blocked on it.

import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { withViewTransition } from "#lib";
import type { ChatHandle } from "./chat-handle.ts";
import { committedChat, isCommitted, isLanding, landingChat } from "./chat-handle.ts";
import { readComposerDraft } from "./composer-draft-store.ts";
import { createGatedStore } from "./create-gated-store.ts";
import type { SectionSelection } from "./section-registry.ts";
import { openModal, setOpenOverlayPanel } from "./shell-store.ts";

/** The CREATION-ONLY parameters of a new chat — what a launcher pre-arms the picker with, and what the
 *  picker hands `chat.startChat`. All fields optional: an empty intent is a legal narrator-only room. */
export interface NewChatIntent {
  /** The founding cast. @defaultValue [] (a narrator-only room). */
  readonly characterIds?: readonly CharacterId[] | undefined;
  readonly anchorPersonaId?: PersonaId | null | undefined;
  readonly title?: string | null | undefined;
  /** ST "Temporary Chat" (PD-65) — start this room EPHEMERAL: it runs turns normally but never joins the
   *  chats list, and it is swept once past the user's own TTL. A CREATION intent, not editable config:
   *  `startChat` is the only writer of the column, and a fork is born non-temporary.
   *  @defaultValue undefined (a plain, permanent new chat). */
  readonly temporary?: boolean | undefined;
}

interface ActiveChatState {
  readonly handle: ChatHandle;
  /** The intent the new-chat PICKER opens pre-loaded with, so there is ONE creation ceremony: an opener with
   *  a creation-only parameter (the home temp-chat tile) presets it here and opens the same modal every
   *  other "New chat" affordance opens, instead of forking a second launcher that skips the cast pick. The
   *  picker clears it on unmount, so a later plain "New chat" can never inherit a stale intent. */
  readonly newChatIntent: NewChatIntent | undefined;
  /** The one room this device CREATED and has not left — the husk-reap candidate (§4.6). Never a claim
   *  verdict: the server owns that. `null` whenever the active room was merely opened, not created here. */
  readonly createdChatId: ChatId | null;
}

const useActiveChatStore = createGatedStore<ActiveChatState>(
  "active-chat",
  (): ActiveChatState => ({
    // Nothing selected → the route renders the landing surface, never an empty room.
    handle: landingChat(),
    newChatIntent: undefined,
    createdChatId: null,
  }),
);

// ── The husk-abandoned notification (fire-and-forget; state nobody reads back) ─────────────────────────
// Homing it as store state would only invite a stray selector and a fresh render on every navigation.

const huskAbandonedListeners = new Set<(chatId: ChatId) => void>();

/** Subscribe to "a room this device created was left without being claimed here". Fired at most once per
 *  created room, DURING the navigation that leaves it. Returns an unsubscribe the caller must invoke. */
export function subscribeHuskAbandoned(listener: (chatId: ChatId) => void): () => void {
  huskAbandonedListeners.add(listener);
  return (): void => {
    huskAbandonedListeners.delete(listener);
  };
}

/** Leaving `nextChatId` (null = landing): publish the outgoing created room as a reap candidate and forget
 *  it. SKIPPED while its composer holds unsent text — the user is mid-thought and may come back, and the
 *  TTL belt covers them if they do not (§4.6). Returns the `createdChatId` the next state should carry. */
function releaseCreatedChat(nextChatId: ChatId | null): ChatId | null {
  const { createdChatId } = useActiveChatStore.getState();
  if (createdChatId === null || createdChatId === nextChatId) {
    return createdChatId;
  }
  if (readComposerDraft(createdChatId) === "") {
    // Snapshot before firing — an unsubscribe inside a listener must not mutate the set mid-iteration.
    for (const listener of [...huskAbandonedListeners]) {
      listener(createdChatId);
    }
  }
  return null;
}

// ── The write API — intent-named module actions (the store handle never escapes this file). ──

/** Open the new-chat PICKER, optionally pre-armed with creation-only parameters — the ONE creation
 *  ceremony. An opener whose intent is a creation-only FLAG (the home temp-chat tile) presets it here
 *  rather than bypassing the cast pick. */
export function openNewChatPicker(intent?: NewChatIntent): void {
  useActiveChatStore.setState({ newChatIntent: intent }, false, "activeChat/openNewChatPicker");
  openModal("newChat");
}

/** Drop the picker's intent — called by the picker itself on unmount, so a modal dismissed without
 *  starting anything can never leak its parameters into the next plain "New chat". */
export function clearNewChatIntent(): void {
  useActiveChatStore.setState({ newChatIntent: undefined }, false, "activeChat/clearNewChatIntent");
}

/** Make an existing chat active. Keyed by the chat id, so re-selecting the same chat is idempotent and
 *  switching chats remounts the slot. */
export function selectChat(chatId: ChatId): void {
  // The three user-driven CONTENT pane swaps (create, select-a-chat, return-to-landing) hand-drive the
  // crossfade since the router's VT never fires at a constant route.
  withViewTransition(() => {
    const createdChatId = releaseCreatedChat(chatId);
    useActiveChatStore.setState({ handle: committedChat(chatId), newChatIntent: undefined, createdChatId }, true, "activeChat/select");
  });
}

/** Enter a room this device just CREATED (`chat.startChat` resolved). Identical to `selectChat` except that
 *  the room is remembered as the husk-reap candidate until it is left (§4.6). */
export function enterCreatedChat(chatId: ChatId): void {
  withViewTransition(() => {
    releaseCreatedChat(chatId);
    useActiveChatStore.setState({ handle: committedChat(chatId), newChatIntent: undefined, createdChatId: chatId }, true, "activeChat/enterCreated");
  });
}

/** Return to the at-rest landing state. */
export function goToLanding(): void {
  withViewTransition(() => {
    const createdChatId = releaseCreatedChat(null);
    useActiveChatStore.setState({ handle: landingChat(), newChatIntent: undefined, createdChatId }, true, "activeChat/goToLanding");
  });
}

/** Land on a chat from the LIST AND close any open LIST slide-over — the viewport-unaware intent form of
 *  the old route-closure `selectChatFromList`: `openOverlayPanel` is read only in an overlay regime
 *  (`useShellLayout`), so the unconditional write is a no-op when the LIST is docked. */
export function selectChatFromList(chatId: ChatId): void {
  selectChat(chatId);
  setOpenOverlayPanel(null);
}

/** The section-registry SEAM (`SectionSelection`) — what the SHELL reads for the mobile ONE-SHELL rule.
 *  A chat's "selection" is the HANDLE: landing is nothing-open, an open room counts as open. `clear` is
 *  `goToLanding`, so back-from-a-room lands in the same state every other route to the landing does. */
export const chatSectionSelection: SectionSelection = {
  subscribe: (onStoreChange: () => void): (() => void) => useActiveChatStore.subscribe(onStoreChange),
  hasSelection: (): boolean => !isLanding(useActiveChatStore.getState().handle),
  clear: goToLanding,
};

/** After a host deletes the chat CONTENT is currently showing, return to landing so the room never
 *  points at a dropped chat — a no-op if the deleted chat isn't the active one. Also the seam a REAPED
 *  husk arrives through: the reap emits `chatDeleted`, so an open unclaimed room returns to landing
 *  instead of pointing at a row that no longer exists (§4.5). */
export function chatDeletedFromList(deletedChatId: ChatId): void {
  const { handle, createdChatId } = useActiveChatStore.getState();
  if (createdChatId === deletedChatId) {
    // It is gone — there is nothing left to reap, so drop the candidate before any nav can fire for it.
    useActiveChatStore.setState({ createdChatId: null }, false, "activeChat/createdChatDeleted");
  }
  if (isCommitted(handle) && handle.id === deletedChatId) {
    goToLanding();
  }
}

// ── The read API — narrow hooks so the route re-renders only on the slice it reads. ──

export function useActiveChatHandle(): ChatHandle {
  return useActiveChatStore((s) => s.handle);
}

/** The canonical "which chat is active" pointer — `null` while landing. Data about the chat is never read
 *  from here — key a Query off the returned id. */
export function useActiveChatId(): ChatId | null {
  return useActiveChatStore((s) => (isCommitted(s.handle) ? s.handle.id : null));
}

/** The creation parameters the new-chat picker was opened with (`openNewChatPicker`), or undefined for a
 *  plain open. */
export function useNewChatIntent(): NewChatIntent | undefined {
  return useActiveChatStore((s) => s.newChatIntent);
}
