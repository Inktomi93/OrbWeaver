// C7 — the plugin lifecycle WRITE verbs the Plugins settings pane drives (interaction-direction-spec
// §7-C7/§7-C7a). Each is a module-scope `createEntityMutation` (§13.1 — the ONE mutation home; a call site
// never hand-rolls `useMutation` + cache surgery). TVars/TData are tRPC-INFERRED, so a wire reshape breaks
// here at compile time.
//
// FRESHNESS — why `invalidates`, never `busDriven`: the plugin lifecycle emits NO bus event (there is no
// plugin room, and `plugin.list` is a per-owner catalog read, not a room read), so every write reconciles
// `plugin.list` itself. `getLog` is invalidated by the writes that can move it — enable (activation can log
// or fail) and upgrade (a new bundle logs against the same plugin row).
//
// ERROR COPY IS THE SERVER'S. The `domain/plugin` lifecycle errors already carry host-readable sentences
// ("a plugin with slug \"x\" is already installed — use Update to change its bundle"; "you already have 4
// snippets running…"), which is unusual and deliberate: they are the refusals a person holding a file needs
// to act on. So `errorToast` forwards `error.message` and falls back to a generic line only when the error
// is not one of ours — re-spelling them here would give one refusal two homes that drift.

import type { PluginId } from "@orb/kit/ids";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** The `plugin.list` read every write reconciles — tRPC-inferred, so the optimistic patch below stays
 *  honest against the wire shape. */
type PluginList = inferOutput<Trpc["plugin"]["list"]>;

/** The server's own refusal sentence when it threw one, else `fallback`. The lifecycle taxonomy
 *  (`ManifestInvalidError`, `PluginAlreadyInstalledError`, `PluginDowngradeRefusedError`,
 *  `PluginSnippetBusyError`) is already written to be read by the person who hit it. */
function serverReason(fallback: string): (error: unknown) => string {
  return (error) => (error instanceof Error && error.message.length > 0 ? error.message : fallback);
}

/** Install a bundle with a CONFIRMED grant subset. The row lands `disabled` — enabling is a second explicit
 *  act (`PLUGIN_STATUSES`' own rule, the same posture as a minted rule), so there is nothing optimistic to
 *  paint: the response IS the new row and the settle invalidate brings the list with it. */
export const useInstallPlugin = createEntityMutation<inferInput<Trpc["plugin"]["install"]>, inferOutput<Trpc["plugin"]["install"]>>({
  options: (trpc) => trpc.plugin.install.mutationOptions(),
  invalidates: (trpc) => [trpc.plugin.list.queryFilter()],
  errorToast: serverReason("Couldn't install that plugin."),
});

/** Replace an installed plugin's bundle. The verb refuses a downgrade and a slug mismatch outright; a
 *  REACH-WIDENING upgrade succeeds but lands `disabled` pending re-confirmation, so the caller reads the
 *  returned `PluginView.status` rather than assuming the plugin kept running. Also invalidates the log —
 *  a re-activation on the new bundle writes to it. */
export const useUpgradePlugin = createEntityMutation<inferInput<Trpc["plugin"]["upgrade"]>, inferOutput<Trpc["plugin"]["upgrade"]>>({
  options: (trpc) => trpc.plugin.upgrade.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.plugin.list.queryFilter(), trpc.plugin.getLog.queryFilter({ pluginId: vars.pluginId })],
  errorToast: serverReason("Couldn't update that plugin."),
});

/**
 * The RE-CONSENT act (#650 P1-1/P1-3) — grants a NEW subset against the currently-installed manifest. `grant`
 * is the WHOLE new set, not a delta (the verb's own contract: a consent surface shows the complete
 * asked-vs-allowed picture and sends back exactly what it displayed). This is what turns the re-consent
 * notice's escape into a real path instead of "remove and reinstall": before this verb existed, a widening
 * upgrade's un-granted capability was permanently un-grantable short of dropping the plugin's storage.
 */
export const useSetPluginGrant = createEntityMutation<inferInput<Trpc["plugin"]["setGrant"]>, inferOutput<Trpc["plugin"]["setGrant"]>>({
  options: (trpc) => trpc.plugin.setGrant.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.plugin.list.queryFilter(), trpc.plugin.getLog.queryFilter({ pluginId: vars.pluginId })],
  errorToast: serverReason("Couldn't update that plugin's permissions."),
});

/**
 * Turn a plugin on or off. OPTIMISTIC on the `plugin.list` cache so the switch paints before the round trip
 * — a discrete-write control outside any autosave form — then reconciled by the settle invalidate.
 *
 * The optimistic patch is DELIBERATELY ONE-WAY-HONEST: enabling paints `"enabled"`, but activation can
 * FAIL (a guest whose `main.js` throws lands `errored`, not `enabled`), so the settle repaint is what tells
 * the truth and the row's error line comes from the server's `lastError`. Disabling cannot fail that way.
 */
export const useSetPluginEnabled = createEntityMutation<inferInput<Trpc["plugin"]["setEnabled"]>, inferOutput<Trpc["plugin"]["setEnabled"]>, PluginList>({
  options: (trpc) => trpc.plugin.setEnabled.mutationOptions(),
  optimistic: {
    readKey: (trpc) => trpc.plugin.list.queryKey(),
    update: (old, vars) =>
      old === undefined ? old : old.map((row) => (row.id === vars.pluginId ? { ...row, status: vars.enabled ? "enabled" : "disabled" } : row)),
  },
  invalidates: (trpc, vars) => [trpc.plugin.list.queryFilter(), trpc.plugin.getLog.queryFilter({ pluginId: vars.pluginId })],
  errorToast: serverReason("Couldn't change whether that plugin is on."),
});

/** Remove a plugin, its bundle asset, and its registrations. No optimistic removal — the surface puts this
 *  behind a confirm, and a failed uninstall flashing a row back is worse than the brief settle refetch. */
export const useUninstallPlugin = createEntityMutation<{ readonly pluginId: PluginId }, inferOutput<Trpc["plugin"]["uninstall"]>>({
  options: (trpc) => trpc.plugin.uninstall.mutationOptions(),
  invalidates: (trpc) => [trpc.plugin.list.queryFilter()],
  errorToast: serverReason("Couldn't remove that plugin."),
});

/**
 * ADMIN — publish a bundle to every account (D147 clause (d)). It reconciles TWO reads: the published set it
 * just changed, and the caller's OWN `plugin.list`, because the admin is a user too and the fan-out mints them
 * a copy like everyone else — without the second invalidate their own pane would keep saying they have nothing
 * until a reload. No optimistic paint: the result carries `applied`/`skipped` counts nothing client-side can
 * predict (it depends on who already holds the slug).
 */
export const useDistributePlugin = createEntityMutation<inferInput<Trpc["plugin"]["installForAllUsers"]>, inferOutput<Trpc["plugin"]["installForAllUsers"]>>({
  options: (trpc) => trpc.plugin.installForAllUsers.mutationOptions(),
  invalidates: (trpc) => [trpc.plugin.listDistributed.queryFilter(), trpc.plugin.list.queryFilter()],
  errorToast: serverReason("Couldn't distribute that plugin."),
});

/** ADMIN — withdraw a published plugin: drop it from the published set and uninstall every copy still at the
 *  distributed version. Same two invalidates, same reason (the admin's own copy goes with everyone else's). */
export const useWithdrawPlugin = createEntityMutation<inferInput<Trpc["plugin"]["uninstallForAllUsers"]>, inferOutput<Trpc["plugin"]["uninstallForAllUsers"]>>({
  options: (trpc) => trpc.plugin.uninstallForAllUsers.mutationOptions(),
  invalidates: (trpc) => [trpc.plugin.listDistributed.queryFilter(), trpc.plugin.list.queryFilter()],
  errorToast: serverReason("Couldn't withdraw that plugin."),
});

/** Run one inline snippet as the caller in one chat. Reconciles nothing — a snippet is transient and
 *  registers nothing; the caller reads the returned drained log + contained `error` through `mutateAsync`.
 *  Its one refusal a person can act on is the per-user concurrency ceiling, whose message says exactly what
 *  to do ("wait for one to finish"), so it rides `errorToast` verbatim. */
export const useRunSnippet = createEntityMutation<inferInput<Trpc["plugin"]["runSnippet"]>, inferOutput<Trpc["plugin"]["runSnippet"]>>({
  options: (trpc) => trpc.plugin.runSnippet.mutationOptions(),
  invalidates: () => [],
  errorToast: serverReason("Couldn't run that snippet."),
});
