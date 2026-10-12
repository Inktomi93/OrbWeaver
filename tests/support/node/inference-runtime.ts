// The inference runtime slice the embeddings connection resolve runs over, faked at the provider edge only: the
// resolver answers from a scripted role-clients view, the funnel is production's own, and the executor forwards to
// the scripted embedders. Production's `createResolveEmbeddingConnection` runs unchanged over it.

import type { RoleClients } from "@orb/contracts/role-clients";
import { NoConnectionError, resolveEmbed } from "@orb/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import type { createResolveEmbeddingConnection } from "@orb/server/entry/compose";
import { makeResolved } from "./factories/resolved-connection.ts";

type EmbeddingRuntime = Parameters<typeof createResolveEmbeddingConnection>[0];

/**
 * Every task resolves to the role clients' bound view of it, as a full `Resolved` row. An unbound task, or an
 * explicit `connectionId` that is not the bound row, refuses with `NoConnectionError` the way the real resolver
 * does for a row it cannot find. `connectionOf` names each funder's own bound row; by default every funder shares
 * the view's row.
 */
export function makeEmbeddingRuntime(
  roleClients: {
    readonly resolved: RoleClients["resolved"];
    /** The scripted encoders; the request's abort signal rides along so a test can prove it reaches the model. */
    readonly embed: (
      input: string | readonly string[],
      opts: { readonly inputType?: "query" | "document"; readonly instruction?: string; readonly signal?: AbortSignal | undefined },
    ) => ReturnType<RoleClients["embed"]>;
    readonly imageEmbed: (
      input: Parameters<RoleClients["imageEmbed"]>[0],
      opts: { readonly signal?: AbortSignal | undefined },
    ) => ReturnType<RoleClients["imageEmbed"]>;
  },
  connectionOf?: (funder: UserId, task: "embed" | "imageEmbed") => UserConnectionId,
): EmbeddingRuntime {
  return {
    resolve: async ({ task, principal, connectionId }): ReturnType<EmbeddingRuntime["resolve"]> => {
      if (task !== "embed" && task !== "imageEmbed") {
        throw new Error(`the embedding runtime fake resolves embedding tasks only, not "${task}"`);
      }
      const view = await roleClients.resolved(task);
      const bound = view === null ? null : (connectionOf?.(principal.userId, task) ?? view.connectionId);
      if (view === null || bound === null || (connectionId !== undefined && connectionId !== bound)) {
        throw new NoConnectionError(`no connection is bound for "${task}"`);
      }
      const resolved = makeResolved({ task, connectionId: bound, model: view.model, providerId: view.providerId, capability: view.capability });
      return { resolved, warnings: [] };
    },
    funnel: { embed: resolveEmbed },
    executor: {
      embed: (req): ReturnType<EmbeddingRuntime["executor"]["embed"]> =>
        roleClients.embed(req.input, {
          ...(req.inputType === undefined ? {} : { inputType: req.inputType }),
          ...(req.instruction === undefined ? {} : { instruction: req.instruction }),
          signal: req.signal,
        }),
      imageEmbed: (req): ReturnType<EmbeddingRuntime["executor"]["imageEmbed"]> => roleClients.imageEmbed(req.input, { signal: req.signal }),
    },
  };
}
