// The one notice an upgrade owes, for both doors that make one (a bundle from a file, and an update the source serves). The new
// version shows on the row the person acted on, so a success toast would repeat it (client-architecture-state-and-gates.md §11); only an
// upgrade that left reach waiting for approval is told, because its notice sits lower on the row. The plugin is off after a widening
// update, and on after an update that widened nothing while an earlier refusal still stands.

import type { PluginStatus } from "@orb/contracts/plugin";
import { notify } from "#lib";
import { upgradeNeedsApprovalNotice } from "./plugin-copy.ts";

export function notifyUpgradeNeedsApproval(pluginName: string, updated: { readonly reconsentPending: boolean; readonly status: PluginStatus }): void {
  if (updated.reconsentPending) {
    notify.info(upgradeNeedsApprovalNotice(pluginName, updated.status === "enabled"));
  }
}
