// features/settings — front door (UI-Arch §2.1). What is LEFT of the settings feature after the config
// revamp (#866 S1+S4, config-revamp-design.md; D114 as amended): the THEME — the Looks section (picker +
// builder, folded INTO Appearance from the retired rail-foot `theme` modal, owner ruling F-2, #297
// apply-not-mode) — and the two `sections`-skimmer group definitions the feature still owns (Appearance,
// Chat behavior). The settings SHELL dissolved into `features/config` (S1); the `settings` modal retired
// (D62 physics rule 5); the `theme` modal retired with S4 (the rail foot = the Settings section + the
// persona slot).
//
// SET-SEAMS stage 5 (D114): the tags + regex panes LEFT for features/tag + features/regex — settings hosts
// no foreign domain, and now no shell either.

export { appearanceGroup } from "./lib/appearance-group.tsx";
export { appearanceLooksSection } from "./lib/appearance-looks-section.tsx";
export { chatBehaviorGroup } from "./lib/chat-behavior-group.tsx";
export { themeActionsName } from "./lib/theme-row-names.ts";
