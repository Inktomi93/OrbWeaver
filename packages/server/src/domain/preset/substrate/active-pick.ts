// Is a preset the user's ACTIVE pick, read the way the runner reads the seed. Pure.

import type { PresetId } from "@orb/kit/ids";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants.ts";

/** `seeds.defaultPresetId === null` is not "unset, so nothing is picked": it is "no EXPLICIT pick", which the turn
 *  resolver answers with the shared system default. So the built-in IS the null pick, and a bare `seed === presetId`
 *  would call the preset every fresh install generates with unused. The explicit arm stays first: a user who HAS
 *  picked a preset gets the ordinary answer, and the built-in is not active for them.
 *
 *  `defaultPresetId` is `string | null` because that is the type the settings contract gives the seed; the asked-for
 *  id is branded, so a wrong-kind id cannot reach this comparison from the verb side. */
export function isActivePresetPick(defaultPresetId: string | null, presetId: PresetId): boolean {
  return defaultPresetId === null ? presetId === SYSTEM_DEFAULT_PRESET_ID : defaultPresetId === presetId;
}
