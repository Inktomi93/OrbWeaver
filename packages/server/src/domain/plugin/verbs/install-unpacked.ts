// verb: installUnpacked — development-only, peer-local directory pack, then ordinary install/upgrade.

import { DomainForbiddenError } from "@orb/kit/errors";
import { PluginUnpackedUnavailableError } from "../contract/errors.ts";
import type { InstallUnpackedPluginParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getByOwnerSlug } from "../persistence/plugins.ts";
import { parseBundle } from "../substrate/manifest.ts";

export function createInstallUnpacked(ctx: PluginContext, deps: Pick<PluginService, "install" | "upgrade">): PluginService["installUnpacked"] {
  return async ({ caller, directory, grant }: InstallUnpackedPluginParams) => {
    if (!ctx.development) {
      throw new PluginUnpackedUnavailableError();
    }
    // This is SOURCE admission, before ordinary D147 row management begins. The identity spine's invariant 7
    // makes `fallback` the peer-gated local-owner signal; a role alone says nothing about network locality.
    if (caller.via !== "fallback") {
      throw new DomainForbiddenError("unpacked plugin loading requires the local owner session");
    }
    const bundle = await ctx.packPluginDirectory(directory);
    const { manifest } = parseBundle(bundle);
    const existing = await getByOwnerSlug(ctx.db, caller.userId, manifest.id);
    return existing === undefined ? deps.install({ caller, bundle, grant }) : deps.upgrade({ caller, pluginId: existing.id, bundle });
  };
}
