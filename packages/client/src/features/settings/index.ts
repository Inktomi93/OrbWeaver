// features/settings — front door (UI-Arch §2.1). The route composes these surfaces into the shell
// (route→feature is legal; feature→feature is not). Today: the appearance panel (D44 §12.1), mounted
// as the settings modal body via `AppShellProps.modals`.

export { AppearanceSettingsSurface } from "./surfaces/appearance-settings-surface";
