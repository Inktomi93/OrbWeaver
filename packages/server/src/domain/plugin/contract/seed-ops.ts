import type { Principal } from "@orb/contracts/identity";
import type { PluginId } from "@orb/kit/ids";
import type { InstallPluginParams, UpgradePluginParams } from "./params.ts";
import type { PluginRuntimeDeps } from "./runtime-ports.ts";
import type { PluginService } from "./service.ts";

export type ShowcaseVersionReader = (slug: string) => Promise<string | null>;
export type ReadShowcaseVersionSource = PluginRuntimeDeps["readShowcaseManifest"];
export interface HeldSeedPlugin {
  readonly slug: string;
  readonly pluginId: PluginId;
  readonly version: string;
}
export interface PluginSeedOps {
  readonly install: (args: Pick<InstallPluginParams, "caller" | "bundle">) => ReturnType<PluginService["install"]>;
  readonly requestConsent: (args: Pick<UpgradePluginParams, "caller" | "pluginId">) => Promise<void>;
  readonly upgrade: (args: Pick<UpgradePluginParams, "caller" | "pluginId" | "bundle">) => Promise<void>;
  readonly listHeld: (caller: Principal) => Promise<readonly HeldSeedPlugin[]>;
  readonly apply: (principal: Principal) => ReturnType<PluginService["applyDistributedPlugins"]>;
}
export type PluginSeedSource = Pick<PluginService, "install" | "setGrant" | "upgrade" | "list" | "applyDistributedPlugins">;
