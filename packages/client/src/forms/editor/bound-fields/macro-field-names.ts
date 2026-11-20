// The macro field's printed words. A zero-import leaf, so a spec's node side reads them without loading the field.

/** The live line under a macro field that reaches the model: the estimated token count of its value. */
export function macroTokenCountLine(estimate: number): string {
  return `~${String(estimate)} tokens`;
}
