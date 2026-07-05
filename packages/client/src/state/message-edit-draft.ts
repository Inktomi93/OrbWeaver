// The edit-in-place draft store (PD-119 — `@orb/ui/message-list` is a pure windowed virtualizer with
// NO keep-mounted path: a row that scrolls off-screen unmounts, and a component-local `useState` edit
// draft would silently vanish on scroll-back (neo's virtualizer footgun #3). This store hoists BOTH
// the edit MODE and the draft TEXT to an EXTERNAL store keyed by message id, so a scroll-driven
// unmount/remount of `<MessageRow>` never drops an in-progress edit. `createGatedStore` (not
// `createEntityDraftStore`) is the right door: an edit draft is transient/device-local scroll-survival
// state, NOT the crash-survival localStorage mirror the persist-shaped factory is for — losing an
// in-progress edit on a hard reload is acceptable (state-law recap, UI-Architecture-and-Layout.md §5).
//
// WRITE OWNERSHIP: unlike chat-stream.ts, no bus event drives this — an edit draft is pure local UI
// state. `startEditingMessage`/`setMessageEditDraft`/`cancelEditingMessage` are ALL component-callable.
// The save round-trip goes straight through the `editMessage` verb (message-edit-textarea.tsx); on
// success the caller calls `cancelEditingMessage` to close the editor — the bus's `messageEdited`
// re-fold (already wired, data/bus/apply-chat-bus-event.ts) is what updates the RENDERED content via
// the ordinary invalidate-and-refetch path, this store never touches server data.
//
// Presence in the map IS the edit-mode flag: `drafts[id] === undefined` → not editing (the row renders
// its normal read-only body); a present entry (possibly `""`) → editing, with this exact text.

import type { MessageId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";

interface MessageEditDraftState {
  readonly drafts: Readonly<Record<string, string>>;
}

const useMessageEditDraftStore = createGatedStore<MessageEditDraftState>(
  "message-edit-draft",
  (): MessageEditDraftState => ({ drafts: {} }),
);

/** Enter edit mode for `messageId`, seeding the draft with the message's current content — call once,
 *  from the Edit action's click handler. Re-entering an already-editing row reseeds the draft (a
 *  second Edit click discards any unsaved in-progress text, same as neo's re-open semantics). */
export function startEditingMessage(messageId: MessageId, initialText: string): void {
  const drafts = { ...useMessageEditDraftStore.getState().drafts, [messageId]: initialText };
  useMessageEditDraftStore.setState({ drafts }, false, "edit-draft/start");
}

/** Update the in-progress draft text (fired on every keystroke). */
export function setMessageEditDraft(messageId: MessageId, text: string): void {
  const drafts = { ...useMessageEditDraftStore.getState().drafts, [messageId]: text };
  useMessageEditDraftStore.setState({ drafts }, false, "edit-draft/set");
}

/** Exit edit mode (Esc, a successful save, or an explicit Cancel) — clears the draft entirely so a
 *  later re-edit reseeds fresh from the (possibly now-different) canonical content. */
export function cancelEditingMessage(messageId: MessageId): void {
  const drafts = { ...useMessageEditDraftStore.getState().drafts };
  delete drafts[messageId];
  useMessageEditDraftStore.setState({ drafts }, true, "edit-draft/cancel");
}

/** Reactive: is this message currently in edit mode? */
export function useIsEditingMessage(messageId: MessageId): boolean {
  return useMessageEditDraftStore((s) => s.drafts[messageId] !== undefined);
}

/** Reactive: the current draft text — only meaningful while editing (`""` when not, harmless since a
 *  non-editing row never reads this). */
export function useMessageEditDraftText(messageId: MessageId): string {
  return useMessageEditDraftStore((s) => s.drafts[messageId] ?? "");
}

/** Non-reactive snapshot read (tests / imperative call sites) — `undefined` means "not editing", the
 *  same presence-is-mode-flag contract the reactive hooks read (mirrors `createEntityDraftStore`'s
 *  `readDraft` — the non-hook escape hatch every store in this tier offers). */
export function readMessageEditDraft(messageId: MessageId): string | undefined {
  return useMessageEditDraftStore.getState().drafts[messageId];
}
