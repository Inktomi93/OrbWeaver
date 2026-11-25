// The guarded Git clone every Git-sourced plugin verb shares. A failed clone becomes one leak-free
// `PluginGitSourceError` whose cause is logged here, because the transport does not log a client error and keeps
// the cause off the wire.

import { getLog } from "#foundation/observability";
import { PluginGitSourceError } from "../contract/errors.ts";
import type { PluginContext } from "../contract/service.ts";

export async function cloneThroughGuard(ctx: PluginContext, url: string): Promise<{ readonly bundle: Uint8Array; readonly commit: string }> {
  try {
    return await ctx.gitSource.clone(url);
  } catch (cause) {
    getLog(ctx.logger).warn({ err: cause }, "plugin: a git source clone failed");
    const error = new PluginGitSourceError();
    error.cause = cause;
    throw error;
  }
}
