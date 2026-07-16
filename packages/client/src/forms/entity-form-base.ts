// Shared base the two entity-form factories COMPOSE (never merge — derive-modernization-audit.md §W3).
// createAutosaveEntityForm (listener-submits every debounced change) and createSavedEntityForm (button-
// gated, re-baselines on save) diverge on submit-gating ON PURPOSE, so this base holds only what is
// byte-identical between them: the debounce default, the submit-fail focus handler (the
// `[aria-invalid="true"]` chokepoint spelled ONCE), and the crash-survival draft store's read/write
// vocabulary (seed-read + mirror-write, keyed by entityId). Each factory keeps its own onChange/effect
// gating — this base makes no decision about WHEN a mirror happens, only about how.

import type { EntityDraftStore } from "#state";

/** The listener debounce both factories default their draft mirror to (ms). */
export const DEFAULT_DEBOUNCE_MS = 500;

/** onSubmitInvalid for both factories: move focus to the first invalid control so the error is seen. */
export function focusFirstInvalidField(): void {
  document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}

/** The draft-seed read: the surviving crash draft for `entityId` (undefined when no store / no draft). */
export function readDraftSeed<TValues extends object>(draft: EntityDraftStore<TValues> | undefined, entityId: string): Readonly<Partial<TValues>> | undefined {
  return draft?.readDraft(entityId);
}

/** The draft-mirror write: persist the live form values into the crash-survival slot for `entityId`. */
export function mirrorDraft<TValues extends object>(draft: EntityDraftStore<TValues> | undefined, entityId: string, values: TValues): void {
  draft?.setDraft(entityId, values);
}
