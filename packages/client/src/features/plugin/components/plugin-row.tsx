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
// so granting and running stay two separate owner decisions, on purpose.
//
// RE-CONSENT IS AS GRANULAR AS INSTALL (#658). The notice used to offer exactly two outcomes — allow the
// whole ask, or remove the plugin — while INSTALL let the same person tick individual boxes. That asymmetry
// was client-only: `setGrant` has always taken an arbitrary subset and computed `pendingReconsent` honestly
// for a partial one, and the design set rules the semantic outright ("`granted_capabilities` is stored as
// the confirmed SUBSET — a paranoid owner may grant less"). So the notice renders the SAME interactive
// `PluginGrantList` arm the install card does. Two things about its default are deliberate:
//   · it starts at the PRIOR GRANT with NOTHING NEW TICKED — the inverse of install's "everything asked,
//     checked". At install the ask IS the proposal and the default is the thing being consented to; here
//     the person already made a decision, and pre-ticking the rows the system refused on their behalf would
//     hand back consent they never gave, one click after we told them we withheld it.
//   · a PARTIAL answer leaves the re-consent standing, and the surface keeps saying so — that is the
//     server's own verdict repainted (`reconsentPending`), not a client guess.
// Unticking a row that WAS granted is a real act too: this button narrows as readily as it widens.
//
// `net.fetch` NEEDS THE ACKNOWLEDGEMENT ECHO, AND THE ECHO IS ABOUT WHAT WAS RENDERED — never about what was
// ticked. Every other capability is consented to BY NAME; `net.fetch`'s reach is `netHosts`, which the owner
// never types, so a manifest that moves between the render and the click could re-arm the egress wall at a
// destination nobody saw — at the consent act itself. The caller therefore echoes the EXACT host list it
// displayed (`plugin.netHosts ?? []`) and the server refuses when a manifest host is missing from that echo.
// With interactive rows the distinction gets sharper: the echo must stay the rendered list even as the
// checkbox draft moves, and the host list must keep rendering whether or not `net.fetch` is ticked — a host
// list that appeared and vanished with a checkbox would make the echo a function of the draft, which is
// precisely the coupling the guard exists to prevent.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import type { PluginBundlePreview } from "../lib/plugin-bundle.ts";
import { PluginBundlePreviewError, readPluginBundle, toBundleBase64 } from "../lib/plugin-bundle.ts";
import { builtAgainstLine, REMOVE_PLUGIN_DESCRIPTION, statusCopy } from "../lib/plugin-copy.ts";
import { useSetPluginEnabled, useSetPluginGrant, useUninstallPlugin, useUpgradePlugin } from "../lib/plugin-mutations.ts";
import { PluginGrantList } from "./plugin-grant-list.tsx";
import { PluginLogPanel } from "./plugin-log-panel.tsx";
import { ReConsentNotice, UpdateCheckRow } from "./plugin-row-leaves.tsx";
import { PluginSurfacesPanel } from "./plugin-surfaces-panel.tsx";

/** One projected row of `plugin.list` — a private derived alias (mirrored in `plugin-row-leaves.tsx`); a
 *  1-line `inferOutput` derivation, not an exported shape a type home would own. */
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
  const enableAdmission = useRef(false);

  const status = statusCopy(plugin.status, plugin.reconsentPending);
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
    // @orb-gate-ignore caught-failure-ownership(promise:mutateAsync): useUpgradePlugin carries
    // errorToast: serverReason("Couldn't update that plugin.") — the toast is the surface. Ends if that
    // mutation drops its errorToast.
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
            disabled={setEnabled.isPending}
            onCheckedChange={onEnabledChange}
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

      {/* U8 2b — the auto update-check + one-click upgrade, ONLY for a `url`-origin install (it remembers where
          it was fetched from). A file install has no remembered source, so it keeps only the manual "Update"
          bundle upload above. The one-click upgrade rides the SAME server upgrade verb, so a reach-widening
          update lands `disabled` and the ReConsentNotice below renders — never silent. */}
      {plugin.origin === "url" ? <UpdateCheckRow plugin={plugin} /> : null}

      {/* The plugin's OWN settings surfaces (plugin-ui-plane #679 U1) — rendered inside the first-party
          labelled shell, per §4.5. Renders nothing when the plugin is disabled or ships no settings surface. */}
      <PluginSurfacesPanel grants={plugin.grantedCapabilities} pluginId={plugin.id} pluginName={plugin.name} />

      {plugin.reconsentPending ? (
        <ReConsentNotice
          allowing={setGrant.isPending}
          // THE ECHO IS THE LIST THAT WAS RENDERED, not a function of what the person ticked (file header):
          // it is read straight off the same `plugin.netHosts` the notice hands `PluginGrantList`, so the
          // server can refuse a manifest that moved under the screen. `grant` is the person's own subset.
          onAllow={(grant): void => {
            setGrant.mutate({ acknowledgedNetHosts: [...(plugin.netHosts ?? [])], grant: [...grant], pluginId: plugin.id });
          }}
          onRemove={(): void => uninstall.mutate({ pluginId: plugin.id })}
          plugin={plugin}
          removing={uninstall.isPending}
          // RESET THE DRAFT when the server's own truth moves under it — a landed partial grant, or another
          // update arriving while this notice sits open. React's sanctioned state reset; without it the
          // checkboxes would keep describing a version and a grant that no longer exist. (A stale draft can
          // only ever UNDER-grant — the server refuses anything outside the persisted manifest, and the
          // netHosts echo is re-read from the fresh row — so this is honesty, not a security control.)
          key={`${plugin.version}:${plugin.grantedCapabilities.join(",")}`}
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
