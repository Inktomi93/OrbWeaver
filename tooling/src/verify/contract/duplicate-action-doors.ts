/** What one plane/procedure pair is, judged against its ruling. `unruled-pair` is the shape with NO ruling
 * at all: nothing there identifies a new door, so the class is the pair itself — which is why that arm
 * keeps the whole-list diagnostic and the `new-doors` arm does not need it. */
export type PairVerdict =
  | { readonly kind: "below-floor" }
  | { readonly kind: "admitted" }
  | { readonly kind: "unruled-pair"; readonly doors: readonly string[] }
  | { readonly kind: "new-doors"; readonly doors: readonly string[] };
