// The edit-in-place draft store: `@orb/ui/message-list` is a windowed virtualizer with no keep-mounted
// path, so a component-local useState edit draft would vanish on scroll-back. This hoists BOTH edit
// mode and draft text to an external store keyed by message id. Transient/device-local (createGatedStore,
// not createEntityDraftStore) — losing an in-progress edit on a hard reload is acceptable. No bus event
// drives this; presence in the map IS the edit-mode flag (undefined = not editing).

import type { MessageId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

/** One row's in-progress edit. The reserved sizes are #245's FOOTPRINT: the content column's width and height,
 *  measured by the Edit action at the moment of the swap. They live HERE
 *  rather than on the row because the transcript is windowed — a row scrolled out mid-edit remounts with no
 *  memory of what it used to look like, and a reservation that evaporates on scroll-back is the same jump
 *  one scroll later. `null` = the caller had no rendered box to measure (a story/driver call), which reads
 *  as "no reservation" and is byte-identical to the pre-#245 behaviour. */
interface MessageEditDraft {
  readonly text: string;
  readonly reservedInlineSize: number | null;
  readonly reservedBlockSize: number | null;
}

interface MessageEditDraftState {
  readonly drafts: Readonly<Record<string, MessageEditDraft>>;
}

const useMessageEditDraftStore = createGatedStore<MessageEditDraftState>("message-edit-draft", (): MessageEditDraftState => ({ drafts: {} }));

/** Enter edit mode for `messageId`, seeding the draft with the message's current content — call once,
 *  from the Edit action's click handler. Re-entering an already-editing row reseeds the draft (a
 *  second Edit click discards any unsaved in-progress text, same as neo's re-open semantics).
 *
 *  The reserved sizes are the read-mode column's own box (#245) — the click handler is the one place
 *  that can still see it, because by the time any effect runs the prose has already been swapped out. */
export function startEditingMessage(
  messageId: MessageId,
  initialText: string,
  reservedInlineSize: number | null = null,
  reservedBlockSize: number | null = null,
): void {
  const drafts = { ...useMessageEditDraftStore.getState().drafts, [messageId]: { text: initialText, reservedInlineSize, reservedBlockSize } };
  useMessageEditDraftStore.setState({ drafts }, false, "edit-draft/start");
}

/** Update the in-progress draft text (fired on every keystroke). Keeps the row's reserved footprint —
 *  typing changes the text, never the box the editor was opened into. */
export function setMessageEditDraft(messageId: MessageId, text: string): void {
  const current = useMessageEditDraftStore.getState().drafts[messageId];
  const drafts = {
    ...useMessageEditDraftStore.getState().drafts,
    [messageId]: { text, reservedInlineSize: current?.reservedInlineSize ?? null, reservedBlockSize: current?.reservedBlockSize ?? null },
  };
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
  return useMessageEditDraftStore((s) => s.drafts[messageId]?.text ?? "");
}

/** Reactive: the width (CSS px) the editor must occupy — the column it replaced (#245). `null` when
 *  nothing was measured, which the row reads as "size to your content", the pre-#245 behaviour. */
export function useMessageEditReservedInlineSize(messageId: MessageId): number | null {
  return useMessageEditDraftStore((s) => s.drafts[messageId]?.reservedInlineSize ?? null);
}

/** The read column's height, including chrome hidden during editing; a minimum lets longer drafts grow. */
export function useMessageEditReservedBlockSize(messageId: MessageId): number | null {
  return useMessageEditDraftStore((s) => s.drafts[messageId]?.reservedBlockSize ?? null);
}

/** Non-reactive snapshot read (tests / imperative call sites) — `undefined` means "not editing", the
 *  same presence-is-mode-flag contract the reactive hooks read (mirrors `createEntityDraftStore`'s
 *  `readDraft` — the non-hook escape hatch every store in this tier offers). */
export function __readMessageEditDraftForTest(messageId: MessageId): string | undefined {
  return useMessageEditDraftStore.getState().drafts[messageId]?.text;
}
