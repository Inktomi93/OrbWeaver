// features/config — front door (UI-Arch §2.1). The THIN HOST of the Configuration workspace: the section
// frame, the collection roster's group chrome, the welcome, the context routing, and the one kinded
// selection. It owns NO library of its own and imports ZERO contributors — every member collection arrives
// through the `config-collections` contributor registry assembled at the door (the `features/home`
// precedent one family across).

export { makeConfigSection } from "./lib/config-section.tsx";
