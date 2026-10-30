import type { ResolveHostPrincipalOp } from "@orb/contracts/identity";
import type { WorldInfoService } from "./service.ts";

export interface PluginWorldInfoReadDeps {
  readonly worldInfo: Pick<WorldInfoService, "listForChat" | "listEntryIndex" | "listEntries">;
  readonly resolveOwnerPrincipal: ResolveHostPrincipalOp;
}
export type { PluginWorldInfoReads } from "@orb/contracts/plugin";
