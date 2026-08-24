// plugin-row — one installed plugin: what it is, whether it is on, what it is allowed to do, its log, and
// the two lifecycle acts that are not a toggle (update the bundle, remove it).
//
// THE RE-CONSENT NOTICE IS DERIVED, NOT LOCAL STATE (#650 P1-1, corrected once the server started
// projecting it). `plugin.reconsentPending` is a DURABLE server flag — true from the moment an upgrade
// widened declared reach and forced this row `disabled`, cleared only when the owner re-consents to the
// WHOLE current ask via `setGrant`. Before this field existed, the notice lived in a local `useState` that
// died on unmount or reload — the very defect #650 was filed over ("consent you can't revisit isn't
// consent"). Deriving it from `plugin.declaredCapabilities`/`grantedCapabilities`/`netHosts` every render
// means the notice survives a reload, a re-navigation, anything short of the owner actually resolving it.
//
// THE ESCAPE IS A REAL PATH, NOT A DEAD END. `setGrant` is an EXPLICIT re-consent act — it never enables (a
// disabled plugin stays disabled) and enabling never re-grants (`setEnabled` still reads the stored grant) —
// so granting and running stay two separate owner decisions, on purpose. The notice's "Allow" button grants
// the plugin's WHOLE currently-declared ask (the same "default = everything asked, checked" posture the
// install card takes), which is what actually clears `reconsentPending`; a partial grant would leave it
// standing, honestly, because the plugin is still asking for something not yet allowed.
//
// `net.fetch` NEEDS THE ACKNOWLEDGEMENT ECHO. Every other capability is consented to BY NAME; `net.fetch`'s
// reach is `netHosts`, which the owner never types, so the caller echoes back the EXACT host list it
// rendered (`plugin.netHosts ?? []`) and the server refuses if a manifest host is missing from that echo —
// the anti-TOCTOU guard against a manifest moving under a rendered consent screen.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import type { PluginBundlePreview } from "../lib/plugin-bundle.ts";
import { PluginBundlePreviewError, readPluginBundle, toBundleBase64 } from "../lib/plugin-bundle.ts";
import { builtAgainstLine, REMOVE_PLUGIN_DESCRIPTION, reConsentLine, statusCopy } from "../lib/plugin-copy.ts";
import { useSetPluginEnabled, useSetPluginGrant, useUninstallPlugin, useUpgradePlugin } from "../lib/plugin-mutations.ts";
import { PluginGrantList } from "./plugin-grant-list.tsx";
import { PluginLogPanel } from "./plugin-log-panel.tsx";

type PluginView = inferOutput<Trpc["plugin"]["list"]>[number];

export interface PluginRowProps {
  readonly plugin: PluginView;
}

export function PluginRow({ plugin }: PluginRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetPluginEnabled({ trpc, invalidation });
  const upgrade = useUpgradePlugin({ trpc, invalidation });
  const setGrant = useSetPluginGrant({ trpc, invalidation });
  const uninstall = useUninstallPlugin({ trpc, invalidation });
  const [uploadError, setUploadError] = useState<string | null>(null);

  const status = statusCopy(plugin.status, plugin.reconsentPending);
  const provenance = builtAgainstLine(plugin.builtAgainst);

  const applyUpgrade = async (preview: PluginBundlePreview): Promise<void> => {
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
    <Stack gap="block">
      <Row align="start" gap="block" justify="between">
        <Stack className="min-w-0 flex-1" gap="tight">
          <Row align="center" gap="field">
            <Text voice="promoted">{plugin.name}</Text>
            <Badge intent={status.intent} size="sm" tone="soft">
              {status.label}
            </Badge>
          </Row>
          <Text prose={true} voice="gloss">
            Version {plugin.version}
            {provenance === null ? "" : ` · ${provenance}`}
          </Text>
          {plugin.lastError === null ? null : (
            <Text className="text-destructive" prose={true} voice="gloss">
              {plugin.lastError}
            </Text>
          )}
        </Stack>
        <Row align="center" className="shrink-0" gap="field">
          <Switch
            aria-label={`Turn ${plugin.name} on`}
            checked={plugin.status === "enabled"}
            onCheckedChange={(next): void => setEnabled.mutate({ pluginId: plugin.id, enabled: next })}
          />
          {/* Update sits IN the cluster (it is reversible-ish and the common maintenance act); Remove is
              demoted into the overflow behind the composite's ConfirmDialog, so the irreversible action
              cannot be reached by a single click beside the toggle. */}
          <FileTrigger
            accept=".zip"
            onFilesSelected={(files): void => {
              const [file] = files;
              if (file !== undefined) {
                onUpgradeFile(file);
              }
            }}
          >
            {({ open }): ReactElement => (
              <Button aria-label={`Update ${plugin.name} from a bundle`} intent="secondary" loading={upgrade.isPending} onClick={open} size="sm">
                Update
              </Button>
            )}
          </FileTrigger>
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
          />
        </Row>
      </Row>

      {uploadError === null ? null : (
        <Text className="text-destructive" prose={true} role="alert">
          {uploadError}
        </Text>
      )}

      {plugin.reconsentPending ? (
        <ReConsentNotice
          allowing={setGrant.isPending}
          onAllow={(): void => {
            setGrant.mutate({ acknowledgedNetHosts: [...(plugin.netHosts ?? [])], grant: [...plugin.declaredCapabilities], pluginId: plugin.id });
          }}
          onRemove={(): void => uninstall.mutate({ pluginId: plugin.id })}
          plugin={plugin}
          removing={uninstall.isPending}
        />
      ) : null}

      <Collapsible>
        <CollapsibleTrigger aria-label={`What ${plugin.name} is allowed to do`}>
          <Text voice="label">What it's allowed to do</Text>
        </CollapsibleTrigger>
        {/* `pe-3` clears the checkbox's own touch-target pseudo (P2-11): the panel's `overflow-hidden` is
            load-bearing for the collapse-height animation (`packages/ui/src/primitives/collapsible/
            variants.ts`), and a right-docked control's ≥44px coarse-pointer hit area (13px of the pseudo
            past the visible 18px box on each side, `--spacing-touch-target` vs `--spacing-checkbox`) bled
            past that boundary and got clipped on the side facing it — the panel's own edge, not the
            checkbox's. Scoped here rather than widened in `@orb/ui`: only a right-docked control inside a
            height-animated panel hits this, and this is the one place plugin-grant-list.tsx pairs the two. */}
        <CollapsiblePanel className="pe-3">
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
              capabilitiesLabel={`What ${plugin.name} is allowed to do`}
              declared={plugin.declaredCapabilities}
              granted={plugin.grantedCapabilities}
              netHosts={plugin.grantedCapabilities.includes("net.fetch") ? (plugin.netHosts ?? []) : []}
            />
          )}
        </CollapsiblePanel>
      </Collapsible>

      <Collapsible>
        <CollapsibleTrigger aria-label={`Recent activity for ${plugin.name}`}>
          <Text voice="label">Recent activity</Text>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <QueryBoundary
            fallback={<SkeletonRows count={2} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="this plugin's activity" onRetry={retry} />}
          >
            <PluginLogPanel name={plugin.name} pluginId={plugin.id} />
          </QueryBoundary>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}

interface ReConsentNoticeProps {
  readonly plugin: PluginView;
  /** Grants the WHOLE currently-declared ask (file header) — the only write that can clear
   *  `reconsentPending`, since a partial grant honestly leaves it standing. */
  readonly onAllow: () => void;
  /** Fires the SAME uninstall the row's overflow menu triggers — the notice's other escape action (P1-3). */
  readonly onRemove: () => void;
  readonly allowing: boolean;
  readonly removing: boolean;
}

/** The re-consent notice — what the plugin currently asks for beyond the confirmed grant, and the TWO true
 *  paths forward: allow the whole ask, or remove it. `role="alert"` because it renders whenever
 *  `plugin.reconsentPending` is true, which is a standing fact about the row, not a one-shot toast.
 *
 * THE ESCAPE ACTION LIVES INSIDE THE NOTICE (side-eye #650 P1-3), not just described in its prose and left
 * for a person to hunt down behind the row's unrelated `⋯` menu. The prior shape had every ungranted
 * capability rendered as a DISABLED CHECKBOX, which looked exactly like a control that would grant the
 * missing permission if ticked — clicking it did nothing, silently. `PluginGrantList` now renders those
 * rows as a "Not granted" statement instead of an inert control (see its own header); "Allow" is the real
 * action the statement's sentence used to only gesture at ("remove it and install the new bundle" — that
 * sentence is gone; it was never true once `setGrant` existed to close the loop directly). */
function ReConsentNotice({ plugin, onAllow, onRemove, allowing, removing }: ReConsentNoticeProps): ReactElement {
  // The delta this notice exists to explain: everything currently declared that isn't yet granted. Computed
  // from the SAME two durable fields `reconsentPending` itself is judged against, so the notice can never
  // disagree with the flag that triggered it.
  const ungranted = plugin.declaredCapabilities.filter((capability) => !plugin.grantedCapabilities.includes(capability));
  return (
    <Stack aria-label={`What ${plugin.name} asks for beyond what you've allowed`} gap="block" role="alert">
      <Text voice="promoted">{reConsentLine(ungranted)}</Text>
      <Text prose={true} voice="gloss">
        Orbweaver did not grant the extra permissions, so {plugin.name} stayed off. Allowing the whole ask below grants it — turning it back on is still a
        separate step, above — or remove it.
      </Text>
      {/* Read-only + `addedCapabilities`: the ungranted rows render as "Not granted" statements (P1-3), and
          the NEW mark on each names exactly what this notice is about. */}
      <PluginGrantList
        addedCapabilities={ungranted}
        capabilitiesLabel={`What ${plugin.name} asks for`}
        declared={plugin.declaredCapabilities}
        granted={plugin.grantedCapabilities}
        netHosts={plugin.netHosts ?? []}
        netHostsHeading="Hosts this version can reach"
      />
      <Row gap="field" justify="start">
        <Button intent="primary" loading={allowing} onClick={onAllow} size="sm">
          Allow the whole ask
        </Button>
        <ConfirmDialog
          confirmLabel="Remove plugin"
          description={REMOVE_PLUGIN_DESCRIPTION}
          onConfirm={onRemove}
          title={`Remove "${plugin.name}"?`}
          trigger={
            <Button intent="destructive" loading={removing} size="sm">
              Remove {plugin.name}
            </Button>
          }
        />
      </Row>
    </Stack>
  );
}
