// features/config — front door (UI-Arch §2.1). The THIN HOST of the unified Settings workspace (the
// Configuration section, config-revamp-design.md): the section frame, the four-shelf LIST with every
// group's band chrome and the scroll-spy, the CONTENT host that renders a group's body or an open member's
// editor, the welcome, the context routing, and the one kinded selection. It owns NO group of its own and
// imports ZERO group bodies — every group arrives through the `config-groups` registry assembled at the door
// (the `features/home` precedent one family across).

export { makeConfigSection } from "./lib/config-section.tsx";
