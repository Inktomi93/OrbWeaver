// The analytics-SELECTION store: which character the Analytics section has drilled into — the route reads
// it to render the per-character stats DRILL in CONTENT (else the analytics overview dashboard). Separate
// from the Corpus / Characters selections by design (a leaderboard/momentum row opens a stats drill here),
// remembered independently. A primary-only `createDrillSelectionStore` (UI-Arch §4.2; not persisted — a
// hard reload landing back on the dashboard is fine).

import type { CharacterId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

const analyticsSelection = createDrillSelectionStore<CharacterId>("analytics-selection");

/** Drill into a character's stats (a leaderboard row / momentum row) — CONTENT swaps to the drill. */
export const selectAnalyticsCharacter = analyticsSelection.select;
/** Clear the drill selection (back to the overview dashboard). */
export const clearAnalyticsSelection = analyticsSelection.clear;
/** Reactive: the currently-drilled analytics character id (`null` = the dashboard). A primitive selector. */
export const useSelectedAnalyticsCharacterId = analyticsSelection.usePrimaryId;
