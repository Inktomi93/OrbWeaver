import type { ProviderDef, ProviderId, Task } from "@orb/contracts/inference";
import type { PluginId, UserId } from "@orb/kit/ids";
import type { InferenceDeps, ProviderOrigin } from "./runtime.ts";

export interface BackendDef {
  readonly serves: readonly Task[];
  /** The missing need's name, or `null` when the wire can be built on these deps. */
  readonly needs: (deps: InferenceDeps) => string | null;
}

export interface ProviderRegistry {
  /** The row `viewer` may use: a built-in or admin row, or `viewer`'s own plugin row their enabled install serves. */
  readonly get: (id: string, viewer: UserId) => ProviderDef | undefined;
  /** Every row `viewer` may use, under the same rule as {@link ProviderRegistry.get}. */
  readonly list: (viewer: UserId) => readonly ProviderDef[];
  /** A deployment-wide row (built-in or admin) for a principal-free operator path. Never a plugin row. */
  readonly deploymentRow: (id: string) => ProviderDef | undefined;
  /** Refuses a built-in id, a plugin row whose namespace is not its own plugin's, and a malformed row. */
  readonly register: (row: unknown, origin: ProviderOrigin) => Promise<ProviderDef>;
  readonly drop: (id: ProviderId) => Promise<void>;
  /** Validate the complete manifest set, then atomically link it to this plugin install owner's claims. */
  readonly registerPlugin: (rows: readonly unknown[], origin: Extract<ProviderOrigin, { readonly plugin: PluginId }>) => Promise<readonly ProviderDef[]>;
  /** Unlink this plugin install's claims; each owner's claimed definition remains as their tombstone. */
  readonly dropPlugin: (pluginId: PluginId) => Promise<void>;
  /** Re-read the store — plugin activation on another replica, an admin edit. */
  readonly refresh: () => Promise<void>;
}
