// import-onboarding-store — the DEVICE-LOCAL dismiss latch for the first-run "bring your SillyTavern
// stuff over" home card (settings/surfaces/import-onboarding-surface.tsx). The server's
// `userSettings.onboarding` namespace holds only fired-once WIZARD latches (personaWizardSeen /
// defaultCharactersSeeded); adding an import latch there is a CONTRACT change (server scope, out of this
// slice). This card's dismiss is a purely presentational, device-local preference, so it lives in a
// persisted gated store (createPersistedStore) exactly like the shell layout — a reload keeps it
// dismissed; a fresh device shows it again (the sanctioned client-persisted fallback per the portability
// spec). Freshness (only-fresh-accounts-see-it) is a RENDER derivation at the card (zero chats yet), not
// stored here — this store only carries the explicit "don't show me this" choice.

import { isPlainObject } from "@orb/kit/guards";
import { createPersistedStore } from "./create-persisted-store";

interface ImportOnboardingState {
  readonly dismissed: boolean;
}

const useImportOnboardingStore = createPersistedStore<ImportOnboardingState>(
  "import-onboarding",
  (): ImportOnboardingState => ({ dismissed: false }),
  {
    version: 1,
    // TOTAL, crash-proof: any unknown/corrupt blob degrades to "not dismissed" (the card simply shows).
    migrate: (persisted): ImportOnboardingState => ({
      dismissed: isPlainObject(persisted) && persisted["dismissed"] === true,
    }),
    partialize: (state): ImportOnboardingState => state,
  },
);

/** Hide the first-run import card for good on this device (the card's dismiss button). */
export function dismissImportOnboarding(): void {
  useImportOnboardingStore.setState({ dismissed: true }, false, "importOnboarding/dismiss");
}

/** Whether the first-run import card has been dismissed on this device. */
export function useImportOnboardingDismissed(): boolean {
  return useImportOnboardingStore((state) => state.dismissed);
}
