// The editor's submit-invalid focus effect. Keep the selector and optional focus semantics exact: the first
// rendered control declaring aria-invalid receives focus, and an absent control is a no-op.

const INVALID_CONTROL = '[aria-invalid="true"]';

/** onSubmitInvalid for both factories: move focus to the first invalid control so the error is seen. */
export function focusFirstInvalidField(): void {
  document.querySelector<HTMLElement>(INVALID_CONTROL)?.focus();
}

/** The same move for a form that is not one of the factories' (a card with its own submit), scoped to that form. */
export function focusFirstInvalidFieldIn(form: ParentNode | null): void {
  form?.querySelector<HTMLElement>(INVALID_CONTROL)?.focus();
}
