// features/settings — front door (UI-Arch §2.1). What is LEFT of the settings feature after the config
// revamp (#866 S1, config-revamp-design.md; D114 as amended): the THEME — its modal (the `theme` slot's
// picker), its picker surface and its editor — and the two `sections`-skimmer group definitions the feature
// still owns (Appearance, Chat behavior). The settings SHELL (nav · search · scroll-spy · deep links · the
// aggregate save footer) dissolved into `features/config`, which hosts every group; the `settings` modal
// retired (D62 physics rule 5, finally satisfied).
//
// SET-SEAMS stage 5 (D114): the tags + regex panes LEFT for features/tag + features/regex — settings hosts
// no foreign domain, and now no shell either.

export { appearanceGroup } from "./lib/appearance-group.tsx";
export { chatBehaviorGroup } from "./lib/chat-behavior-group.tsx";
export { themeModal } from "./lib/theme-modal.tsx";
export { ThemePickerSurface } from "./surfaces/theme-picker-surface.tsx";
