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
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { QueryBoundary, RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
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

  const status = statusCopy(plugin.status, plugin.reconsentPending, plugin.grantedCapabilities.length);
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
    // THE CARD IS THE ROW'S BOUNDARY (owner rework, 2026-08-29). The installed list used to separate its
    // plugins with a Stack gap alone, and a plugin row is TALL — identity, a possible re-consent notice, the
    // plugin's own surfaces, two disclosures — so the pane read as one continuous wall with no edge saying
    // where one plugin's consent story ends and the next begins. A bordered Card per plugin is that edge;
    // the automation pane's gap-only rows stay gap-only because a rule row is four lines, not a wall.
    <Card>
      <Stack gap="block">
        {/* THE HEADER is a distinct block — identity left, lifecycle controls right — closed by a hairline
            (the Section-divider grammar), so the acts (toggle/update/remove) read as chrome OF the plugin
            rather than floating in its prose. Two reflow arms, both container-queried against the pane
            (the surface's own <Container>):
              · the name row is `flex-wrap`, so a LONG status badge ("Off — asked for more than you
                allowed") wraps onto its own line instead of overflowing the min-w-0 column and painting
                UNDER the shrink-0 controls cluster — the exact ~390px collision side-eye 2026-08-29 P2-1
                photographed (Badge is whitespace-nowrap by design; the row must be the thing that bends);
              · below @md the controls cluster drops onto its own line under the identity block, so the
                toggle/Update/⋯ never compete with the badge for one cramped line at all. */}
        <Stack className="border-border border-b pb-block" gap="tight">
          <Row align="start" className="@max-md:flex-col @max-md:items-stretch" gap="block" justify="between">
            <Stack className="min-w-0 flex-1" gap="tight">
              <Row align="center" className="flex-wrap" gap="field">
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
                // The label follows STATE: an enabled plugin's switch says what clicking DOES ("Turn … off").
                // The static "Turn … on" told a screen reader (and a driving instrument — measured, it toggled
                // a live plugin off) that the enabled plugin was off.
                aria-label={plugin.status === "enabled" ? `Turn ${plugin.name} off` : `Turn ${plugin.name} on`}
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
        </Stack>

        {uploadError === null ? null : (
          <Text className="text-destructive" prose={true} role="alert">
            {uploadError}
          </Text>
        )}

        {/* U8 2b — the auto update-check + one-click upgrade, mounted only when the SERVER says something can
          serve a newer version for this row (`updateSource`, #1740): a remembered `url` source, or the showcase
          copy this build ships for a SEEDED example. A hand-uploaded plugin is neither and keeps only the manual
          "Update" bundle upload above. The gate is the server's field and not `origin` on purpose — a seeded
          example arrives as an `upload` and is indistinguishable from a hand upload by origin alone, and the
          shipped slug set is not something this surface may re-spell. The one-click rides the SAME server
          upgrade verb either way, so a reach-widening update lands `disabled` and the ReConsentNotice below
          renders — never silent. */}
        {plugin.updateSource === null ? null : <UpdateCheckRow plugin={plugin} />}

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
                capabilitiesLabel={`What it's allowed to do — ${plugin.name}`}
                declared={plugin.declaredCapabilities}
                granted={plugin.grantedCapabilities}
                netHosts={plugin.grantedCapabilities.includes("net.fetch") ? (plugin.netHosts ?? []) : []}
              />
            )}
          </CollapsiblePanel>
        </Collapsible>

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
    </Card>
  );
}
