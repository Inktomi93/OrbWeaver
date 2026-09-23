// The provider REGISTRY: the built-in rows ∪ the ProviderStore's runtime rows (plugin/admin), one schema.
// A built-in id can never be shadowed — `register()` of a colliding id is a typed refusal (F8/F9, §5.9-1) —
// so a runtime row can never inherit another id's sealed credentials by AAD. Rows persist in `provider_rows`;
// a connection on a not-yet-activated plugin provider reads `no-connection` until activation, never a parse
// error.
// SCOPE (D147): every read names its viewer. A `plugin:` row answers only a viewer who owns an enabled install
// contributing it; any other viewer gets the same `undefined` an unregistered id gets. The namespace is the
// discriminant because both write doors pin it: an admin row may not take a `plugin:` id and a built-in row
// is refused one by schema. A plugin row with no known installer answers nobody.

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, isPluginProviderId, pluginNameOfProviderId, providerDefSchema } from "@orb/contracts/inference";
import type { PluginId, UserId } from "@orb/kit/ids";
import { z } from "zod";
import { ProviderError } from "../contract/errors.ts";
import type { ProviderOrigin, ProviderSnapshot } from "../contract/runtime.ts";
import type { ProviderStore } from "../deps.ts";

export interface ProviderRegistry {
  /** The row `viewer` may use: a built-in or admin row, or a plugin row one of `viewer`'s enabled installs contributes. */
  readonly get: (id: string, viewer: UserId) => ProviderDef | undefined;
  /** Every row `viewer` may use, under the same rule as {@link ProviderRegistry.get}. */
  readonly list: (viewer: UserId) => readonly ProviderDef[];
  /** A deployment-wide row (built-in or admin) for a principal-free operator path. Never a plugin row. */
  readonly deploymentRow: (id: string) => ProviderDef | undefined;
  /** Refuses a built-in id, a plugin row whose namespace is not its own plugin's, and a malformed row. */
  readonly register: (row: unknown, origin: ProviderOrigin) => Promise<ProviderDef>;
  readonly drop: (id: ProviderId) => Promise<void>;
  /** Validate the complete manifest set, then atomically replace this plugin install's contributions. */
  readonly registerPlugin: (rows: readonly unknown[], origin: Extract<ProviderOrigin, { readonly plugin: PluginId }>) => Promise<readonly ProviderDef[]>;
  /** Remove only this plugin install's active contributions; the ProviderId's immutable definition remains. */
  readonly dropPlugin: (pluginId: PluginId) => Promise<void>;
  /** Re-read the store — plugin activation on another replica, an admin edit. */
  readonly refresh: () => Promise<void>;
}

function installersByProvider(snapshot: ProviderSnapshot): Map<string, ReadonlySet<UserId>> {
  const byProvider = new Map<string, Set<UserId>>();
  for (const install of snapshot.installs) {
    const owners = byProvider.get(install.providerId) ?? new Set<UserId>();
    owners.add(install.ownerId);
    byProvider.set(install.providerId, owners);
  }
  return byProvider;
}

function replaceEntries<V>(target: Map<string, V>, next: ReadonlyMap<string, V>): void {
  target.clear();
  for (const [key, value] of next) {
    target.set(key, value);
  }
}

export async function createProviderRegistry(store: ProviderStore): Promise<ProviderRegistry> {
  const builtins = new Map<string, ProviderDef>(BUILTIN_PROVIDERS.map((row) => [row.id, row]));
  const runtime = new Map<string, ProviderDef>();
  const installers = new Map<string, ReadonlySet<UserId>>();
  let publicationTail: Promise<void> = Promise.resolve();

  const usableBy = (row: ProviderDef, viewer: UserId): boolean => !isPluginProviderId(row.id) || (installers.get(row.id)?.has(viewer) ?? false);
  const rowOf = (id: string): ProviderDef | undefined => builtins.get(id) ?? runtime.get(id);

  const publishInOrder = <T>(publish: () => Promise<T> | T): Promise<T> => {
    const publication = publicationTail.then(publish);
    // @orb-waive caught-failure-ownership(publication): callers receive and own `publication`; this sibling chain only advances the serialization tail after either verdict. Ends if the returned promise stops carrying the rejection.
    publicationTail = publication.then(
      () => undefined,
      () => undefined,
    );
    return publication;
  };

  const refresh = (): Promise<void> => {
    // Start the read at invocation time, but publish snapshots in invocation order. Two plugin installs can
    // contribute the same immutable ProviderId, so their per-plugin lifecycle lanes do not order the final
    // removal against an older one-contributor read.
    let read: Promise<ProviderSnapshot>;
    try {
      read = store.list();
      // @orb-waive caught-failure-ownership(error): a synchronous store refusal becomes `read`'s rejection and is rethrown from the ordered publication below. Ends if the `!listed.ok` arm stops throwing `listed.error`.
    } catch (error) {
      read = Promise.reject(error);
    }
    // @orb-waive caught-failure-ownership(read): the rejection is retained as the `ok:false` snapshot and rethrown inside `publishInOrder`; it is never treated as an empty provider list. Ends if the `!listed.ok` arm stops throwing.
    const snapshot = read.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    return publishInOrder(async () => {
      const listed = await snapshot;
      if (!listed.ok) {
        throw listed.error;
      }
      replaceEntries(runtime, new Map(listed.value.rows.filter((row) => !builtins.has(row.id)).map((row) => [row.id, row])));
      replaceEntries(installers, installersByProvider(listed.value));
    });
  };
  await refresh();

  const parseRow = (raw: unknown): ProviderDef => {
    const parsed = providerDefSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `provider row rejected:\n${z.prettifyError(parsed.error)}`,
      });
    }
    return parsed.data;
  };
  const validatePluginRows = (rows: readonly unknown[], origin: Extract<ProviderOrigin, { readonly plugin: PluginId }>): readonly ProviderDef[] => {
    const parsed = rows.map(parseRow);
    const seen = new Set<string>();
    for (const row of parsed) {
      if (!isPluginProviderId(row.id) || pluginNameOfProviderId(row.id) !== origin.pluginName) {
        throw new ProviderError({ kind: "invalid", retryable: false, message: `a plugin provider id must be plugin:${origin.pluginName}/<id>` });
      }
      if (seen.has(row.id)) {
        throw new ProviderError({ kind: "invalid", retryable: false, message: `plugin provider "${row.id}" is declared more than once` });
      }
      seen.add(row.id);
    }
    return parsed;
  };
  const registerPlugin = async (rows: readonly unknown[], origin: Extract<ProviderOrigin, { readonly plugin: PluginId }>): Promise<readonly ProviderDef[]> => {
    const parsed = validatePluginRows(rows, origin);
    const replaced = await store.replacePlugin(parsed, origin.plugin);
    if (!replaced.ok) {
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: `provider "${replaced.conflictingId}" already has a different definition or admin owner`,
      });
    }
    try {
      await refresh();
    } catch (publishError) {
      // The DB write is authoritative only once the live registry has accepted the same snapshot. A failed
      // publish is therefore compensated before activation reports failure; otherwise restart could discover
      // a contribution from an activation whose guest never became resident.
      try {
        await store.removePlugin(origin.plugin);
        // A later refresh may already have captured this contribution while our failed publication was
        // queued. Publish the post-rollback store snapshot after those captures so none can resurrect it.
        await refresh();
      } catch (rollbackError) {
        const failure = new Error(`provider activation failed and plugin ${origin.plugin}'s contribution rollback failed`, { cause: publishError });
        Object.defineProperty(failure, "rollbackError", { value: rollbackError });
        throw failure;
      }
      throw publishError;
    }
    return parsed;
  };

  return {
    get: (id, viewer): ProviderDef | undefined => {
      const row = rowOf(id);
      return row !== undefined && usableBy(row, viewer) ? row : undefined;
    },
    list: (viewer) => [...builtins.values(), ...runtime.values()].filter((row) => usableBy(row, viewer)),
    deploymentRow: (id): ProviderDef | undefined => {
      const row = rowOf(id);
      return row === undefined || isPluginProviderId(row.id) ? undefined : row;
    },
    register: async (raw, origin): Promise<ProviderDef> => {
      const row = parseRow(raw);
      if (builtins.has(row.id)) {
        throw new ProviderError({ kind: "invalid", retryable: false, message: `provider "${row.id}" is built-in and cannot be shadowed` });
      }
      if ("plugin" in origin) {
        await registerPlugin([row], origin);
      } else {
        if (isPluginProviderId(row.id)) {
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message: "an admin-added provider id is bare; the plugin: namespace is reserved for plugin manifests",
          });
        }
        if (!(await store.putAdmin(row, origin.admin))) {
          throw new ProviderError({ kind: "invalid", retryable: false, message: `provider "${row.id}" is plugin-owned and cannot be adopted by an admin` });
        }
        await publishInOrder(() => runtime.set(row.id, row));
      }
      return row;
    },
    drop: async (id): Promise<void> => {
      if (builtins.has(id)) {
        throw new ProviderError({ kind: "invalid", retryable: false, message: `provider "${id}" is built-in and cannot be dropped` });
      }
      if (!(await store.removeAdmin(id))) {
        throw new ProviderError({ kind: "invalid", retryable: false, message: `provider "${id}" is not an admin-owned row` });
      }
      await publishInOrder(() => runtime.delete(id));
    },
    registerPlugin,
    dropPlugin: async (pluginId): Promise<void> => {
      await store.removePlugin(pluginId);
      await refresh();
    },
    refresh,
  };
}
