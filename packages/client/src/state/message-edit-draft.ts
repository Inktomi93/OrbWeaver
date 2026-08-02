// The edit-in-place draft store: `@orb/ui/message-list` is a windowed virtualizer with no keep-mounted
// path, so a component-local useState edit draft would vanish on scroll-back. This hoists BOTH edit
// mode and draft text to an external store keyed by message id. Transient/device-local (createGatedStore,
// not createEntityDraftStore) — losing an in-progress edit on a hard reload is acceptable. No bus event
// drives this; presence in the map IS the edit-mode flag (undefined = not editing).

import type { MessageId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";

interface MessageEditDraftState {
  readonly drafts: Readonly<Record<string, string>>;
}

const useMessageEditDraftStore = createGatedStore<MessageEditDraftState>("message-edit-draft", (): MessageEditDraftState => ({ drafts: {} }));

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
export function __readMessageEditDraftForTest(messageId: MessageId): string | undefined {
  return useMessageEditDraftStore.getState().drafts[messageId];
}
