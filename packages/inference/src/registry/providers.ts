// The provider REGISTRY: the built-in rows ∪ the ProviderStore's runtime rows (plugin/admin), one schema.
// A built-in id can never be shadowed — `register()` of a colliding id is a typed refusal (F8/F9, §5.9-1) —
// so a runtime row can never inherit another id's sealed credentials by AAD. Rows persist in `provider_rows`;
// a connection on a not-yet-activated plugin provider reads `no-connection` until activation, never a parse
// error.

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, isPluginProviderId, pluginNameOfProviderId, providerDefSchema } from "@orb/contracts/inference";
import type { PluginId, UserId } from "@orb/kit/ids";
import { z } from "zod";
import { ProviderError } from "../contract/errors.ts";
import type { ProviderStore } from "../deps.ts";

export type ProviderOrigin = { readonly plugin: PluginId; readonly pluginName: string } | { readonly admin: UserId };

export interface ProviderRegistry {
  readonly get: (id: string) => ProviderDef | undefined;
  readonly list: () => readonly ProviderDef[];
  /** Refuses a built-in id, a plugin row whose namespace is not its own plugin's, and a malformed row. */
  readonly register: (row: unknown, origin: ProviderOrigin) => Promise<ProviderDef>;
  readonly drop: (id: ProviderId) => Promise<void>;
  /** Re-read the store — plugin activation on another replica, an admin edit. */
  readonly refresh: () => Promise<void>;
}

export async function createProviderRegistry(store: ProviderStore): Promise<ProviderRegistry> {
  const builtins = new Map<string, ProviderDef>(BUILTIN_PROVIDERS.map((row) => [row.id, row]));
  const runtime = new Map<string, ProviderDef>();

  const refresh = async (): Promise<void> => {
    runtime.clear();
    for (const row of await store.list()) {
      if (!builtins.has(row.id)) {
        runtime.set(row.id, row);
      }
    }
  };
  await refresh();

  return {
    get: (id) => builtins.get(id) ?? runtime.get(id),
    list: () => [...builtins.values(), ...runtime.values()],
    register: async (raw, origin): Promise<ProviderDef> => {
      const parsed = providerDefSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ProviderError({
          kind: "invalid",
          retryable: false,
          // `z.prettifyError` rather than a message-only `issues` join: the bare join named no field at all,
          // which is the F4 defect verbatim — a plugin or operator registering a row needs the path
          // (zod-error-issues-home).
          message: `provider row rejected:\n${z.prettifyError(parsed.error)}`,
        });
      }
      const row = parsed.data;
      if (builtins.has(row.id)) {
        throw new ProviderError({ kind: "invalid", retryable: false, message: `provider "${row.id}" is built-in and cannot be shadowed` });
      }
      if ("plugin" in origin) {
        if (!isPluginProviderId(row.id) || pluginNameOfProviderId(row.id) !== origin.pluginName) {
          throw new ProviderError({ kind: "invalid", retryable: false, message: `a plugin provider id must be plugin:${origin.pluginName}/<id>` });
        }
        await store.put(row, { plugin: origin.plugin });
      } else {
        if (isPluginProviderId(row.id)) {
          throw new ProviderError({
            kind: "invalid",
            retryable: false,
            message: "an admin-added provider id is bare; the plugin: namespace is reserved for plugin manifests",
          });
        }
        await store.put(row, { admin: origin.admin });
      }
      runtime.set(row.id, row);
      return row;
    },
    drop: async (id): Promise<void> => {
      if (builtins.has(id)) {
        throw new ProviderError({ kind: "invalid", retryable: false, message: `provider "${id}" is built-in and cannot be dropped` });
      }
      await store.remove(id);
      runtime.delete(id);
    },
    refresh,
  };
}
