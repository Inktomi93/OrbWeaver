// The editable Extras form rows: stable client row identity and text, never a saved connection wire.

/** ONE `extras` row while it is being edited. `id` is the row's IDENTITY (§5.3a property 1): the delete
 *  button removes THAT row and editing a key does not rebuild the list under the caret. A row with an empty
 *  key is HELD (property 2) — it survives an autosave instead of being pruned out from under the typist — and
 *  simply does not reach the saved object. */
export interface ExtraRow {
  readonly id: string;
  readonly key: string;
  readonly value: string;
}
