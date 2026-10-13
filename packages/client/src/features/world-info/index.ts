// The config group assembles its collection internally; consumers enter through the group
// rather than importing the collection across feature boundaries (UI-Arch §2.1).

export {} from "./lib/world-info-collection.tsx";

export { worldInfoGroup } from "./lib/world-info-group.tsx";
export { worldInfoSettingsSection } from "./lib/world-info-settings-section.tsx";
