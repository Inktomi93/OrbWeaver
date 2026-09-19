// features/config — front door (UI-Arch §2.1). The HOST of the unified Settings workspace (the
// Configuration section, config-revamp-design.md): the section frame, the four-shelf LIST with every
// group's band chrome and the scroll-spy, the CONTENT host that renders a group's body or an open member's
// editor, the welcome, the context routing, and the one kinded selection.
//
// THE HOST STILL IMPORTS ZERO GROUP BODIES — every group arrives through the `config-groups` registry
// assembled at the door (the `features/home` precedent one family across), and `config-group-completeness`
// reds a host file reaching into `#features/*` or escaping `features/config/`. What CHANGED at #2447 is the
// feature's OWN inventory, not that rule: `features/settings` is GONE (owner ruling 2026-09-19 — "settings
// migrated to config; settings should be gone"), so the two `sections`-skimmer group definitions it still
// owned (Appearance, Chat behavior) and the THEME — the Looks section (picker + builder, folded INTO
// Appearance from the retired rail-foot `theme` modal, owner ruling F-2, #297 apply-not-mode), its editor,
// its mutations and its serde model — live HERE, beside the host, and reach the door through this file. The
// host SURFACES under `surfaces/` still import none of them.
//
// SET-SEAMS stage 5 (D114): the tags + regex panes LEFT for features/tag + features/regex — this feature
// hosts no foreign domain.

export { appearanceGroup } from "./lib/appearance-group.tsx";
export { appearanceLooksSection } from "./lib/appearance-looks-section.tsx";
export { chatBehaviorGroup } from "./lib/chat-behavior-group.tsx";
export { bindConfigPaletteGroups, configPaletteSource } from "./lib/config-palette-source.ts";
export { makeConfigSection } from "./lib/config-section.tsx";
export { themeActionsName } from "./lib/theme-row-names.ts";
