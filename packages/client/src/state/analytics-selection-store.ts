// The Corpus Insights drill: which character the leaderboard has open in the stats drill (else the Insights
// dashboard). Separate from the Explore dossier selection, so each mode restores its own subject. Not
// persisted — a hard reload landing back on the dashboard is fine.

import type { CharacterId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

const analyticsSelection = createDrillSelectionStore<CharacterId>("analytics-selection");

/** Drill into a character's stats (a leaderboard row / momentum row) — CONTENT swaps to the drill. */
export const selectAnalyticsCharacter = analyticsSelection.select;
/** Clear the drill selection (back to the overview dashboard). */
export const clearAnalyticsSelection = analyticsSelection.clear;
/** Reactive: the currently-drilled analytics character id (`null` = the dashboard). A primitive selector. */
export const useSelectedAnalyticsCharacterId = analyticsSelection.usePrimaryId;
/** The Insights mode's drill seam, composed into the Corpus section selection. */
export const analyticsDrillSelection = analyticsSelection.selection;
