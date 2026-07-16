// The analytics-SELECTION store: which character the Analytics section has drilled into — the route
// reads it to render the per-character stats DRILL in CONTENT (else the analytics overview dashboard).
// Separate from the Corpus / Characters selection stores by design: the Analytics leaderboard and the
// momentum rows open a stats drill here, never the Characters editor or the Corpus dossier, and the
// section remembers its own drill independently. createGatedStore (not persisted): a hard reload landing
// back on the dashboard is fine.

import type { CharacterId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";

interface AnalyticsSelectionState {
  /** The character whose stats the Analytics CONTENT drills into — `null` = the overview dashboard. */
  readonly selectedCharacterId: CharacterId | null;
}

const useAnalyticsSelectionStore = createGatedStore<AnalyticsSelectionState>(
  "analytics-selection",
  (): AnalyticsSelectionState => ({ selectedCharacterId: null }),
);

/** Drill into a character's stats (a leaderboard row / momentum row) — CONTENT swaps to the drill. */
export function selectAnalyticsCharacter(id: CharacterId): void {
  useAnalyticsSelectionStore.setState({ selectedCharacterId: id }, false, "analytics-selection/select");
}

/** Clear the drill selection (back to the overview dashboard). */
export function clearAnalyticsSelection(): void {
  useAnalyticsSelectionStore.setState({ selectedCharacterId: null }, false, "analytics-selection/clear");
}

/** Reactive: the currently-drilled analytics character id (`null` = the dashboard). A primitive selector. */
export function useSelectedAnalyticsCharacterId(): CharacterId | null {
  return useAnalyticsSelectionStore((s) => s.selectedCharacterId);
}
