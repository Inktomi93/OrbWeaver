import type { AppearanceSettings } from "@orb/contracts/settings";
import { appearanceSettingsSchema, DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { APPEARANCE_CARRIER_MANIFEST, APPEARANCE_CARRIER_OBSERVABLES } from "../../../packages/client/src/lib/appearance-carrier-manifest.ts";

type ArmedAppearanceCarrierKey = keyof typeof APPEARANCE_CARRIER_OBSERVABLES;
export type AppearanceCarrierSnapshot = Record<ArmedAppearanceCarrierKey, string | null>;

export function appearanceSettingsForCarrierArm(arm: 0 | 1, backgroundKindUnderTest = false): AppearanceSettings {
  const overrides = Object.fromEntries(
    (Object.keys(APPEARANCE_CARRIER_OBSERVABLES) as ArmedAppearanceCarrierKey[]).map((key) => [
      key,
      APPEARANCE_CARRIER_MANIFEST[key].requiredDistinctArms[arm],
    ]),
  );
  const settings = appearanceSettingsSchema.parse({ ...DEFAULT_APPEARANCE_SETTINGS, ...overrides });
  // The painted arm is `asset` since `kind:"seeded"` retired (2026-09-18) — its dependent carriers have to
  // be spelled here because they name an ASSET, which the arm value alone cannot carry. The hash is a
  // fixture, not a real blob: this matrix compares CARRIER attributes, never a rendered image.
  settings.backgroundAssetId = "asset_carriermatrix";
  settings.backgroundAssetHash = "carriermatrixhash";
  settings.backgroundAssetMime = "image/jpeg";
  if (!backgroundKindUnderTest) {
    settings.backgroundImageKind = "asset";
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
