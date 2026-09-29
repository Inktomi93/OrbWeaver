// Git source verbs — guarded shallow-clone bytes enter the same parse/install/upgrade funnel as every bundle.

import { PluginGitPreviewStaleError, PluginGitSourceError, PluginNoGitSourceError, PluginNotFoundError } from "../contract/errors.ts";
import type { InstallFromGitParams, PreviewFromGitParams, UpgradeFromStoredGitParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";
import { parseBundle } from "../substrate/manifest.ts";

async function cloneThroughGuard(ctx: PluginContext, url: string): Promise<{ readonly bundle: Uint8Array; readonly commit: string }> {
  try {
    return await ctx.gitSource.clone(url);
  } catch (cause) {
    const error = new PluginGitSourceError();
    error.cause = cause;
    throw error;
  }
}

function createPreviewFromGit(ctx: PluginContext): PluginService["previewFromGit"] {
  return async ({ url }: PreviewFromGitParams) => {
    const cloned = await cloneThroughGuard(ctx, url);
    return { manifest: parseBundle(cloned.bundle).manifest, sourceCommit: cloned.commit };
  };
}

function createInstallFromGit(ctx: PluginContext, deps: Pick<PluginService, "install">): PluginService["installFromGit"] {
  return async ({ caller, url, expectedCommit, grant }: InstallFromGitParams) => {
    const cloned = await cloneThroughGuard(ctx, url);
    if (cloned.commit !== expectedCommit) {
      throw new PluginGitPreviewStaleError();
    }
    return deps.install({
      caller,
      bundle: cloned.bundle,
      grant,
      source: { origin: "git", sourceUrl: url, sourceCommit: cloned.commit },
    });
  };
}

function createUpgradeFromStoredGit(ctx: PluginContext, deps: Pick<PluginService, "upgrade">): PluginService["upgradeFromStoredGit"] {
  return async ({ caller, pluginId, expectedCommit }: UpgradeFromStoredGitParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    if (existing.origin !== "git" || existing.sourceUrl === null || existing.sourceCommit === null) {
      throw new PluginNoGitSourceError(pluginId);
    }
    const cloned = await cloneThroughGuard(ctx, existing.sourceUrl);
    if (cloned.commit !== expectedCommit) {
      throw new PluginGitPreviewStaleError();
    }
    return deps.upgrade({
      caller,
      pluginId,
      bundle: cloned.bundle,
      source: { origin: "git", sourceUrl: existing.sourceUrl, sourceCommit: cloned.commit },
    });
  };
}

export function createGitSource(
  ctx: PluginContext,
  deps: Pick<PluginService, "install" | "upgrade">,
): Pick<PluginService, "previewFromGit" | "installFromGit" | "upgradeFromStoredGit"> {
  return {
    previewFromGit: createPreviewFromGit(ctx),
    installFromGit: createInstallFromGit(ctx, deps),
    upgradeFromStoredGit: createUpgradeFromStoredGit(ctx, deps),
  };
}
