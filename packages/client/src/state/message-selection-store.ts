// The bulk message-SELECTION store — the "select messages" mode the chat options menu enters and
// @orb/ui/selection-bar acts on. External + id-keyed for the same reason as message-edit-draft.ts:
// @orb/ui/message-list is a windowed virtualizer with no keep-mounted path, so a row-local checkbox
// state would drop on scroll-driven unmount. Transient, device-local (createGatedStore, not
// createEntityDraftStore) — losing a selection on a hard reload is fine. Presence in `selectedIds` IS
// selection.

import type { MessageId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";

interface MessageSelectionState {
  /** Whether bulk-select mode is active (checkboxes shown, per-row actions suppressed). */
  readonly active: boolean;
  /** The selected message ids as a presence map (`id → true`) — present ⇒ selected. */
  readonly selectedIds: Readonly<Record<string, true>>;
}

const useMessageSelectionStore = createGatedStore<MessageSelectionState>(
  "message-selection",
  (): MessageSelectionState => ({ active: false, selectedIds: {} }),
);

/** Enter bulk-select mode (from the chat options menu's "Select messages…"). Starts with an empty set. */
export function enterSelectionMode(): void {
  useMessageSelectionStore.setState({ active: true, selectedIds: {} }, true, "selection/enter");
}

/** Leave bulk-select mode (Cancel / the selection bar's clear / after a successful delete) — clears all. */
export function exitSelectionMode(): void {
  useMessageSelectionStore.setState({ active: false, selectedIds: {} }, true, "selection/exit");
}

/** Toggle one message's membership in the selection (a row's checkbox / row tap while in select mode). */
export function toggleMessageSelected(messageId: MessageId): void {
  const { selectedIds } = useMessageSelectionStore.getState();
  const next: Record<string, true> = { ...selectedIds };
  if (next[messageId] === true) {
    delete next[messageId];
  } else {
    next[messageId] = true;
  }
  useMessageSelectionStore.setState({ selectedIds: next }, false, "selection/toggle");
}

/** Clear the selection WITHOUT leaving select mode (the selection bar's clear button semantics). */
export function clearSelection(): void {
  useMessageSelectionStore.setState({ selectedIds: {} }, false, "selection/clear");
}

/** Reactive: is bulk-select mode active? (rows read this to show checkboxes + suppress per-row actions). */
export function useSelectionActive(): boolean {
  return useMessageSelectionStore((s) => s.active);
}

/** Reactive: is this message currently selected? A boolean selector (no fresh object). */
export function useIsMessageSelected(messageId: MessageId): boolean {
  return useMessageSelectionStore((s) => s.selectedIds[messageId] === true);
}

/** Reactive: how many messages are selected (drives the selection bar's count + render-when-nonzero). */
export function useSelectedCount(): number {
  return useMessageSelectionStore((s) => Object.keys(s.selectedIds).length);
}

/** Non-reactive snapshot of the selected ids (the delete action's read — the `readMessageEditDraft`
 *  escape-hatch precedent; a fresh array, so never a shared-ref selector footgun). */
export function readSelectedMessageIds(): MessageId[] {
  return Object.keys(useMessageSelectionStore.getState().selectedIds) as MessageId[];
}
