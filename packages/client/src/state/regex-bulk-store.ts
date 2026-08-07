// The regex-library BULK-SELECT store (REGX2) — the mode the config band's toggle enters and the
// @orb/ui/selection-bar under the script rows acts on.
//
// EXTERNAL, not row-local, for the same reason `message-selection-store` is: past
// COLLECTION_LARGE_GROUP the library renders through the sealed `VirtualList`, which has no keep-mounted
// path, so a row-local checkbox state would drop the moment a selected row scrolled out of the window.
//
// It is also the reason the mode lives HERE rather than inside the rows component: the mode TOGGLE is band
// chrome the config HOST renders (the `bulkSelect` contribution field), and the checkboxes + bar are the
// regex feature's — two components that never meet in the tree, reading one flag.
//
// Transient and device-local (`createGatedStore`, never persisted): a reload landing in bulk mode with an
// empty selection is a dead state the user did not ask for — the `character-library-store` bulkMode rule.
// Presence in `selectedIds` IS selection.

import type { RegexScriptId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

interface RegexBulkState {
  /** Whether bulk-select mode is active (rows show checkboxes, per-row controls are suppressed). */
  readonly active: boolean;
  /** The selected script ids as a presence map (`id → true`) — present ⇒ selected. */
  readonly selectedIds: Readonly<Record<string, true>>;
}

const useRegexBulkStore = createGatedStore<RegexBulkState>("regex-bulk", (): RegexBulkState => ({ active: false, selectedIds: {} }));

/** Enter or leave bulk-select mode (the config band's toggle). LEAVING always clears — a selection that
 *  survived an invisible mode would act on rows the user can no longer see marked. */
export function toggleRegexBulkMode(): void {
  const { active } = useRegexBulkStore.getState();
  useRegexBulkStore.setState({ active: !active, selectedIds: {} }, true, "regex-bulk/toggle-mode");
}

/** Leave bulk mode and clear (after a batch verb runs, and when the library's last row is deleted). */
export function exitRegexBulkMode(): void {
  useRegexBulkStore.setState({ active: false, selectedIds: {} }, true, "regex-bulk/exit");
}

/** Toggle one script's membership in the selection (a row's checkbox, or a row click while in bulk mode). */
export function toggleRegexScriptSelected(scriptId: RegexScriptId): void {
  const { selectedIds } = useRegexBulkStore.getState();
  const next: Record<string, true> = { ...selectedIds };
  if (next[scriptId] === true) {
    delete next[scriptId];
  } else {
    next[scriptId] = true;
  }
  useRegexBulkStore.setState({ selectedIds: next }, false, "regex-bulk/toggle");
}

/** Clear the selection WITHOUT leaving bulk mode (the selection bar's own clear button). */
export function clearRegexBulkSelection(): void {
  useRegexBulkStore.setState({ selectedIds: {} }, false, "regex-bulk/clear");
}

/** Reactive: is bulk-select mode active? (the band toggle's pressed state, and the rows' checkbox arm). */
export function useRegexBulkActive(): boolean {
  return useRegexBulkStore((s) => s.active);
}

/** Reactive: is this script currently selected? A boolean selector (no fresh object per render). */
export function useIsRegexScriptSelected(scriptId: string): boolean {
  return useRegexBulkStore((s) => s.selectedIds[scriptId] === true);
}

/** Non-reactive snapshot for specs — the reactive hooks below need a React render, and this store's rulings
 *  (leaving the mode clears; presence IS selection) are plain state transitions worth pinning without one
 *  (the `readSelectedMessageIds` posture, named per the test-seam convention since nothing in production
 *  reads it). */
export function __readRegexBulkForTest(): { readonly active: boolean; readonly selectedIds: readonly string[] } {
  const { active, selectedIds } = useRegexBulkStore.getState();
  return { active, selectedIds: Object.keys(selectedIds) };
}

/** Reactive: the selected ids, as a stable-identity presence map — the bar reads its COUNT off this and the
 *  batch verbs read the keys. A map rather than an array selector so a re-render never mints a fresh array
 *  identity for an unchanged selection. */
export function useRegexBulkSelectedIds(): Readonly<Record<string, true>> {
  return useRegexBulkStore((s) => s.selectedIds);
}
