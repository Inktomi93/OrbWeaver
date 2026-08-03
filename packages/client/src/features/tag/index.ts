// features/tag — front door (UI-Arch §2.1). The tag slice owns the ONE tag-management surface and, since
// the config rail's R1, contributes it to the Configuration workspace as a `CollectionContribution` (D114
// amended: the feature still owns its surface; the surface stopped being a settings pane). Tags label
// characters, chats, world books, personas and presets, so no other feature is their reader.

export { tagCollection } from "./lib/tag-collection.tsx";
