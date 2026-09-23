// The ONE client-side applier for a plugin round-trip's UI OUTCOME. Every
// surface that can run guest code — a DSL button, a `/plugin` dispatch, the Plugins chrome menu — hands the
// mutation's result here, and this file decides what a person sees.
//
// WHY IT IS ONE FUNCTION AND NOT A CALLBACK PER CALL SITE: the outcome is chrome (a toast, a modal), and chrome
// grammar is the HOUSE's, not the caller's. Three call sites each deciding how to render a plugin toast is how
// three different plugin toast shapes ship — the parallel-map failure in miniature. It also keeps the
// attribution honest in one place: the prefix is stamped SERVER-side (the outbox closes over the plugin's own
// manifest name), so this side renders the string verbatim and never composes a name of its own.
//
// THE DIALOG ARM IS THE ONLY WAY A PLUGIN MODAL OPENS. There is deliberately no "open this plugin dialog"
// affordance anywhere in the client: `openPluginDialog` is called from here and nowhere else, so a modal can
// only ever be the outcome of an explicit user act on one of the plugin's own surfaces or commands (§4.5a). A
// spontaneous open has no code path, which is what "unspellable rather than refused" means in practice.

import type { PluginToast, PluginToastLevel, PluginUiOutcome } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { notify } from "#lib";
import { openPluginDialog } from "#state";

/** The house `notify` arm per plugin toast level — a TOTAL Record over the closed axis, so widening the
 *  vocabulary fails `tsc` here rather than silently dropping a level on the floor. */
const TOAST_ARMS: Record<PluginToastLevel, (message: string) => void> = {
  info: (message) => notify.info(message),
  success: (message) => notify.success(message),
  warn: (message) => notify.warn(message),
  error: (message) => notify.error(message),
};

function raise(toast: PluginToast): void {
  TOAST_ARMS[toast.level](toast.message);
}

/**
 * Apply one round-trip's host-mediated effects: raise every toast in arrival order, then open the dialog it
 * asked for (if any). The ORDER matters and is not incidental — a plugin that toasts "found 12 results" and
 * then opens a dialog wants the sentence to have been said before the modal takes the screen, and the reverse
 * order would put the toast behind a scrim.
 *
 * The server has already resolved `openDialog` against the plugin's OWN registered `dialog` surfaces, so this
 * side never re-checks existence: an id that reaches here named a real surface at drain time.
 */
export function applyPluginUiOutcome(pluginId: PluginId, outcome: PluginUiOutcome): void {
  for (const toast of outcome.toasts) {
    raise(toast);
  }
  if (outcome.openDialog !== undefined) {
    openPluginDialog({ pluginId, surfaceId: outcome.openDialog });
  }
}
