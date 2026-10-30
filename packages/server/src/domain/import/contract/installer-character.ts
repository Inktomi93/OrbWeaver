import type { Principal, ResolveHostPrincipalOp } from "@orb/contracts/identity";
import type { PluginId, UserId } from "@orb/kit/ids";
import type { ImportCharacterResult } from "./results.ts";
import type { ImportContext } from "./service.ts";

export interface InstallerCharacterImportDeps {
  readonly resolvePrincipal: ResolveHostPrincipalOp;
  readonly contextFor: (principal: Principal) => ImportContext;
}
export type RunInstallerCharacterImport = (
  installerUserId: UserId,
  bytes: Uint8Array,
  pluginId: PluginId | null,
) => Promise<Pick<ImportCharacterResult, "characterId" | "created">>;
