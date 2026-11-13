// The hint trigger's accessible name. A zero-import leaf, so a spec's node side reads it without loading the primitive.

/** The trigger's name: what it opens, and the row it annotates when the call site names one. */
export function hintTriggerName(subject: string | undefined): string {
  return subject === undefined || subject.trim().length === 0 ? "More info" : `More info about ${subject}`;
}
