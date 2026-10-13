import type { Principal } from "@orb/contracts/identity";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { SettingsService } from "./service.ts";

export interface LegacySeedLatches {
  readonly characters: boolean;
  readonly persona: boolean;
}
export interface SettingsComposedOps {
  readonly certificateSetting: () => EffectiveAppConfig["ipCertificate"];
  readonly saveCertificateSetting: (principal: Principal, setting: EffectiveAppConfig["ipCertificate"]) => Promise<void>;
  readonly legacyLatches: (principal: Principal) => Promise<LegacySeedLatches>;
  readonly personaSeeded: (principal: Principal) => Promise<boolean>;
  readonly isExamplePluginSeeded: (principal: Principal) => Promise<boolean>;
  readonly markExamplePluginSeeded: (principal: Principal) => Promise<void>;
  readonly readSeededPluginVersions: (principal: Principal) => Promise<Readonly<Record<string, string>>>;
  readonly writeSeededPluginVersions: (principal: Principal, versions: Readonly<Record<string, string>>) => Promise<void>;
  readonly isDistributedPluginApplied: (principal: Principal) => Promise<boolean>;
  readonly markDistributedPluginApplied: (principal: Principal) => Promise<void>;
}
export type SettingsComposedSource = Pick<SettingsService, "getEffectiveConfig" | "updateAppSettings" | "getUserSettings" | "updateUserSettingsSection">;

export type ReadSeededKeys = (userId: UserId) => Promise<ReadonlySet<string>>;
