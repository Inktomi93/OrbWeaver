// world-info/ front door (UI-Arch §2.1) — the ONLY entry into the world-info slice (dep-cruiser
// client-feature-front-door). World Info is a `CollectionContribution` in the Configuration workspace
// (`lib/world-info-collection.tsx`, R2) — it LEFT the rail: the door array in main.tsx registers the
// collection, and `features/config` mounts its rows, its book editor and its attachment panel blind. The
// activation knobs (scan depth / token budget) stay a contributed SETTINGS section, unchanged.

export { worldInfoCollection } from "./lib/world-info-collection.tsx";
export { worldInfoSettingsSection } from "./lib/world-info-settings-section.tsx";
