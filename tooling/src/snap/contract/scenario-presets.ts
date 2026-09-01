// Shipped Snap tapes: one catalog feeds help and path resolution so a preset name cannot advertise a
// missing JSON or become reachable without being advertised. The JSON remains the ordered behavior.

export const SNAP_SCENARIO_PRESET_FILES = {
  "appearance-chat": "appearance-chat.json",
  "appearance-shell-config": "appearance-shell-config.json",
  "orb-app": "orb-app.json",
} as const;

export type SnapScenarioPresetName = keyof typeof SNAP_SCENARIO_PRESET_FILES;

export const SNAP_SCENARIO_PRESET_NAMES = Object.keys(SNAP_SCENARIO_PRESET_FILES) as SnapScenarioPresetName[];

export const APPEARANCE_HIGH_RISK_PRESET_NAMES = ["appearance-shell-config", "appearance-chat"] as const satisfies readonly SnapScenarioPresetName[];

export function scenarioPresetFile(value: string): (typeof SNAP_SCENARIO_PRESET_FILES)[SnapScenarioPresetName] | null {
  return Object.hasOwn(SNAP_SCENARIO_PRESET_FILES, value) ? SNAP_SCENARIO_PRESET_FILES[value as SnapScenarioPresetName] : null;
}
