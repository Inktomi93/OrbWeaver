// Boot step: bring every ENABLED plugin row RESIDENT again (#1865). `PluginRegistry` is an in-process `Map`
// (`domain/plugin/contract/service.ts`, ASSUMES(single-replica)) that only `activate` ever writes, and
// `activate`'s callers are all owner-initiated verbs — so before this step existed, a restart left every
// `enabled` row with NO resident instance and the app silently lost every plugin contribution at once:
// surfaces (`listSurfaces`), commands, display transforms, tools and event subscriptions all gate on
// `registry.get(row.id)`. The row still said `enabled`, the Plugins pane still drew the switch ON, and the
// Extensions section — reading the row, not the registry — told the owner to install a plugin they already
// had. The row is the record and the registry is a VIEW of it (`domain/plugin/activation/activate.ts`);
// this is the step that re-derives the view at boot.
//
// IT DRIVES THE REAL VERB, NOT `activate`. `setEnabled(enabled: true)` is already exactly this operation —
// deactivate any stale resident, then activate on the CAS bundle under the STORED grant and the CONSENTED
// reach (a standing re-consent's unanswered `netHosts` stay withheld). Reusing it means boot cannot become a
// second activation path that drifts from the toggle: no new domain seam, no exported `activate`, and the
// consent posture is one story. It is idempotent per target state, so a row the seeder's auto-upgrade
// already brought resident is merely torn down and rebuilt, never doubled.
//
// EVERY RESTORE RUNS AS THE ROW'S OWN OWNER. The discovery read is un-owner-scoped by necessity (one query
// for every user's rows), but it projects only `(pluginId, ownerId)`, and each restore resolves THAT owner's
// Principal through the same `createHostPrincipalResolver` the boot seed uses and calls the owner-scoped
// verb, which re-loads the row under `caller.userId` before it runs a line of guest code. A cross-owner
// enable would execute one person's untrusted bundle under another's identity, credential and rooms
// (`verbs/set-enabled.ts`) — this step never has the materials to do that.
//
// NEVER THROWS, AND THE BREAKDOWN IS THE LOG LINE. One plugin's bad bundle must not abort boot or skip the
// rest of the sweep, so each row is caught individually; `activate` has already landed that row `errored`
// with its `lastError` by the time the rejection arrives, which is the durable record — the log line is the
// operator's. The counts are reported per-disposition for the `reclaim-locks` reason: "N restored" alone
// would hide the fact that three plugins failed to start.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { errorMessage } from "@orb/kit/error-message";
import type { PluginId, UserId } from "@orb/kit/ids";
import type { PluginService } from "#domain/plugin";
import { listEnabledAcrossOwners } from "#domain/plugin";
import { getLog } from "#foundation/observability";

export interface ReactivatePluginsDeps {
  readonly db: Db;
  /** The REAL owner-scoped verb — the same one the Plugins pane's switch drives. */
  readonly setEnabled: PluginService["setEnabled"];
  /** Row owner → Principal, the boot seed's resolver (`createHostPrincipalResolver`). Reading the role off
   *  the users row rather than stamping one is D135: a box whose owner row sits below `owner` restores at
   *  its honest role and fails closed, instead of a synthetic literal granting authority. */
  readonly resolvePrincipal: (userId: UserId) => Promise<Principal>;
}

/** What the sweep did. `failed` rows are `errored` in the db with their `lastError` — this is the count, not
 *  the record. */
export interface ReactivatePluginsReport {
  readonly restored: number;
  readonly failed: number;
}

/** Restore one row. Returns whether it came resident, so the caller does the counting in one place and a
 *  per-row throw can never escape the sweep. */
async function restoreOne(
  deps: ReactivatePluginsDeps,
  principals: Map<UserId, Promise<Principal>>,
  row: { readonly pluginId: PluginId; readonly ownerId: UserId },
): Promise<boolean> {
  try {
    // Memoized per owner: on a single-owner box this is one resolve for the whole sweep, and on a shared one
    // it is one per user rather than one per plugin.
    let principal = principals.get(row.ownerId);
    if (principal === undefined) {
      principal = deps.resolvePrincipal(row.ownerId);
      principals.set(row.ownerId, principal);
    }
    await deps.setEnabled({ caller: await principal, pluginId: row.pluginId, enabled: true });
    return true;
  } catch (err: unknown) {
    // OWNED HERE, not marshalled up as a string: by the time this rejection arrives `activate` has already
    // written the row `errored` with its `lastError` (the durable record), and this is the operator's copy —
    // one line per plugin that died, naming it, because a boot with three failures should read as three
    // failures rather than as a number in a summary. The counts below are the summary, not the report.
    getLog().error({ pluginId: row.pluginId, ownerId: row.ownerId, err: errorMessage(err) }, "boot/reactivate-plugins: a plugin failed to start");
    return false;
  }
}

/**
 * Re-activate every plugin row the database says is `enabled`, so the in-process registry agrees with the
 * durable record after a restart. Returns the per-disposition counts; never throws.
 *
 * ORDERING: this runs BEFORE `seedExamplePlugins`, deliberately. The seeder's auto-upgrade swaps a diverged
 * showcase row's bundle and re-activates it itself, so restoring first means an upgraded row ends resident
 * on the NEW bundle with no wasted second activation, and a fresh box (where the seeder installs everything
 * `disabled`) simply finds nothing to restore.
 */
export async function reactivatePluginsOnBoot(deps: ReactivatePluginsDeps): Promise<ReactivatePluginsReport> {
  const rows = await listEnabledAcrossOwners(deps.db);
  if (rows.length === 0) {
    return { restored: 0, failed: 0 };
  }
  const log = getLog();
  const principals = new Map<UserId, Promise<Principal>>();
  let restored = 0;
  let failed = 0;
  // SERIAL, not `Promise.all`: activation runs untrusted guest code under the host's invocation budget, and
  // a parallel fan-out over every installed plugin would race that budget against boot itself.
  for (const row of rows) {
    if (await restoreOne(deps, principals, row)) {
      restored += 1;
      continue;
    }
    failed += 1;
  }
  log.info({ restored, failed }, "boot/reactivate-plugins: restored the resident instances the respawn wiped");
  return { restored, failed };
}
