import type { Principal } from "@orb/contracts/identity";
import type {
  CertificateSettingOp,
  DistributedPluginAppliedOp,
  ExamplePluginSeededOp,
  MarkDistributedPluginAppliedOp,
  MarkExamplePluginSeededOp,
  PersonaSeededOp,
  ReadSeededPluginVersionsOp,
  SaveCertificateSettingOp,
  WriteSeededPluginVersionsOp,
} from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { SettingsService } from "./service.ts";

export interface LegacySeedLatches {
  readonly characters: boolean;
  readonly persona: boolean;
}
export interface SettingsComposedOps {
  readonly certificateSetting: CertificateSettingOp;
  readonly saveCertificateSetting: SaveCertificateSettingOp;
  readonly legacyLatches: (principal: Principal) => Promise<LegacySeedLatches>;
  readonly personaSeeded: PersonaSeededOp;
  readonly isExamplePluginSeeded: ExamplePluginSeededOp;
  readonly markExamplePluginSeeded: MarkExamplePluginSeededOp;
  readonly readSeededPluginVersions: ReadSeededPluginVersionsOp;
  readonly writeSeededPluginVersions: WriteSeededPluginVersionsOp;
  readonly isDistributedPluginApplied: DistributedPluginAppliedOp;
  readonly markDistributedPluginApplied: MarkDistributedPluginAppliedOp;
}
export type SettingsComposedSource = Pick<SettingsService, "getEffectiveConfig" | "updateAppSettings" | "getUserSettings" | "updateUserSettingsSection">;

export type ReadSeededKeys = (userId: UserId) => Promise<ReadonlySet<string>>;
