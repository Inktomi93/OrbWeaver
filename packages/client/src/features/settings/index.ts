// features/settings — front door (UI-Arch §2.1). The route composes these surfaces into the shell
// (route→feature is legal; feature→feature is not). The `settings` modal body is the full-bleed
// `SettingsShell` (J11 — a left category nav + one pane column); Appearance is its first REAL pane (the
// #31 surface migrated in). The theme picker (J8) mounts over the `theme` modal slot.

export { makeAppearancePane } from "./lib/appearance-pane";
export { automationPane } from "./lib/automation-pane";
export { makeChatBehaviorPane } from "./lib/chat-behavior-pane";
export { regexPane } from "./lib/regex-pane";
export { settingsModal } from "./lib/settings-modal";
export { systemPane } from "./lib/system-pane";
export { tagsPane } from "./lib/tags-pane";
export { themeModal } from "./lib/theme-modal";
export { SettingsShell } from "./surfaces/settings-shell-surface";
export { ThemePickerSurface } from "./surfaces/theme-picker-surface";
