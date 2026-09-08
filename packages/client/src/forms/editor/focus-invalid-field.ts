// The editor's submit-invalid focus effect. Keep the selector and optional focus semantics exact: the first
// rendered control declaring aria-invalid receives focus, and an absent control is a no-op.

/** onSubmitInvalid for both factories: move focus to the first invalid control so the error is seen. */
export function focusFirstInvalidField(): void {
  document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
