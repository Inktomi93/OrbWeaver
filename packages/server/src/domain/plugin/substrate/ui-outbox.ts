// domain/plugin/substrate/ui-outbox — the in-memory per-plugin UI OUTBOX: where `host.ui.toast` and
// `host.ui.openDialog` land, and the ONE place the plugin-name attribution prefix and the toast rate floor are
// applied. The surface-state plane's sibling: process-wide, ONE per service,
// `ASSUMES(single-replica)`, respawn wipes, cleared per-plugin on deactivate.
//
// WHY AN OUTBOX AND NOT A BUS. A toast and a dialog-open are HOST-MEDIATED CHROME, not state changes. The user
// bus is the freshness router (`data/invalidation.ts` is the one client event→cache seam, and `bus-onData-no-
// store-write` bars a bus consumer from doing anything else) — routing an interruption through it would put a
// non-invalidation payload on the invalidation spine. So these ride the OUTCOME of the client round-trip that
// caused them: `plugin.invokeUiAction` / `plugin.invokeUiCommand` drain the outbox after the guest returns and
// hand the items back to exactly the person who acted.
//
// THE CONSEQUENCE, STATED (it is the security property, not a limitation to apologise for): a dialog can ONLY
// appear as the outcome of an explicit user act on one of the plugin's own surfaces or commands. There is no
// channel a spontaneous open could travel on — it is unspellable, not refused. §9 calls the full page the
// biggest impersonation canvas in this design; a modal a plugin could raise unprompted would be the second.
//
// AND THE HONEST COST: a toast raised OUTSIDE a round-trip (an event handler, a resident tool) has no viewer.
// It waits in the bounded ring for that person's next round-trip with the plugin, or it is evicted. The durable
// "must not be lost" channel stays `notifications.post`, which has recipients, a row, and its own cooldown.

import type { PluginInstance, PluginToast, PluginToastLevel, PluginUiOutcome } from "@orb/contracts/plugin";
import { PLUGIN_TOAST_COOLDOWN_SECONDS, PLUGIN_TOAST_MAX_CHARS, PLUGIN_UI_OUTBOX_MAX } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import type { PluginIdentity } from "../contract/ops.ts";
import type { PluginUiOutbox } from "../contract/service.ts";

const MS_PER_SECOND = 1000;

/** Sweep threshold — one entry per plugin that has ever raised a host-mediated affordance in this process. The
 *  rate-floor precedent: a bounded lazy sweep, never a timer (a timer would read the wall clock in a domain
 *  whose every other time read is injected, and hold a process handle open for a map allowed to be empty). */
const SWEEP_AT_ENTRIES = 1024;

/** One plugin's pending host-mediated effects + its toast cooldown mark. */
interface Outbox {
  toasts: PluginToast[];
  openDialog: string | null;
  lastToastAt: number | null;
}

/** Compose the attribution prefix. The plugin NAME comes from the re-validated manifest at activation and is
 *  closed over domain-side — a guest supplies only the body, so it can never spell a prefix that names someone
 *  else. This is the toast half of the §4.8 labeled-shell wall: a plugin's words always arrive wearing its name. */
function attribute(pluginName: string, message: string): string {
  return `${pluginName}: ${message.slice(0, PLUGIN_TOAST_MAX_CHARS)}`;
}

/**
 * Mint the process-wide UI outbox — ONE per service at compose (the surface-state / resident-registry
 * precedent), shared by the two write ops and the two invoke verbs that drain it. The {@link PluginUiOutbox}
 * type is homed in `contract/service.ts` (the SnippetGate/NotifyFloor convention: seam TYPE in contract,
 * factory in substrate).
 *
 * `now` is INJECTED (the `test-determinism` seam) so a suite advances the toast cooldown rather than sleeping
 * through it.
 */
export function createPluginUiOutbox(now: () => number): PluginUiOutbox {
  const boxes = new Map<PluginId, Outbox>();

  const boxFor = (pluginId: PluginId): Outbox => {
    const existing = boxes.get(pluginId);
    if (existing !== undefined) {
      return existing;
    }
    if (boxes.size >= SWEEP_AT_ENTRIES) {
      for (const [key, box] of boxes) {
        if (box.toasts.length === 0 && box.openDialog === null) {
          boxes.delete(key);
        }
      }
    }
    const fresh: Outbox = { toasts: [], openDialog: null, lastToastAt: null };
    boxes.set(pluginId, fresh);
    return fresh;
  };

  return {
    pushToast: (plugin: PluginIdentity, level: PluginToastLevel, message: string): void => {
      const box = boxFor(plugin.id);
      const at = now();
      // CHECK-AND-CLAIM in one synchronous step, for the same reason `NotifyFloor.admit` is: the membrane admits
      // up to 32 concurrent host calls per instance, so a check that awaited before recording would let a burst
      // all observe the pre-burst mark. The refusal THROWS (→ a rejected guest promise) rather than silently
      // dropping: a plugin that is over its floor should learn that, not wonder why nothing appeared.
      if (box.lastToastAt !== null && at - box.lastToastAt < PLUGIN_TOAST_COOLDOWN_SECONDS * MS_PER_SECOND) {
        throw new Error(`plugin host: ui.toast is limited to one notice every ${PLUGIN_TOAST_COOLDOWN_SECONDS}s for this plugin`);
      }
      box.lastToastAt = at;
      box.toasts.push({ level, message: attribute(plugin.name, message) });
      // Oldest evicted — the outbox carries an invocation's effects to a present person, never a backlog.
      if (box.toasts.length > PLUGIN_UI_OUTBOX_MAX) {
        box.toasts = box.toasts.slice(-PLUGIN_UI_OUTBOX_MAX);
      }
    },

    // LAST WRITE WINS: an invocation that asks twice meant the second one, and two modals at once is not a
    // state the shell has. WHICH dialog is resolved by the draining VERB against the plugin's own registered
    // surfaces — this store holds an id, never a claim that it exists.
    requestDialog: (pluginId: PluginId, surfaceId: string): void => {
      boxFor(pluginId).openDialog = surfaceId;
    },

    drain: (pluginId: PluginId): PluginUiOutcome => {
      const box = boxes.get(pluginId);
      if (box === undefined) {
        return { toasts: [] };
      }
      const toasts = box.toasts;
      const openDialog = box.openDialog;
      box.toasts = [];
      box.openDialog = null;
      return openDialog === null ? { toasts } : { toasts, openDialog };
    },

    clearForPlugin: (pluginId: PluginId): void => {
      boxes.delete(pluginId);
    },
  };
}

/**
 * RESOLVE a drained outcome against the resident instance — the ONE home for "which dialog may actually open",
 * shared by `invokeUiAction` and `invokeUiCommand` (two call sites, one rule; a second spelling would let the
 * two round-trips disagree about what a plugin may open).
 *
 * The `openDialog` id survives only when it names a surface THIS instance registered at the `dialog` anchor.
 * Three things fall out of that, and all three are the point:
 *  - a plugin cannot open another plugin's dialog (the outbox is keyed by the plugin the guest is, and the
 *    surfaces are read off that plugin's own instance);
 *  - it cannot open a `settings`/`page`/`tool-card` surface AS a modal (the anchor is the shape, and a page
 *    smuggled into a modal shell is a different surface than the person consented to see there);
 *  - a stale id (the guest asks for a dialog it stopped registering) costs the ask, never an error — the same
 *    §4.9 posture a stale spec gets.
 */
export function resolveUiOutcome(raw: PluginUiOutcome, instance: PluginInstance): PluginUiOutcome {
  if (raw.openDialog === undefined) {
    return raw;
  }
  const known = instance.surfaces.some((surface) => surface.anchor === "dialog" && surface.id === raw.openDialog);
  return known ? raw : { toasts: raw.toasts };
}
