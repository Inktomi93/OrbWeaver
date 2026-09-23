// C7 — the plugin lifecycle WRITE verbs the Plugins settings pane drives.
// Each is a module-scope `createEntityMutation` (§13.1 — the ONE mutation home; a call site
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

/** PREVIEW a plugin bundle at a caller-supplied URL (U8, seam 15) — the server fetches
 *  it THROUGH the egress guard and returns its MANIFEST, so the SAME consent/grant screen a file install shows
 *  can be built from a URL the client never fetched itself. Reconciles NOTHING (`invalidates: () => []`): it is
 *  a read-only probe that persists no row, exactly like `runSnippet`.
 *
 *  NO `errorToast`, DELIBERATELY — the URL arm must NOT forward the server's reason. `previewFromUrl` throws two
 *  distinct shapes: `PluginBundleFetchError` (unreachable / refused / SSRF-blocked / non-2xx) and
 *  `ManifestInvalidError` (fetched, but not a plugin). Surfacing which one fired would turn "did the fetch
 *  reach?" into an SSRF ORACLE — so the install card catches the rejection and renders ONE fixed, leak-free
 *  line for every failure, never `error.message` (`plugin-install-card.tsx`). */
export const usePreviewPluginFromUrl = createEntityMutation<inferInput<Trpc["plugin"]["previewFromUrl"]>, inferOutput<Trpc["plugin"]["previewFromUrl"]>>({
  options: (trpc) => trpc.plugin.previewFromUrl.mutationOptions(),
  invalidates: () => [],
});

/** Install a plugin from a URL with a CONFIRMED grant subset (U8, seam 15). The server
 *  re-fetches the bundle through the egress guard and runs it through the EXACT SAME funnel + consent checks a
 *  file `install` takes, minting the caller's own `disabled` row — so this reconciles `plugin.list` on settle
 *  just like `useInstallPlugin`. `errorToast` forwards the server's own sentence (`PluginBundleFetchError` and
 *  `PluginAlreadyInstalledError` are both host-readable and leak-free at the install act), falling back to a
 *  generic line only for an error that is not one of ours. */
export const useInstallPluginFromUrl = createEntityMutation<inferInput<Trpc["plugin"]["installFromUrl"]>, inferOutput<Trpc["plugin"]["installFromUrl"]>>({
  options: (trpc) => trpc.plugin.installFromUrl.mutationOptions(),
  invalidates: (trpc) => [trpc.plugin.list.queryFilter()],
  errorToast: serverReason("Couldn't install that plugin from that URL."),
});

/** Replace an installed plugin's bundle. The verb refuses a downgrade and a slug mismatch outright; a
 *  REACH-WIDENING upgrade succeeds but lands `disabled` pending re-confirmation, so the caller reads the
 *  returned `PluginView.status` rather than assuming the plugin kept running. Also invalidates the log —
 *  a re-activation on the new bundle writes to it. */
export const useUpgradePlugin = createEntityMutation<inferInput<Trpc["plugin"]["upgrade"]>, inferOutput<Trpc["plugin"]["upgrade"]>>({
  options: (trpc) => trpc.plugin.upgrade.mutationOptions(),
  // `listSurfaces` too: a new bundle registers a different surface set, and the
  // plugin lifecycle has no bus event — the write is the freshness driver.
  invalidates: (trpc, vars) => [
    trpc.plugin.list.queryFilter(),
    trpc.plugin.getLog.queryFilter({ pluginId: vars.pluginId }),
    trpc.plugin.listSurfaces.queryFilter(),
    trpc.plugin.listCommands.queryFilter(),
    // …and the bundle-image map (#820): an upgrade REPLACES the `ui/assets/` set, so a surface still holding
    // the old map would keep resolving a path this version dropped — or miss one it added. The upgrade write
    // is its only freshness driver (no bus event exists for the plugin lifecycle).
    trpc.plugin.listBundleAssets.queryFilter(),
  ],
  errorToast: serverReason("Couldn't update that plugin."),
});

/**
 * U8 2b — the AUTO UPDATE-CHECK (the thing ST's loader does). A BATCH mutation (not a query) because the server
 * verb triggers EGRESS to each url-origin plugin's remembered source, and a GET-shaped door onto egress is
 * cacheable + outside the CSRF belt — the same reason `upgradeFromUrl`/`installFromUrl` are mutations. Takes no
 * input (it walks the caller's OWN plugins) and reconciles NOTHING — a check writes nothing; the caller reads the
 * per-plugin verdicts through `mutateAsync` and renders the "Update to X" / "up to date" / "couldn't reach" line.
 */
export const useCheckForUpdates = createEntityMutation<inferInput<Trpc["plugin"]["checkForUpdates"]>, inferOutput<Trpc["plugin"]["checkForUpdates"]>>({
  options: (trpc) => trpc.plugin.checkForUpdates.mutationOptions(),
  invalidates: () => [],
  errorToast: serverReason("Couldn't check for updates."),
});

/**
 * U8 2b — the TRUE one-click upgrade: re-fetch the plugin's REMEMBERED `sourceUrl` (re-paste-free) and upgrade in
 * place through the SAME server `upgrade` verb `useUpgradePlugin` drives — so a REACH-WIDENING update lands the
 * row `disabled` pending re-consent exactly the same way (never silent), and the caller reads the returned
 * `PluginView.status`/`reconsentPending` rather than assuming it kept running. Same invalidations as the file
 * upgrade: the new bundle can move the log, the surface set and the command set.
 */
export const useUpgradePluginFromStoredUrl = createEntityMutation<
  inferInput<Trpc["plugin"]["upgradeFromStoredUrl"]>,
  inferOutput<Trpc["plugin"]["upgradeFromStoredUrl"]>
>({
  options: (trpc) => trpc.plugin.upgradeFromStoredUrl.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.plugin.list.queryFilter(),
    trpc.plugin.getLog.queryFilter({ pluginId: vars.pluginId }),
    trpc.plugin.listSurfaces.queryFilter(),
    trpc.plugin.listCommands.queryFilter(),
    // …and the bundle-image map (#820): an upgrade REPLACES the `ui/assets/` set, so a surface still holding
    // the old map would keep resolving a path this version dropped — or miss one it added. The upgrade write
    // is its only freshness driver (no bus event exists for the plugin lifecycle).
    trpc.plugin.listBundleAssets.queryFilter(),
  ],
  errorToast: serverReason("Couldn't update that plugin."),
});

/**
 * #1740 — the SEEDED-EXAMPLE one-click: upgrade an installed showcase plugin to the copy this build SHIPS. The
 * twin of `useUpgradePluginFromStoredUrl` in every way that matters (same server `upgrade` verb underneath, so a
 * reach-widening bundle still lands the row `disabled` pending re-consent, and the caller reads the returned
 * `PluginView` rather than assuming it kept running) — only the byte source differs, which is why the
 * invalidation set is identical: a bundle swap can move the log, the surfaces, the commands and the image map
 * whichever source it came from.
 */
export const useUpgradePluginFromShowcase = createEntityMutation<
  inferInput<Trpc["plugin"]["upgradeFromShowcase"]>,
  inferOutput<Trpc["plugin"]["upgradeFromShowcase"]>
>({
  options: (trpc) => trpc.plugin.upgradeFromShowcase.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.plugin.list.queryFilter(),
    trpc.plugin.getLog.queryFilter({ pluginId: vars.pluginId }),
    trpc.plugin.listSurfaces.queryFilter(),
    trpc.plugin.listCommands.queryFilter(),
    trpc.plugin.listBundleAssets.queryFilter(),
  ],
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
  // `listSurfaces` too: enabling brings a plugin's surfaces resident (disabling drops them), and the lifecycle
  // has no bus event — this write is their freshness driver.
  invalidates: (trpc, vars) => [
    trpc.plugin.list.queryFilter(),
    trpc.plugin.getLog.queryFilter({ pluginId: vars.pluginId }),
    trpc.plugin.listSurfaces.queryFilter(),
    trpc.plugin.listCommands.queryFilter(),
  ],
  errorToast: serverReason("Couldn't change whether that plugin is on."),
});

/** Remove a plugin, its bundle asset, and its registrations. No optimistic removal — the surface puts this
 *  behind a confirm, and a failed uninstall flashing a row back is worse than the brief settle refetch. */
export const useUninstallPlugin = createEntityMutation<{ readonly pluginId: PluginId }, inferOutput<Trpc["plugin"]["uninstall"]>>({
  options: (trpc) => trpc.plugin.uninstall.mutationOptions(),
  invalidates: (trpc) => [trpc.plugin.list.queryFilter(), trpc.plugin.listSurfaces.queryFilter(), trpc.plugin.listCommands.queryFilter()],
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

/** Submit a UI-surface action. Re-enters the surface's `onAction` in the guest,
 *  which may publish new state via `host.ui.setState` — whose `pluginSurfaceStateChanged` bus poke is the
 *  cross-device freshness driver. The `invalidates` here is the SAME-TAB belt: it refetches this surface's
 *  state immediately, so the panel repaints on the round-trip without waiting for the bus round-trip. */
export const useInvokeUiAction = createEntityMutation<inferInput<Trpc["plugin"]["invokeUiAction"]>, inferOutput<Trpc["plugin"]["invokeUiAction"]>>({
  options: (trpc) => trpc.plugin.invokeUiAction.mutationOptions(),
  // The filter carries the ROOM too (row 777): a room-anchored action publishes into that room's state row, and
  // a filter that named only (pluginId, surfaceId) would refetch the plugin-wide row instead — the panel would
  // sit stale until the bus poke arrived, which is exactly the same-tab lag this belt exists to remove.
  invalidates: (trpc, vars) => [
    trpc.plugin.getSurfaceState.queryFilter({
      pluginId: vars.pluginId,
      surfaceId: vars.surfaceId,
      ...(vars.chatId === undefined ? {} : { chatId: vars.chatId }),
    }),
  ],
  errorToast: serverReason("That plugin action couldn't run."),
});

/** Report a Tier-C client-guest crash — a hung guest the host `terminate()`d, a
 *  `ui.js` that failed to boot, or a tree the client schema refused. It feeds the SAME `consecutive_crashes`
 *  3-strike policy a throwing server handler drives, so a UI half that dies every mount auto-disables like a
 *  server half that throws.
 *
 *  NO ERROR TOAST, and that is the §4.9 posture rather than an omission: a crashed surface renders NOTHING, and
 *  the person's answer to "why is my widget gone" is the Plugins pane's log, not a toast interrupting whatever
 *  they were actually doing. It invalidates `list` because the third strike flips the row to `errored` — the
 *  pane has to stop saying the plugin is enabled. */
export const useReportUiCrash = createEntityMutation<inferInput<Trpc["plugin"]["reportUiCrash"]>, inferOutput<Trpc["plugin"]["reportUiCrash"]>>({
  options: (trpc) => trpc.plugin.reportUiCrash.mutationOptions(),
  invalidates: (trpc) => [trpc.plugin.list.queryFilter()],
});

/** Run one registered plugin COMMAND — the `/plugin <slug> <name> …` dispatch and the
 *  Plugins chrome menu both land here. Reconciles the plugin's SURFACE STATE broadly rather than by key: a
 *  command is not scoped to one surface (it can publish into any of the plugin's), so the narrow
 *  `{pluginId, surfaceId}` filter an action uses would miss exactly the panel the command just updated. The
 *  caller reads the returned `PluginUiOutcome` through `mutateAsync` and hands it to `applyPluginUiOutcome`. */
export const useInvokeUiCommand = createEntityMutation<inferInput<Trpc["plugin"]["invokeUiCommand"]>, inferOutput<Trpc["plugin"]["invokeUiCommand"]>>({
  options: (trpc) => trpc.plugin.invokeUiCommand.mutationOptions(),
  invalidates: (trpc) => [trpc.plugin.getSurfaceState.queryFilter()],
  errorToast: serverReason("That plugin command couldn't run."),
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
