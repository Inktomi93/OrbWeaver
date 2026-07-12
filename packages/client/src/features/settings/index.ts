// features/settings — front door (UI-Arch §2.1). The route composes these surfaces into the shell
// (route→feature is legal; feature→feature is not). The `settings` modal body is the full-bleed
// `SettingsShell` (J11 — a left category nav + one pane column); Appearance is its first REAL pane (the
// #31 surface migrated in). The theme picker (J8) mounts over the `theme` modal slot.

export { ImportOnboardingCard } from "./components/import-onboarding-card";
export { SettingsShell } from "./surfaces/settings-shell-surface";
export { ThemePickerSurface } from "./surfaces/theme-picker-surface";
