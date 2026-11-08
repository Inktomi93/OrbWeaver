// The selection bar's names. A zero-import leaf, so a spec's node side reads them without loading the primitive.

/** The bar's dismiss: it clears the selection and closes the bar. */
export const SELECTION_CLEAR_NAME = "Clear selection";

/** The live count the bar announces. */
export function selectionCountLabel(count: number): string {
  return `${String(count)} selected`;
}
