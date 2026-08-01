// features/tag — front door (UI-Arch §2.1). The tag slice owns the ONE tag-management surface and its
// settings pane (D114 / SET-SEAMS §6.1 stage 5: settings owns the SHELL, not foreign domains — tags label
// characters, chats, world books, personas and presets, so no other feature is their reader). The pane is a
// `surface` pane: a CRUD screen, not a knob stack, so it claims no `owns` key partition.

export { tagsPane } from "./lib/tags-pane";
