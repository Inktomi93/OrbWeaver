// The active-chat store: which chat is the CONTENT hero showing. Writers only call a module action;
// readers are render-only (the composition reader in routes/app-root.tsx, or mirror readers like the
// persona panel's "This chat" section that key a Query off the returned id). Subscribe-and-effect on
// the pointer is banned (gate `no-effect-on-shared-selection`) — derive in render instead.
//
// Also homes `NewChatIntent` — the creation-only parameters a launcher hands the picker (and the picker
// hands `chat.startChat`). It is an INTENT, not state a room carries: once the row exists there is nothing
// left to stage, which is why nothing here mirrors a draft config any more.
//
// THE HUSK SEAM (D166). A room is real from the creation
// click, so a user who starts one and immediately leaves has minted a row nobody claimed. `enterCreatedChat`
// remembers exactly one such room; leaving it fires `subscribeHuskAbandoned`'s listeners with its id, and the
// `#data` reaper turns that into a best-effort `chat.reapHusk`. THE STORE STAYS tRPC-FREE — it publishes a
// fact and knows nothing about the network (the `subscribeUserMessageCommitted` precedent, chat-stream.ts).
// The client NEVER decides that a room is a husk: the verb re-checks `started_at IS NULL` and no-ops
// otherwise, and the 24h TTL belt is the real guarantee. Nav is never blocked on it.

import type { StartChatInput } from "@orb/contracts/chat";
import type { MessageWindowTarget } from "@orb/contracts/search";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { ChatContextTabId } from "#lib";
import type { ChatHandle } from "./chat-handle.ts";
import { committedChat, isCommitted, isLanding, landingChat } from "./chat-handle.ts";
import { clearChatMoment, requestChatMoment } from "./chat-moment-store.ts";
import { chatOrigin, clearChatReturn, markChatReturned, noteChatOrigin, subscribeChatOrigin } from "./chat-return-store.ts";
import { readComposerDraft } from "./composer-draft-store.ts";
import { createPersistedStore } from "./create-persisted-store.ts";
import type { SectionSelection } from "./section-registry.ts";
import { activeSectionNow, openModal, revealContextPanel, setActiveSection, setOpenOverlayPanel, withContentSwap } from "./shell-store.ts";

export type NewChatIntent = Readonly<Partial<Pick<StartChatInput, "anchorPersonaId" | "title" | "temporary" | "startAsGame">>> & {
  readonly characterIds?: Readonly<StartChatInput["characterIds"]> | undefined;
};

interface ActiveChatState {
  readonly handle: ChatHandle;
  /** The intent the new-chat PICKER opens pre-loaded with, so there is ONE creation ceremony: an opener with
   *  a creation-only parameter (the home temp-chat tile) presets it here and opens the same modal every
   *  other "New chat" affordance opens, instead of forking a second launcher that skips the character pick. The
   *  modal clears it on a real dismiss, and every opener overwrites it before opening. Component unmount
   *  cleanup is forbidden here because React Strict Mode probes unmount while the modal remains open. */
  readonly newChatIntent: NewChatIntent | undefined;
  /** The one room this device CREATED and has not left — the husk-reap candidate (§4.6). Never a claim
   *  verdict: the server owns that. `null` whenever the active room was merely opened, not created here. */
  readonly createdChatId: ChatId | null;
  /** The room whose invite dialog another section asked to open (`openRoomInvite`). The Members tab opens its dialog
   *  while this names its own room, and closing the dialog clears it. Any room change drops it. */
  readonly inviteChatId: ChatId | null;
}

type PersistedActiveChatState = Pick<ActiveChatState, "handle">;

const DEFAULT_STATE: ActiveChatState = {
  // Nothing selected → the route renders the landing surface, never an empty room.
  handle: landingChat(),
  newChatIntent: undefined,
  createdChatId: null,
  inviteChatId: null,
};

const CHAT_ID = typeIdSchema(ID_PREFIX.chat);

// Creation intent and husk candidacy belong to this page lifetime, not the restored navigation handle.
function migrate(persisted: unknown): ActiveChatState {
  if (persisted === null || typeof persisted !== "object") {
    return DEFAULT_STATE;
  }
  const candidate = (persisted as { handle?: unknown }).handle;
  if (candidate === null || typeof candidate !== "object") {
    return DEFAULT_STATE;
  }
  const handle = candidate as { kind?: unknown; id?: unknown };
  if (handle.kind === "landing") {
    return DEFAULT_STATE;
  }
  const parsed = CHAT_ID.safeParse(handle.id);
  return handle.kind === "committed" && parsed.success
    ? { handle: committedChat(parsed.data), newChatIntent: undefined, createdChatId: null, inviteChatId: null }
    : DEFAULT_STATE;
}

const useActiveChatStore = createPersistedStore<ActiveChatState, PersistedActiveChatState>("active-chat", (): ActiveChatState => DEFAULT_STATE, {
  version: 1,
  migrate,
  partialize: (state): PersistedActiveChatState => ({ handle: state.handle }),
});

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
 *  rather than bypassing the character pick. */
export function openNewChatPicker(intent?: NewChatIntent): void {
  useActiveChatStore.setState({ newChatIntent: intent }, false, "activeChat/openNewChatPicker");
  openModal("newChat");
}

/** Drop the picker's intent after a real dismiss. This is deliberately not component-unmount cleanup:
 *  React Strict Mode probes unmount while the modal is still logically open. */
export function clearNewChatIntent(): void {
  useActiveChatStore.setState({ newChatIntent: undefined }, false, "activeChat/clearNewChatIntent");
}

/** Make an existing chat active. Keyed by the chat id, so re-selecting the same chat is idempotent and
 *  switching chats remounts the slot. */
export function selectChat(chatId: ChatId): void {
  clearChatMoment();
  clearChatReturn();
  // The three user-driven CONTENT pane swaps (create, select-a-chat, return-to-landing) go through the
  // shell's ONE content-swap door: the router's VT never fires at a constant route, and a room change must
  // not leave a float ABOUT THE OLD ROOM's content painted over the new one (#1795).
  withContentSwap(() => {
    const createdChatId = releaseCreatedChat(chatId);
    useActiveChatStore.setState({ handle: committedChat(chatId), newChatIntent: undefined, createdChatId, inviteChatId: null }, true, "activeChat/select");
  });
}

/** Enter a room this device just CREATED (`chat.startChat` resolved). Identical to `selectChat` except that
 *  the room is remembered as the husk-reap candidate until it is left (§4.6). */
export function enterCreatedChat(chatId: ChatId): void {
  clearChatReturn();
  withContentSwap(() => {
    releaseCreatedChat(chatId);
    useActiveChatStore.setState(
      { handle: committedChat(chatId), newChatIntent: undefined, createdChatId: chatId, inviteChatId: null },
      true,
      "activeChat/enterCreated",
    );
  });
}

/** Return to the at-rest landing state. */
export function goToLanding(): void {
  withContentSwap(() => {
    const createdChatId = releaseCreatedChat(null);
    useActiveChatStore.setState({ handle: landingChat(), newChatIntent: undefined, createdChatId, inviteChatId: null }, true, "activeChat/goToLanding");
    // A sheet left open over the room would otherwise stay up over the list it lands on.
    setOpenOverlayPanel(null);
  });
}

/** Open a retained source or stable message target through the same room navigation door. */
export function openChatMoment(chatId: ChatId, target: MessageWindowTarget): void {
  resumeChat(chatId);
  withContentSwap(() => requestChatMoment(chatId, target));
}

/**
 * RESUME an existing room FROM ANOTHER SECTION (#1662) — the Characters plane's two resume doors: the
 * library row's Chat CTA and the landing's Recently-chatted faces.
 *
 * `selectChat` alone makes the room active in a section the reader is not looking at, so the two callers
 * both spelled `selectChat(id); setActiveSection("chats")` — the same two-line intent written twice, which
 * is how one of them comes to skip the section change. One intent, one name, one home; the WORD is the
 * product's (`docs/law/vocabulary-map.md` — resume = re-enter the room you were already in, as opposed
 * to start, which mints one). It also records the section it was called from, so the phone's Back returns there.
 */
export function resumeChat(chatId: ChatId): void {
  const from = activeSectionNow();
  selectChat(chatId);
  // Back returns to where the room was resumed from; resuming from Chats itself needs no detour.
  noteChatOrigin(from === "chats" ? null : from);
  setActiveSection("chats");
}

const MEMBERS_TAB = "members" satisfies ChatContextTabId;

/** Open a room's Members tab with its invite dialog, from another section (the Share card's room picker). The dialog
 *  opens only where the viewer may invite; anywhere else the Members tab opens alone. */
export function openRoomInvite(chatId: ChatId): void {
  resumeChat(chatId);
  // `resumeChat` writes inside a view transition that runs after this task. Joining it orders the reveal and the
  // request after the select and the section change, which would otherwise clear both.
  withContentSwap(() => {
    revealContextPanel(MEMBERS_TAB);
    useActiveChatStore.setState({ inviteChatId: chatId }, false, "activeChat/openRoomInvite");
  });
}

/** Drop the invite request once its dialog closes, so reopening the room does not reopen the dialog. */
export function clearRoomInvite(): void {
  useActiveChatStore.setState({ inviteChatId: null }, false, "activeChat/clearRoomInvite");
}

/** Land on a chat from the LIST AND close any open LIST slide-over — the viewport-unaware intent form of
 *  the old route-closure `selectChatFromList`: `openOverlayPanel` is read only in an overlay regime
 *  (`useShellLayout`), so the unconditional write is a no-op when the LIST is docked. */
export function selectChatFromList(chatId: ChatId): void {
  selectChat(chatId);
  setOpenOverlayPanel(null);
}

/** The phone's Back out of a room: the landing, then the section the room was resumed from (if not Chats).
 *  The left room's row is marked so the list it returns to can focus and flag it. */
function leaveRoom(): void {
  const { handle } = useActiveChatStore.getState();
  const origin = chatOrigin();
  // The section change expires any older focus claim, so it comes before the new claim is made.
  if (origin !== null) {
    setActiveSection(origin);
  }
  goToLanding();
  if (isCommitted(handle)) {
    // Inside the same swap as the landing: the row is inert until its list is the screen again, so the claim
    // must reach it in the commit that un-inerts it.
    withContentSwap(() => markChatReturned(handle.id));
  }
}

/** The section-registry SEAM (`SectionSelection`) — what the SHELL reads for the mobile ONE-SHELL rule.
 *  A chat's "selection" is the HANDLE: landing is nothing-open, an open room counts as open. `clear` is
 *  `leaveRoom`: the landing every other route to it lands in, plus the return to the resuming section. */
export const chatSectionSelection: SectionSelection = {
  subscribe: (onStoreChange: () => void): (() => void) => {
    const unsubscribeChat = useActiveChatStore.subscribe(onStoreChange);
    const unsubscribeOrigin = subscribeChatOrigin(onStoreChange);
    return (): void => {
      unsubscribeChat();
      unsubscribeOrigin();
    };
  },
  hasSelection: (): boolean => !isLanding(useActiveChatStore.getState().handle),
  clear: leaveRoom,
  backTarget: chatOrigin,
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

/** Non-rendering read for dev composition seams (`__orb.rpg`). UI components use `useActiveChatId`. */
export function activeChatId(): ChatId | null {
  const { handle } = useActiveChatStore.getState();
  return isCommitted(handle) ? handle.id : null;
}

/** The room whose invite dialog another section asked to open, or null. */
export function useRoomInviteRequest(): ChatId | null {
  return useActiveChatStore((s) => s.inviteChatId);
}

/** The creation parameters the new-chat picker was opened with (`openNewChatPicker`), or undefined for a
 *  plain open. */
export function useNewChatIntent(): NewChatIntent | undefined {
  return useActiveChatStore((s) => s.newChatIntent);
}
