// domain/plugin/substrate/surface-state — the in-memory per-(pluginId, surfaceId) UI-surface STATE plane
// (plugin-ui-plane #679 U1). `host.ui.setState` writes it (through the bridge → the compose op); `plugin.
// getSurfaceState` reads it (the U1 read verb). The S4-suggestion-store precedent: process-wide, ONE per
// service, `ASSUMES(single-replica)`, and RESPAWN WIPES — durable state is the plugin's own `storage.kv` job,
// never this. Keyed by BOTH pluginId AND surfaceId, so one plugin's surfaces never collide with another's and
// a cross-plugin read is not expressible (the reader always names its own pluginId, resolved owner-scoped
// upstream). Cleared per-plugin on deactivate/uninstall (no ghost state outlives a disabled plugin).

import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { PluginId, UserId } from "@orb/kit/ids";
import type { PluginHostOps } from "../contract/ops.ts";
import type { PluginSurfaceStateStore } from "../contract/service.ts";

/** The serialized-size ceiling on ONE surface's published state (plugin-ui-plane §4.2: "≤ 16 KiB JSON;
 *  replaces whole"). Over cap is a REFUSAL (the membrane surfaces it to the guest as a rejected promise),
 *  never a silent truncation of a state object whose shape the renderer binds by path. */
const SURFACE_STATE_MAX_BYTES = 16_384;

/** The per-plugin ceiling on the number of DISTINCT surfaceId keys the state plane holds (the storage.kv
 *  256-key discipline, but SMALL — a plugin's surfaces are few). Without it a resident plugin could loop
 *  `host.ui.setState(mint(), <16 KiB blob>)` with a fresh surfaceId each call and grow THIS Map without bound in
 *  the DOMAIN's Node/V8 heap (NOT the guest WASM heap — the 32 MiB sandbox cap does not reach it), a host OOM
 *  affecting every tenant (#707 Finding B). A NEW surfaceId past the cap is refused; an existing-surface
 *  overwrite always proceeds (only a new key consumes a slot). `64 × 16 KiB ≈ 1 MiB` bounds one plugin's plane. */
export const PLUGIN_SURFACE_STATE_MAX_KEYS = 64;

/** UTF-8 byte length without `TextEncoder` (server code, but kept isomorphic-style for one home with the
 *  contract's `ui.ts` byte counter — `encodeURIComponent` emits one char per ASCII byte and a `%XX` triple per
 *  other, so collapsing each triple to one char yields the byte count). */
function utf8ByteLength(source: string): number {
  return encodeURIComponent(source).replace(/%[0-9A-F]{2}/g, "_").length;
}

/** The `${pluginId}:${surfaceId}` composite key — COLON-separated, unambiguous because a
 *  `PluginId` is a TypeID and a surface id is `/^[a-z][a-z0-9_]{0,40}$/` (neither can contain a colon). */
function stateKey(pluginId: PluginId, surfaceId: string): string {
  return `${pluginId}:${surfaceId}`;
}

/** Mint the process-wide surface-state plane — ONE per service at compose (the resident-registry /
 *  suggestion-store precedent), shared by the write op + the read verb + the deactivate sweep. The
 *  {@link PluginSurfaceStateStore} type is homed in `contract/service.ts` (the SnippetGate/NotifyFloor
 *  convention: the seam TYPE lives in contract, the factory in substrate). */
export function createPluginSurfaceStateStore(): PluginSurfaceStateStore {
  const states = new Map<string, Record<string, unknown>>();
  return {
    set: (pluginId, surfaceId, state): void => {
      if (utf8ByteLength(JSON.stringify(state)) > SURFACE_STATE_MAX_BYTES) {
        throw new Error(`plugin host: ui.setState state exceeds the ${SURFACE_STATE_MAX_BYTES}-byte cap`);
      }
      const key = stateKey(pluginId, surfaceId);
      // Only a NEW surfaceId consumes a slot — an existing-surface overwrite always proceeds (the storage.kv
      // discipline). A fresh id past the cap is REFUSED, so a `setState(mint(), …)` loop cannot grow the plane
      // unbounded (#707 Finding B). The count is a prefix scan over the shared Map; the cap is small so the
      // scan stays tiny (at most PLUGIN_SURFACE_STATE_MAX_KEYS keys per plugin).
      if (!states.has(key)) {
        const prefix = `${pluginId}:`;
        let count = 0;
        for (const existing of states.keys()) {
          if (existing.startsWith(prefix)) {
            count += 1;
          }
        }
        if (count >= PLUGIN_SURFACE_STATE_MAX_KEYS) {
          throw new Error(`plugin host: ui.setState exceeds the ${PLUGIN_SURFACE_STATE_MAX_KEYS}-surface state cap for this plugin`);
        }
      }
      states.set(key, state);
    },
    get: (pluginId, surfaceId): Record<string, unknown> | null => states.get(stateKey(pluginId, surfaceId)) ?? null,
    clearForPlugin: (pluginId): void => {
      const prefix = `${pluginId}:`;
      for (const key of states.keys()) {
        if (key.startsWith(prefix)) {
          states.delete(key);
        }
      }
    },
  };
}

/** Build the `host.ui.setState` op (`PluginHostOps["ui"]["setState"]`) over the shared {@link
 *  PluginSurfaceStateStore} + the injected user-bus emit. It WRITES the surface's whole replacement state, then
 *  fires the per-user `pluginSurfaceStateChanged` poke so the INSTALLER's own client refetches. Homed in the
 *  DOMAIN (not the compose seam) DELIBERATELY: the `user-bus-coverage` gate's emit-scope is `domain|transport`
 *  ONLY — a compose-side event literal reads as an un-covered producer, so the emit literal lives HERE where the
 *  ratchet can prove the member is wired (the same reason every domain verb constructs its own `emitUserEvent`
 *  event rather than letting compose do it). Compose injects the store + `publishUserEvent`. */
export function createSurfaceStatePublisher(store: PluginSurfaceStateStore, emit: EmitUserEvent): PluginHostOps["ui"]["setState"] {
  return (pluginId: PluginId, installerUserId: UserId, surfaceId: string, state: Record<string, unknown>): Promise<void> => {
    store.set(pluginId, surfaceId, state);
    emit(installerUserId, { type: "pluginSurfaceStateChanged", pluginId });
    return Promise.resolve();
  };
}
