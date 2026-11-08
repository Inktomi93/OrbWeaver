// The color field's names. A zero-import leaf, so a spec's node side reads them without loading the primitive.

/** The popup's hex entry. */
export const COLOR_HEX_FIELD_NAME = "Hex";

/** The popup dialog, named for the field that opened it. */
export function colorPickerName(fieldLabel: string | undefined): string {
  return fieldLabel === undefined ? "Color picker" : `${fieldLabel} color picker`;
}
