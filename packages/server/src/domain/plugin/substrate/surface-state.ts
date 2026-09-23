// domain/plugin/substrate/surface-state — the in-memory per-(pluginId, surfaceId, chatId?) UI-surface STATE
// plane (U1; the chatId dimension is row 777). `host.ui.setState` writes it (through the
// bridge → the compose op); `plugin.getSurfaceState` reads it (the U1 read verb). The S4-suggestion-store
// precedent: process-wide, ONE per service, `ASSUMES(single-replica)`, and RESPAWN WIPES — durable state is the
// plugin's own `storage.kv` job, never this. Keyed by pluginId AND surfaceId AND the optional chatId, so one
// plugin's surfaces never collide with another's, a cross-plugin read is not expressible (the reader always
// names its own pluginId, resolved owner-scoped upstream), and a room-anchored surface reads only ITS room's
// publication. Cleared per-plugin — across every room — on deactivate/uninstall (no ghost state outlives a
// disabled plugin).
//
// THE ROOM DIMENSION IS A KEY, NOT A FILTER (row 777). `chatId: null` and a concrete chat id name DIFFERENT
// rows and neither falls back to the other. A plugin publishing room-wide ("your latest reading, taken across
// your rooms") and one publishing per-room ("this room's reading") are making different claims, and quietly
// serving the shared row to a room-scoped read would turn the second claim into a lie the first time a plugin
// did both. A miss reads `null`, which the anchored fan-out already renders as SILENCE (§4.9).

import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { ChatId, PluginId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { PluginHostOps } from "../contract/ops.ts";
import type { PluginSurfaceStateStore } from "../contract/service.ts";

/** The serialized-size ceiling on ONE surface's published state ("≤ 16 KiB JSON;
 *  replaces whole"). Over cap is a REFUSAL (the membrane surfaces it to the guest as a rejected promise),
 *  never a silent truncation of a state object whose shape the renderer binds by path. */
const SURFACE_STATE_MAX_BYTES = 16_384;

/** The per-plugin ceiling on the number of DISTINCT state keys the plane holds (the storage.kv 256-key
 *  discipline, but SMALL). Without it a resident plugin could loop `host.ui.setState(mint(), <16 KiB blob>)`
 *  with a fresh surfaceId each call and grow THIS Map without bound in the DOMAIN's Node/V8 heap (NOT the guest
 *  WASM heap — the 32 MiB sandbox cap does not reach it), a host OOM affecting every tenant (#707 Finding B). A
 *  NEW key past the cap is refused; an existing-key overwrite always proceeds (only a new key consumes a slot).
 *  `64 × 16 KiB ≈ 1 MiB` bounds one plugin's plane.
 *
 *  ROW 777 CONSEQUENCE, stated rather than silently widened: a key is now `(surfaceId, chatId?)`, so a
 *  room-anchored widget consumes ONE SLOT PER ROOM it publishes into and a plugin in 64 rooms refuses the 65th.
 *  That refusal is CONTAINED (a rejected guest promise + the log line below) and the 1 MiB heap bound is exactly
 *  the one #707 bought, so this lane does NOT widen a DoS belt to make a feature roomier. The priced revision —
 *  per-plugin byte budget rather than key count, or an LRU over rooms — is board row 778, parked until a real
 *  plugin hits this. Until then the refusal must be VISIBLE: a per-room widget that silently stopped updating
 *  with no trace would violate §4.9's diagnosability posture, so the throw carries the plugin AND the room. */
export const PLUGIN_SURFACE_STATE_MAX_KEYS = 64;

/** UTF-8 byte length without `TextEncoder` (server code, but kept isomorphic-style for one home with the
 *  contract's `ui.ts` byte counter — `encodeURIComponent` emits one char per ASCII byte and a `%XX` triple per
 *  other, so collapsing each triple to one char yields the byte count). */
function utf8ByteLength(source: string): number {
  return encodeURIComponent(source).replace(/%[0-9A-F]{2}/g, "_").length;
}

/** The `${pluginId}:${surfaceId}` / `${pluginId}:${surfaceId}:${chatId}` composite key — COLON-separated and
 *  unambiguous because every segment is colon-free by its own grammar (a `PluginId`/`ChatId` is a TypeID, a
 *  surface id is `/^[a-z][a-z0-9_]{0,40}$/`). The room-less form is the SHORTER key rather than a `:` sentinel
 *  so a U1 row and a row-777 row can never alias. */
function stateKey(pluginId: PluginId, surfaceId: string, chatId: ChatId | null): string {
  return chatId === null ? `${pluginId}:${surfaceId}` : `${pluginId}:${surfaceId}:${chatId}`;
}

/** Mint the process-wide surface-state plane — ONE per service at compose (the resident-registry /
 *  suggestion-store precedent), shared by the write op + the read verb + the deactivate sweep. The
 *  {@link PluginSurfaceStateStore} type is homed in `contract/service.ts` (the SnippetGate/NotifyFloor
 *  convention: the seam TYPE lives in contract, the factory in substrate). */
export function createPluginSurfaceStateStore(): PluginSurfaceStateStore {
  const states = new Map<string, Record<string, unknown>>();
  const log = getLog();
  return {
    set: (pluginId, surfaceId, chatId, state): void => {
      if (utf8ByteLength(JSON.stringify(state)) > SURFACE_STATE_MAX_BYTES) {
        throw new Error(`plugin host: ui.setState state exceeds the ${SURFACE_STATE_MAX_BYTES}-byte cap`);
      }
      const key = stateKey(pluginId, surfaceId, chatId);
      // Only a NEW key consumes a slot — an existing-key overwrite always proceeds (the storage.kv discipline).
      // A fresh key past the cap is REFUSED, so a `setState(mint(), …)` loop cannot grow the plane unbounded
      // (#707 Finding B). The count is a prefix scan over the shared Map; the cap is small so the scan stays
      // tiny (at most PLUGIN_SURFACE_STATE_MAX_KEYS keys per plugin).
      if (!states.has(key)) {
        const prefix = `${pluginId}:`;
        let count = 0;
        for (const existing of states.keys()) {
          if (existing.startsWith(prefix)) {
            count += 1;
          }
        }
        if (count >= PLUGIN_SURFACE_STATE_MAX_KEYS) {
          // LOUD, not silent (row 777 / §4.9): with the room dimension this cap is reachable by a legitimate
          // per-room widget in a 65th room, and a widget that just stops updating with no trace is exactly the
          // undiagnosable failure the plugin log exists to prevent. The guest sees the rejection; an operator
          // sees WHICH plugin and WHICH room, which is what a board-row-778 decision would be made from.
          log.warn(
            { pluginId, surfaceId, chatId, cap: PLUGIN_SURFACE_STATE_MAX_KEYS },
            "plugin: ui.setState refused — this plugin is at its surface-state key cap (row 778)",
          );
          throw new Error(`plugin host: ui.setState exceeds the ${PLUGIN_SURFACE_STATE_MAX_KEYS}-key state cap for this plugin`);
        }
      }
      states.set(key, state);
    },
    get: (pluginId, surfaceId, chatId): Record<string, unknown> | null => states.get(stateKey(pluginId, surfaceId, chatId)) ?? null,
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
 *  DOMAIN (not the compose seam) DELIBERATELY: the `bus-producer-coverage` gate's emit-scope is `domain|transport`
 *  ONLY — a compose-side event literal reads as an un-covered producer, so the emit literal lives HERE where the
 *  ratchet can prove the member is wired (the same reason every domain verb constructs its own `emitUserEvent`
 *  event rather than letting compose do it). Compose injects the store + `publishUserEvent`.
 *
 *  THE POKE STAYS COARSE, and that is a preserved ruling rather than an oversight (row 777). The bus member's
 *  own home (`@orb/contracts/user-bus`) records the decision: this member carries a `pluginId` hint and no
 *  finer one, because the client's filter path-invalidates `plugin.getSurfaceState` WHOLE
 *  (`data/invalidation.ts`) — every input, chat-keyed rows included — so a `chatId` on the event would target
 *  nothing the coarse map does not already refresh. The room dimension changed the KEY SPACE, not the
 *  freshness channel. */
export function createSurfaceStatePublisher(store: PluginSurfaceStateStore, emit: EmitUserEvent): PluginHostOps["ui"]["setState"] {
  return ({ pluginId, installerUserId, surfaceId, chatId, state }): Promise<void> => {
    store.set(pluginId, surfaceId, chatId, state);
    emit(installerUserId, { type: "pluginSurfaceStateChanged", pluginId });
    return Promise.resolve();
  };
}
