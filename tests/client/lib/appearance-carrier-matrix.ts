import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { APPEARANCE_CARRIER_MANIFEST, APPEARANCE_CARRIER_OBSERVABLES } from "../../../packages/client/src/lib/appearance-carrier-manifest.ts";

export type ArmedAppearanceCarrierKey = keyof typeof APPEARANCE_CARRIER_OBSERVABLES;
export type AppearanceCarrierSnapshot = Record<ArmedAppearanceCarrierKey, string | null>;

export function appearanceSettingsForCarrierArm(arm: 0 | 1, backgroundKindUnderTest = false): AppearanceSettings {
  const settings = { ...DEFAULT_APPEARANCE_SETTINGS };
  const writable = settings as unknown as Record<string, unknown>;
  for (const key of Object.keys(APPEARANCE_CARRIER_OBSERVABLES) as ArmedAppearanceCarrierKey[]) {
    writable[key] = APPEARANCE_CARRIER_MANIFEST[key].requiredDistinctArms[arm];
  }
  settings.backgroundSeededId = "misty-highlands";
  if (!backgroundKindUnderTest) {
    settings.backgroundImageKind = "seeded";
  }
  return settings;
}

export interface AppearanceCarrierMatrixVerdict {
  readonly compared: number;
  readonly expected: number;
  readonly findings: readonly string[];
}

export function compareAppearanceCarrierArms(
  armA: Partial<AppearanceCarrierSnapshot>,
  armB: Partial<AppearanceCarrierSnapshot>,
): AppearanceCarrierMatrixVerdict {
  const keys = Object.keys(APPEARANCE_CARRIER_OBSERVABLES) as ArmedAppearanceCarrierKey[];
  const findings: string[] = [];
  let compared = 0;
  for (const key of keys) {
    if (!Object.hasOwn(armA, key)) {
      findings.push(`${key}: missing arm A observation`);
      continue;
    }
    if (!Object.hasOwn(armB, key)) {
      findings.push(`${key}: missing arm B observation`);
      continue;
    }
    compared += 1;
    if (Object.is(armA[key], armB[key])) {
      findings.push(`${key}: both arms resolved to ${JSON.stringify(armA[key])}`);
    }
  }
  return { compared, expected: keys.length, findings };
}
