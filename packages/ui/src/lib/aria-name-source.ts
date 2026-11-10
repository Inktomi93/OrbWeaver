/** A control may inherit its accessible name, use its own label, or reference a labelling element (UI-Primitives §13.10). */
export type AriaNameSource =
  | { readonly "aria-label"?: string; readonly "aria-labelledby"?: never }
  | { readonly "aria-labelledby"?: string; readonly "aria-label"?: never };
