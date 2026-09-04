// Shipped Snap tapes: one catalog feeds help and path resolution so a preset name cannot advertise a
// missing JSON or become reachable without being advertised. The JSON remains the ordered behavior.

export const SNAP_SCENARIO_PRESET_NAMES = ["appearance-chat", "appearance-shell-config", "orb-app", "rpg-game"] as const;
export type SnapScenarioPresetName = (typeof SNAP_SCENARIO_PRESET_NAMES)[number];

export const SNAP_SCENARIO_PRESET_FILES = {
  "appearance-chat": "appearance-chat.json",
  "appearance-shell-config": "appearance-shell-config.json",
  "orb-app": "orb-app.json",
  "rpg-game": "rpg-game.json",
} as const satisfies Record<SnapScenarioPresetName, `${string}.json`>;

export const APPEARANCE_HIGH_RISK_PRESET_NAMES = ["appearance-shell-config", "appearance-chat"] as const satisfies readonly SnapScenarioPresetName[];

export function scenarioPresetFile(value: string): (typeof SNAP_SCENARIO_PRESET_FILES)[SnapScenarioPresetName] | null {
  const name = SNAP_SCENARIO_PRESET_NAMES.find((candidate) => candidate === value);
  return name === undefined ? null : SNAP_SCENARIO_PRESET_FILES[name];
}
