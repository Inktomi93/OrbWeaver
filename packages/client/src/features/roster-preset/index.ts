// features/roster-preset — front door (the only legal cross-feature import). Saved rosters (D61 B6 / B10,
// D170): the feature OWNS the `savedRosters` modal
// definition (G23); its openers live in the surfaces that own the intent and reach it by
// `openModal("savedRosters")`, never by importing this feature. It also raises the Home "Rosters" tile.

export { rosterPresetHomeTile } from "./lib/home-rosters-tile.tsx";
export { rosterCollection } from "./lib/roster-collection.tsx";
export { rosterGroup } from "./lib/roster-group.tsx";
export { savedRostersModal } from "./lib/saved-rosters-modal.tsx";
