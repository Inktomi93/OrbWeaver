// The number field's announced words. A zero-import leaf, so a spec's node side reads them without loading Base UI.

/** The steppers' verbs. */
export const NUMBER_FIELD_DECREMENT_VERB = "Decrease";
export const NUMBER_FIELD_INCREMENT_VERB = "Increase";

/** A stepper's accessible name: the verb, plus the field's own name when the call site named it. */
export function numberStepperName(verb: string, subject: string | undefined): string {
  return subject === undefined || subject.trim() === "" ? verb : `${verb} ${subject}`;
}

/** The bounds sentence the field is described by, over bounds already formatted the way the input prints them. */
export function numberBoundsBetween(min: string, max: string): string {
  return `Between ${min} and ${max}`;
}
export function numberBoundsMinimum(min: string): string {
  return `Minimum ${min}`;
}
export function numberBoundsMaximum(max: string): string {
  return `Maximum ${max}`;
}
