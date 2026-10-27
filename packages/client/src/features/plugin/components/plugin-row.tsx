// One installed plugin's consent boundary, settings and management controls.
// Pending consent stays visible; approval echoes the displayed host list and retains the server's enable verdict.

import { pluginGrantTasks } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { CopyButton } from "@orb/ui/copy-button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Row, Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { QueryBoundary, RowActionsMenu, SettingSwitchRow } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { installedPluginControlId } from "#state";
import { usePluginChatVisibility } from "../hooks/use-plugin-chat-visibility.ts";
import type { PluginBundlePreview } from "../lib/plugin-bundle.ts";
import { PluginBundlePreviewError, readPluginBundle, toBundleBase64 } from "../lib/plugin-bundle.ts";
import {
  builtAgainstLine,
  PLUGIN_DETAILS_LABEL,
  PLUGIN_ERROR_COPY_SUBJECT,
  PLUGIN_ERROR_SENTENCE,
  pluginDetailsLabel,
  REMOVE_PLUGIN_DESCRIPTION,
  showInChatLabel,
  statusCopy,
} from "../lib/plugin-copy.ts";
import { PLUGIN_MODEL_HEADING } from "../lib/plugin-model-copy.ts";
import { useSetPluginEnabled, useSetPluginGrant, useUninstallPlugin, useUpgradePlugin } from "../lib/plugin-mutations.ts";
import { PluginGrantList } from "./plugin-grant-list.tsx";
import { PluginLogPanel } from "./plugin-log-panel.tsx";
import { PluginModelBindings } from "./plugin-model-bindings.tsx";
import { ReConsentNotice, UpdateCheckRow } from "./plugin-row-leaves.tsx";
import { PluginSurfacesPanel } from "./plugin-surfaces-panel.tsx";

/** One projected row of `plugin.list` — a private derived alias (mirrored in `plugin-row-leaves.tsx`); a
 *  1-line `inferOutput` derivation, not an exported shape a type home would own. */
type PluginView = inferOutput<Trpc["plugin"]["list"]>[number];

export interface PluginRowProps {
  readonly plugin: PluginView;
  /** Fires once the owner's approval has landed and the plugin is on — the host that reviews in place uses it
   *  to open what the plugin just added. */
  readonly onApproved?: () => void;
}

/** The Plugins pane's switch for one plugin's chat panels. The switch governs chat panels, so only a plugin that
 *  registered one has anything for it to govern. */
function ShowInChatSwitch({ pluginId, pluginName }: { readonly pluginId: PluginId; readonly pluginName: string }): ReactElement | null {
  const trpc = useTRPC();
  const chatVisibility = usePluginChatVisibility();
  const { data: surfaces } = useQuery(trpc.plugin.listSurfaces.queryOptions());
  const hasChatPanel = (surfaces ?? []).some(
    (surface) => surface.pluginId === pluginId && (surface.anchor === "chat-flank" || surface.anchor === "chat-settings-section"),
  );
  if (!hasChatPanel) {
    return null;
  }
  return (
    <SettingSwitchRow
      checked={!chatVisibility.isHidden(pluginId)}
      label={showInChatLabel(pluginName)}
      onChange={(shown): void => chatVisibility.setShown(pluginId, shown)}
    />
  );
}

export function PluginRow({ plugin, onApproved }: PluginRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetPluginEnabled({ trpc, invalidation });
  const upgrade = useUpgradePlugin({ trpc, invalidation });
  const setGrant = useSetPluginGrant({ trpc, invalidation });
  const uninstall = useUninstallPlugin({ trpc, invalidation });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const enableAdmission = useRef(false);

  const status = statusCopy(plugin);
  const grantTasks = pluginGrantTasks(plugin.declaredCapabilities);
  const provenance = builtAgainstLine(plugin.builtAgainst);

  const onEnabledChange = (next: boolean): void => {
    if (enableAdmission.current) {
      return;
    }
    enableAdmission.current = true;
    setEnabled.mutate(
      { pluginId: plugin.id, enabled: next },
      {
        onSettled: (): void => {
          enableAdmission.current = false;
        },
      },
    );
  };

  const applyUpgrade = async (preview: PluginBundlePreview): Promise<void> => {
    // useUpgradePlugin (lib/plugin-mutations.ts) carries
    // errorToast serverReason("Couldn't update that plugin."); undefined ends this handler. Ends if it drops its errorToast.
    const updated = await upgrade.mutateAsync({ pluginId: plugin.id, bundleBase64: toBundleBase64(preview.bytes) }).catch(() => undefined);
    if (updated === undefined) {
      return;
    }
    // The server's own verdict, not a client-computed guess: `reconsentPending` is exactly the durable
    // flag the notice below renders from, so the toast and the notice can never disagree.
    if (updated.reconsentPending) {
      notify.info(`${plugin.name} stayed off — this update asks for more than you've allowed. Check below.`);
      return;
    }
    notify.success(`${plugin.name} is now ${updated.version}.`);
  };

  const onUpgradeFile = (file: File): void => {
    setUploadError(null);
    readPluginBundle(file).then(applyUpgrade, (error: unknown) => {
      setUploadError(error instanceof PluginBundlePreviewError ? error.message : "That file couldn't be read as a plugin bundle.");
    });
  };

  return (
    // The bordered install boundary separates each plugin's consent story from its neighbors.
    <Card aria-label={`${plugin.name} plugin`} id={installedPluginControlId(plugin.id)} role="group" tabIndex={-1}>
      <Stack gap="block">
        {/* THE HEADER is a distinct block — identity left, lifecycle controls right — closed by a hairline
            (the Section-divider grammar), so the acts (toggle/update/remove) read as chrome OF the plugin
            rather than floating in its prose. Two reflow arms, both container-queried against the pane
            (the surface's own <Container>):
              · the name row is `flex-wrap`, so a LONG status badge ("Off — asked for more than you
                allowed") wraps onto its own line instead of overflowing the min-w-0 column and painting
                UNDER the shrink-0 controls cluster — the exact ~390px collision side-eye 2026-08-29 P2-1
                photographed (Badge is whitespace-nowrap by design; the row must be the thing that bends);
              · below @cq-28 the controls cluster drops onto its own line under the identity block, so the
                toggle/Update/⋯ never compete with the badge for one cramped line at all. */}
        <Stack className="pbe-block" divider="bottom" gap="tight">
          <Row align="start" className="@max-cq-28:flex-col @max-cq-28:items-stretch" gap="block" justify="between">
            <Stack className="flex-1 min-inline-0" gap="tight">
              <Row align="center" className="flex-wrap" gap="field">
                <Text voice="promoted">{plugin.name}</Text>
                <Badge intent={status.intent} size="sm" tone="soft">
                  {status.label}
                </Badge>
              </Row>
              {/* What the plugin is for, from its own manifest: the person approving needs it before the ask. */}
              <Text className="max-inline-(--reading-measure-prose)" prose={true}>
                {plugin.description}
              </Text>
              <Text prose={true} voice="gloss">
                Version {plugin.version}
                {provenance === null ? "" : ` · ${provenance}`}
              </Text>
              {plugin.lastError === null ? null : (
                // The raw error is developer text; the card says it plainly and keeps the detail one press away.
                <Row align="center" className="flex-wrap" gap="field">
                  <Text tone="destructive" className="max-inline-(--reading-measure-prose)" prose={true} voice="gloss">
                    {PLUGIN_ERROR_SENTENCE}
                  </Text>
                  <CopyButton text={plugin.lastError} what={PLUGIN_ERROR_COPY_SUBJECT} />
                </Row>
              )}
            </Stack>
            <Row align="center" className="shrink-0" gap="field">
              <Switch
                // The label follows STATE: an enabled plugin's switch says what clicking DOES ("Turn … off").
                // The static "Turn … on" told a screen reader (and a driving instrument — measured, it toggled
                // a live plugin off) that the enabled plugin was off.
                aria-label={plugin.status === "enabled" ? `Turn ${plugin.name} off` : `Turn ${plugin.name} on`}
                checked={plugin.status === "enabled"}
                disabled={setEnabled.isPending}
                onCheckedChange={onEnabledChange}
              />
              {/* The bundle upload and Remove both live in the overflow, so the cluster holds one update door
                  ("Check for updates" below, where the source can serve one) and the irreversible act cannot be
                  reached by a single click beside the toggle. The FileTrigger wraps the menu so its input stays
                  mounted after the menu closes. */}
              <FileTrigger
                accept=".zip"
                disabled={upgrade.isPending}
                onFilesSelected={(files): void => {
                  const [file] = files;
                  if (file !== undefined) {
                    onUpgradeFile(file);
                  }
                }}
              >
                {({ open }): ReactElement => (
                  <RowActionsMenu
                    destructive={{
                      // Every OTHER string on this feature says "Remove" (the row's own confirm button, the
                      // re-consent notice's escape action below); this menu item defaulted to "Delete" and was the
                      // one place a person read a different verb for the same act (side-eye P2-7).
                      confirmLabel: "Remove plugin",
                      description: REMOVE_PLUGIN_DESCRIPTION,
                      label: "Remove",
                      onConfirm: (): void => uninstall.mutate({ pluginId: plugin.id }),
                      title: `Remove "${plugin.name}"?`,
                    }}
                    label={`More actions for ${plugin.name}`}
                  >
                    <MenuItem disabled={upgrade.isPending} onClick={open}>
                      Install a bundle from a file…
                    </MenuItem>
                  </RowActionsMenu>
                )}
              </FileTrigger>
            </Row>
          </Row>
        </Stack>

        {/* Per user and in every room: the plugin's chat panels show by default and are hidden from the panel itself. */}
        <ShowInChatSwitch pluginId={plugin.id} pluginName={plugin.name} />

        {upgrade.isPending ? (
          <Text prose={true} role="status" voice="gloss">
            Installing the new bundle…
          </Text>
        ) : null}

        {uploadError === null ? null : (
          <Text tone="destructive" prose={true} role="alert">
            {uploadError}
          </Text>
        )}

        {/* The plugin's OWN settings surfaces — rendered inside the first-party
          labelled shell, per §4.5. Renders nothing when the plugin is disabled or ships no settings surface. */}
        <PluginSurfacesPanel grants={plugin.grantedCapabilities} pluginId={plugin.id} pluginName={plugin.name} />

        {plugin.reconsentPending ? (
          <ReConsentNotice
            allowing={setGrant.isPending}
            // Echo the displayed hosts independently of the approved capability list.
            onAllow={(grant): void => {
              setGrant.mutate(
                { acknowledgedNetHosts: [...(plugin.netHosts ?? [])], enable: true, grant: [...grant], pluginId: plugin.id },
                {
                  // The server's settled row says whether it started; a failed start shows its own error line.
                  onSuccess: (view): void => {
                    if (view.status === "enabled") {
                      notify.success(`${plugin.name} is on.`);
                      onApproved?.();
                    }
                  },
                },
              );
            }}
            onRemove={(): void => uninstall.mutate({ pluginId: plugin.id })}
            plugin={plugin}
            removing={uninstall.isPending}
            key={`${plugin.version}:${plugin.grantedCapabilities.join(",")}`}
          />
        ) : null}

        <Collapsible>
          <CollapsibleTrigger aria-label={pluginDetailsLabel(plugin.name)} size="control">
            <Text voice="label">{PLUGIN_DETAILS_LABEL}</Text>
          </CollapsibleTrigger>
          <CollapsiblePanel keepMounted={true} holds="controls">
            <Stack gap="field">
              {plugin.updateSource === null ? null : <UpdateCheckRow plugin={plugin} />}
              {/* While the ask above is showing, the same permission list is not drawn a second time; once the
            plugin is settled this disclosure is the one home for it. */}
              {plugin.reconsentPending ? null : (
                <Collapsible>
                  {/* `size="control"` — the disclosure IS a row of its own (the automation rule-row precedent, minted
            for the identical defect): it shipped `inline` at ~746×16 with `::after` resolving `content:
            none`, below WCAG 2.5.8's 24px floor on ANY pointer (side-eye 2026-08-29 P2-3). The `control`
            arm pins the pointer-conditional `--spacing-control-sm` floor (44px coarse / 32px fine).
            The aria-label CONTAINS the visible words (WCAG 2.5.3 label-in-name, side-eye P3-4): the old
            "What ${name} is allowed to do" re-ordered them, so a voice-control user saying the words on
            the screen could not match the control. The plugin name still disambiguates — after the em
            dash, outside the visible phrase. */}
                  <CollapsibleTrigger aria-label={`What it's allowed to do — ${plugin.name}`} size="control">
                    <Text voice="label">What it's allowed to do</Text>
                  </CollapsibleTrigger>
                  {/* `ps-block` clears the checkbox's touch-target pseudo on the side it now docks (P2-11's rule, side
            flipped by the grant-list rework): the panel's `overflow-hidden` is load-bearing for the
            collapse-height animation (`packages/ui/src/primitives/collapsible/variants.ts`), and a LEADING
            control's ≥44px coarse-pointer hit area (13px of pseudo past the visible 18px box each side,
            `--spacing-touch-target` vs `--spacing-checkbox`) bleeds past the panel's START edge now that the
            checkbox leads the row. The old `pe-3` cleared the END edge for the right-docked column that no
            longer exists. Scoped here rather than widened in `@orb/ui`: only a panel-adjacent docked control
            inside a height-animated panel hits this, and this is the one place that pairs the two. */}
                  <CollapsiblePanel className="ps-block">
                    {plugin.declaredCapabilities.length === 0 ? (
                      <Text prose={true} voice="gloss">
                        Nothing. It can run its own code and reach nothing else.
                      </Text>
                    ) : (
                      // `declared` is the FULL current ask (#650 P1-2) — a plugin an owner granted only a paranoid
                      // subset of now shows the ungranted rows too ("Not granted" statements, plugin-grant-list.tsx),
                      // which is the whole point of the asked-vs-allowed pair: this disclosure used to be able to show
                      // only the allowed half, which cannot say "this plugin asks for X and you allowed Y".
                      //
                      // The `netHosts` prop is GATED ON `net.fetch` BEING GRANTED, not merely declared — this
                      // disclosure's copy is "what it's allowed to do" (past tense, confirmed), and "the exact hosts it
                      // can reach" is a false claim for a paranoid owner who declined `net.fetch` itself: the plugin
                      // cannot reach ANY of those hosts without the capability, so the sentence must not appear at all.
                      <PluginGrantList
                        roleScope={{ kind: "plugin", pluginId: plugin.id }}
                        capabilitiesLabel={`What it's allowed to do — ${plugin.name}`}
                        declared={plugin.declaredCapabilities}
                        granted={plugin.grantedCapabilities}
                        netHosts={plugin.grantedCapabilities.includes("net.fetch") ? (plugin.netHosts ?? []) : []}
                      />
                    )}
                  </CollapsiblePanel>
                </Collapsible>
              )}

              {/* The plugin's OWN model per spend task it declares — only those tasks, only the installer's own
            connections. A plugin that routes nothing through its grant has no row here at all. */}
              {grantTasks.length === 0 ? null : (
                <Collapsible>
                  <CollapsibleTrigger aria-label={`${PLUGIN_MODEL_HEADING} — ${plugin.name}`} size="control">
                    <Text voice="label">{PLUGIN_MODEL_HEADING}</Text>
                  </CollapsibleTrigger>
                  <CollapsiblePanel>
                    <QueryBoundary
                      fallback={<SkeletonRows count={grantTasks.length} shape="line" />}
                      renderError={(_error, retry): ReactElement => <QueryErrorState label="this plugin's model" onRetry={retry} />}
                      reserveKey="plugin.row.model"
                    >
                      <PluginModelBindings pluginId={plugin.id} pluginName={plugin.name} tasks={grantTasks} />
                    </QueryBoundary>
                  </CollapsiblePanel>
                </Collapsible>
              )}

              <Collapsible>
                {/* "Recent activity for ${name}" already CONTAINS its visible words (2.5.3 containment — the
            rule-row precedent's own phrasing); only the size arm was missing here. */}
                <CollapsibleTrigger aria-label={`Recent activity for ${plugin.name}`} size="control">
                  <Text voice="label">Recent activity</Text>
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <QueryBoundary
                    fallback={<SkeletonRows count={2} shape="line" />}
                    renderError={(_error, retry): ReactElement => <QueryErrorState label="this plugin's activity" onRetry={retry} />}
                    reserveKey="plugin.row.activity"
                  >
                    <PluginLogPanel name={plugin.name} pluginId={plugin.id} />
                  </QueryBoundary>
                </CollapsiblePanel>
              </Collapsible>
            </Stack>
          </CollapsiblePanel>
        </Collapsible>
      </Stack>
    </Card>
  );
}
