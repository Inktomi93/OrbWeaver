// features/settings — front door (UI-Arch §2.1). The route composes these surfaces into the shell
// (route→feature is legal; feature→feature is not). The `settings` modal body is the full-bleed
// `SettingsShell` (J11 — a left category nav + one pane column); Appearance is its first REAL pane (the
// #31 surface migrated in). The theme picker (J8) mounts over the `theme` modal slot.
//
// SET-SEAMS stage 5 (D114): the tags + regex panes LEFT for features/tag + features/regex — settings hosts
// no foreign domain. What stays is the shell, the section renderer, the modals, and the theme pane.

export { appearancePane } from "./lib/appearance-pane";
export { automationPane } from "./lib/automation-pane";
export { chatBehaviorPane } from "./lib/chat-behavior-pane";
export { settingsModal } from "./lib/settings-modal";
export { themeModal } from "./lib/theme-modal";
export { SettingsShell } from "./surfaces/settings-shell-surface";
export { ThemePickerSurface } from "./surfaces/theme-picker-surface";
