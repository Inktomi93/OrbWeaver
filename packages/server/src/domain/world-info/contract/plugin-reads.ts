import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { WorldInfoService } from "./service.ts";

export interface PluginWorldInfoReadDeps {
  readonly worldInfo: Pick<WorldInfoService, "listForChat" | "listEntryIndex" | "listEntries">;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
}
export type { PluginWorldInfoReads } from "@orb/contracts/plugin";
