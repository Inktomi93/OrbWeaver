// features/roster-preset — front door (the only legal cross-feature import). Saved rosters (D61 B6 / B10,
// RP2 — docs/history/design/saved-rosters-build-record.md §3): the feature OWNS the `savedRosters` modal
// definition (G23); its openers live in the surfaces that own the intent and reach it by
// `openModal("savedRosters")`, never by importing this feature.

export { castCollection } from "./lib/cast-collection.tsx";
export { castGroup } from "./lib/cast-group.tsx";
export { savedRostersModal } from "./lib/saved-casts-modal.tsx";
