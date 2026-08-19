// The refinery LANDING-PICKER focus signal (#307) — a cross-surface focus nonce, the shape
// `composer-focus-store.ts` uses. On a desktop landing the sessions roster's empty-state CTA and the
// CONTENT landing picker are two different shell surfaces with no ref between them (the roster is a docked
// side panel; the picker lives in CONTENT), so the CTA cannot reach the picker by a prop. Rather than open
// a SECOND full-library picker over the one CONTENT already shows — the #284 duplicate-door's last mouth —
// the CTA asks the mounted picker to take focus. A monotonically-increasing NONCE: the CTA bumps it
// (`requestRefineryLandingFocus`), the landing picker subscribes (`useRefineryLandingFocusRequest`) and
// focuses+scrolls its search field on every change. Ephemeral, never persisted; there is exactly one
// landing picker on screen, so no scope key (unlike the room-scoped composer signal).

import { createGatedStore } from "./create-gated-store.ts";

interface RefineryLandingFocusState {
  /** Monotonic focus nonce; each bump is one request to focus the landing picker. Starts at 0 (never
   *  requested), so a fresh mount does not steal focus. */
  readonly nonce: number;
}

const useRefineryLandingFocusStore = createGatedStore<RefineryLandingFocusState>("refinery-landing-focus", (): RefineryLandingFocusState => ({ nonce: 0 }));

/** Ask the CONTENT landing picker to take focus (bumps the nonce; the picker focuses+scrolls on change). */
export function requestRefineryLandingFocus(): void {
  const { nonce } = useRefineryLandingFocusStore.getState();
  useRefineryLandingFocusStore.setState({ nonce: nonce + 1 }, false, "refineryLandingFocus/request");
}

/** Reactive: the current focus nonce (0 when none requested). A change is the landing picker's focus cue. */
export function useRefineryLandingFocusRequest(): number {
  return useRefineryLandingFocusStore((s) => s.nonce);
}
