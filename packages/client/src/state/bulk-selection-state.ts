// The state both bulk-select stores hold: the mode flag and the selected ids as a presence map.

export interface BulkSelectionState {
  /** Whether bulk-select mode is active (checkboxes shown, per-row actions suppressed). */
  readonly active: boolean;
  /** The selected ids as a presence map (`id → true`) — present ⇒ selected. */
  readonly selectedIds: Readonly<Record<string, true>>;
}
