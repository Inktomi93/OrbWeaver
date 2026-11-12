// The one notice an upgrade owes, for both doors that make one (a bundle from a file, and an update the source serves). The new
// version shows on the row the person acted on, so a success toast would repeat it (client-architecture-state-and-gates.md §11); only an
// upgrade that left the plugin off for more reach is told, because its notice sits lower on the row.

import { notify } from "#lib";

export function notifyUpgradeStayedOff(pluginName: string, updated: { readonly reconsentPending: boolean }): void {
  if (updated.reconsentPending) {
    notify.info(`${pluginName} stayed off: this update asks for more than you've allowed. Check below.`);
  }
}
