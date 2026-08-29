// features/roster-preset — front door (the only legal cross-feature import). Saved parties (D61 B6,
// RP2 — docs/design/saved-rosters-build-record.md §3): the feature OWNS the `savedParties` modal
// definition (G23); its openers live in the surfaces that own the intent and reach it by
// `openModal("savedParties")`, never by importing this feature.

export { savedPartiesModal } from "./lib/saved-parties-modal.tsx";
