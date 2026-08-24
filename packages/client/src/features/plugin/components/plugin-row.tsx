// plugin-row — one installed plugin: what it is, whether it is on, what it is allowed to do, its log, and
// the two lifecycle acts that are not a toggle (update the bundle, remove it).
//
// THE RE-CONSENT CASE IS THE HARD PART, and the copy here is deliberately narrower than the design's own
// words, because the mechanism is narrower. `upgrade` recomputes the grant as `normalizeGrant(newDeclared,
// priorGranted)` — the INTERSECTION (`domain/plugin/substrate/grants.ts:26-29`) — so a NEWLY-DECLARED
// capability is recorded as NOT granted, and the row lands `disabled`. `setEnabled` then activates with
// `existing.grantedCapabilities` and takes no grant argument (`verbs/set-enabled.ts:24`); there is no
// re-grant verb on the router at all. So "turn it back on to re-confirm" — which is what `upgrade.ts`'s own
// header and the parked design set both say — would be FALSE COPY on the one screen that must not lie: the
// loop fails CLOSED (the plugin never gets what nobody allowed), but re-enabling grants nothing. The banner
// therefore says what is true: the extra permissions are not granted, turning it on runs it with what you
// already allowed, and allowing more means removing and reinstalling. The gap is reported, not papered over.
//
// The DELTA the banner shows is the capability arm only, computed client-side from the SAME two inputs the
// server compares (`manifest.capabilities` from the pre-flight bundle read × the row's `grantedCapabilities`
// — `verbs/upgrade.ts:42`), so it agrees with the server's verdict by construction. The netHosts arm is NOT
// computable here: the server compares against the PRIOR MANIFEST's hosts and `PluginView` projects neither
// the declared capabilities nor `netHosts`. The new bundle's FULL host list is rendered instead — legible
// consent, honestly not a delta.

import type { PluginCapability } from "@orb/contracts/plugin";
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
import { RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import type { PluginBundlePreview } from "../lib/plugin-bundle.ts";
import { PluginBundlePreviewError, readPluginBundle, toBundleBase64 } from "../lib/plugin-bundle.ts";
import { builtAgainstLine, reConsentLine, statusCopy } from "../lib/plugin-copy.ts";
import { useSetPluginEnabled, useUninstallPlugin, useUpgradePlugin } from "../lib/plugin-mutations.ts";
import { PluginGrantList } from "./plugin-grant-list.tsx";
import { PluginLogPanel } from "./plugin-log-panel.tsx";

type PluginView = inferOutput<Trpc["plugin"]["list"]>[number];

/** What the last upgrade asked for beyond the confirmed grant — held only while the row is mounted, because
 *  nothing durable records it (see the header's projection note). */
interface WidenNotice {
  readonly capabilities: readonly PluginCapability[];
  readonly netHosts: readonly string[];
  readonly declared: readonly PluginCapability[];
}

export interface PluginRowProps {
  readonly plugin: PluginView;
}

export function PluginRow({ plugin }: PluginRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetPluginEnabled({ trpc, invalidation });
  const upgrade = useUpgradePlugin({ trpc, invalidation });
  const uninstall = useUninstallPlugin({ trpc, invalidation });
  const [widened, setWidened] = useState<WidenNotice | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const status = statusCopy(plugin.status);
  const provenance = builtAgainstLine(plugin.builtAgainst);

  const applyUpgrade = (preview: PluginBundlePreview): void => {
    // The SAME comparison the server makes (`newlyDeclaredCapabilities(manifest.capabilities,
    // existing.grantedCapabilities)`), so the notice and the server's disable decision cannot disagree.
    const granted = new Set<PluginCapability>(plugin.grantedCapabilities);
    const newCapabilities = preview.manifest.capabilities.filter((capability) => !granted.has(capability));
    upgrade.mutateAsync({ pluginId: plugin.id, bundleBase64: toBundleBase64(preview.bytes) }).then(
      (updated) => {
        // The server's own verdict is the row's `status`: a widening upgrade lands `disabled`. Only then is
        // there anything to re-consent to, so the notice keys off THAT rather than off the local delta.
        if (updated.status === "disabled" && (newCapabilities.length > 0 || (preview.manifest.netHosts ?? []).length > 0)) {
          setWidened({
            capabilities: newCapabilities,
            netHosts: preview.manifest.netHosts ?? [],
            declared: preview.manifest.capabilities,
          });
          return;
        }
        setWidened(null);
        notify.success(`${plugin.name} is now ${updated.version}.`);
      },
      () => undefined,
    );
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
          <Text voice="gloss">
            Version {plugin.version}
            {provenance === null ? "" : ` · ${provenance}`}
          </Text>
          {plugin.lastError === null ? null : (
            <Text className="text-destructive" voice="gloss">
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
              title: `Remove "${plugin.name}"?`,
              description:
                "This deletes the plugin, its private storage and anything it registered. It can't be undone — you'd install it again from its bundle.",
              confirmLabel: "Remove plugin",
              onConfirm: (): void => uninstall.mutate({ pluginId: plugin.id }),
            }}
            label={`More actions for ${plugin.name}`}
          />
        </Row>
      </Row>

      {uploadError === null ? null : (
        <Text className="text-destructive" role="alert">
          {uploadError}
        </Text>
      )}

      {widened === null ? null : <ReConsentNotice notice={widened} pluginName={plugin.name} />}

      <Collapsible>
        <CollapsibleTrigger aria-label={`What ${plugin.name} is allowed to do`}>
          <Text voice="label">What it's allowed to do</Text>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          {plugin.grantedCapabilities.length === 0 ? (
            <Text voice="gloss">Nothing. It can run its own code and reach nothing else.</Text>
          ) : (
            <PluginGrantList declared={plugin.grantedCapabilities} granted={plugin.grantedCapabilities} netHosts={[]} />
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

/** The widened-reach notice — what the update asked for beyond the confirmed grant, and the TRUE path to
 *  allowing it. `role="alert"`: it appears asynchronously after a file pick and is the whole reason the
 *  plugin stopped. */
function ReConsentNotice({ notice, pluginName }: { readonly notice: WidenNotice; readonly pluginName: string }): ReactElement {
  return (
    <Stack aria-label={`What the update to ${pluginName} asked for`} gap="block" role="alert">
      <Text voice="promoted">{reConsentLine(notice.capabilities)}</Text>
      <Text voice="gloss">
        Orbweaver did not grant the extra permissions. Turning {pluginName} back on runs it with only what you had already allowed — to allow more, remove it
        and install the new bundle.
      </Text>
      {/* The checked/unchecked state is the point: a new capability renders UNCHECKED, because that is
          literally what the server stored (`normalizeGrant` intersects the new declared set with the prior
          grant). A person can see that the thing being asked for is the thing they do not have. */}
      <PluginGrantList
        addedCapabilities={notice.capabilities}
        declared={notice.declared}
        granted={notice.declared.filter((capability) => !notice.capabilities.includes(capability))}
        netHosts={notice.netHosts}
        netHostsHeading="Hosts this version can reach"
      />
    </Stack>
  );
}
