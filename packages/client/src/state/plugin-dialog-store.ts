// The plugin-DIALOG intent store — the payload channel for the ONE
// `pluginDialog` modal slot, the imagery-store posture applied to the plugin plane: a round-trip's OUTCOME sets
// the subject and opens the slot, the modal body reads it, and the def's `onClose` clears it.
//
// WHY THE SUBJECT LIVES IN `#state` RATHER THAN IN THE MODAL BODY. The opener is a MUTATION RESULT — the toast/
// dialog outcome of `invokeUiAction`/`invokeUiCommand`, which can be fired from a plugin surface in the chat
// flank, a settings pane row, an extension page, the composer's `/plugin` dispatch or the Plugins chrome menu.
// Those are five different subtrees with five different lifetimes; the modal is a shell-level singleton that
// outlives all of them (the imagery precedent: it must survive a virtualized row's unmount). A `#state` action
// is the one channel that reaches it from anywhere without a `#features` import (§5.1).
//
// THE SUBJECT IS THE PAIR, never a spec. The body resolves the surface off the same owner-scoped
// `plugin.listSurfaces` cache every other plugin surface reads, so a dialog whose plugin was disabled between
// the ask and the paint renders the honest "gone" arm instead of a stale tree the client had copied.
// Ephemeral, never persisted (a reload never reopens a modal — the `openModal` transient posture).

import type { PluginId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";
import { openModal } from "./shell-store.ts";

/** WHICH plugin dialog the `pluginDialog` slot is showing. */
export interface PluginDialogSubject {
  readonly pluginId: PluginId;
  /** The `dialog`-anchored surface id the server resolved against the plugin's OWN registrations. */
  readonly surfaceId: string;
}

interface PluginDialogState {
  readonly subject: PluginDialogSubject | undefined;
}

const usePluginDialogStore = createGatedStore<PluginDialogState>("plugin-dialog", (): PluginDialogState => ({ subject: undefined }));

/** Open the house modal on one of a plugin's registered `dialog` surfaces. Called ONLY from a round-trip
 *  outcome — there is no affordance that opens a plugin dialog directly, which is the §4.5a wall. */
export function openPluginDialog(subject: PluginDialogSubject): void {
  usePluginDialogStore.setState({ subject }, false, "plugin-dialog/open");
  openModal("pluginDialog");
}

/** The `pluginDialog` modal's `onClose` — drop the subject so a re-open never inherits a stale one. */
export function clearPluginDialog(): void {
  usePluginDialogStore.setState({ subject: undefined }, false, "plugin-dialog/clear");
}

/** Reactive: which dialog the slot is showing (`undefined` ⇒ nothing to draw). */
export function usePluginDialogSubject(): PluginDialogSubject | undefined {
  return usePluginDialogStore((s) => s.subject);
}

/** Non-reactive snapshot — for the store's own tests and reads outside a render. */
export function __readPluginDialogSubjectForTest(): PluginDialogSubject | undefined {
  return usePluginDialogStore.getState().subject;
}

/** Clear the slot — test-only hygiene (a module singleton must not leak state across tests). */
export function __resetPluginDialog(): void {
  usePluginDialogStore.setState({ subject: undefined }, false, "plugin-dialog/reset");
}
