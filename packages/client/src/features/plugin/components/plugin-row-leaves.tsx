// plugin-row leaf components — the two sub-rows `PluginRow` composes, split out for `component-size` (the
// `plugin-leaf-nodes.tsx` precedent). Both close over their OWN mutation hooks and local UI state, so they are
// genuine leaves the parent only mounts:
//   · UpdateCheckRow — the U8 2b auto update-check + one-click "Update to X", for either update source the
//     server names on the row (`updateSource`: a remembered URL, or the showcase copy this build ships, #1740).
//   · ReConsentNotice — the #650/#658 re-consent surface a reach-widening upgrade forces (rendered by the
//     parent whenever `plugin.reconsentPending` is the server's own durable verdict).

import type { PluginCapability } from "@orb/contracts/plugin";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import {
  CHECK_FOR_UPDATES_LABEL,
  grantSummaryLine,
  REMOVE_PLUGIN_DESCRIPTION,
  reConsentLine,
  UPDATE_UNREACHABLE_LINE,
  UPDATE_UP_TO_DATE_LINE,
  updateAvailableLabel,
} from "../lib/plugin-copy.ts";
import { useCheckForUpdates, useUpgradePluginFromShowcase, useUpgradePluginFromStoredUrl } from "../lib/plugin-mutations.ts";
import { PluginGrantList } from "./plugin-grant-list.tsx";

/** One projected row of `plugin.list` — the shape both leaves read (a private derived alias, mirrored by the
 *  parent `PluginRow`; a 1-line `inferOutput` derivation, not an exported shape a type home would own). */
type PluginView = inferOutput<Trpc["plugin"]["list"]>[number];

/** The auto update-check's local verdict for ONE row (U8 2b). Local, not server state: the check writes
 *  nothing, so its result is transient UI feedback until the person acts on it (a one-click upgrade is what
 *  makes a DURABLE change, and that rides the list refetch). `idle` before the first check. */
type UpdateVerdict = { readonly kind: "idle" | "up-to-date" | "unreachable" } | { readonly kind: "available"; readonly newVersion: string };

/** The update-check + one-click upgrade affordance for a plugin SOMETHING can serve a newer version for (U8 2b —
 *  the thing ST's loader does). "Check for updates" runs the server batch check and shows this row's verdict;
 *  when a newer version is available, "Update to X" upgrades in place through the SAME server upgrade verb the
 *  file upload uses — so a reach-widening update lands the row `disabled` and the parent's ReConsentNotice
 *  renders (never silent). The verdict resets after a successful one-click: the list refetch carries the new
 *  version/consent state, which is the durable truth.
 *
 *  ONE ROW, TWO SOURCES (#1740). `plugin.updateSource` is the SERVER's answer to "who can serve the next
 *  version": `"url"` re-fetches the remembered source, `"showcase"` takes the copy this build ships (the only
 *  path a DIVERGED seeded example has — the boot auto-upgrade passes those over on purpose). The parent mounts
 *  this component only when that field is non-null, so there is no third arm here. Splitting it into two
 *  components would duplicate the verdict machine, and the verdict is the same question either way. Both hooks
 *  are called unconditionally (hooks rules) and only the one this row's source names is ever fired. */
export function UpdateCheckRow({ plugin }: { readonly plugin: PluginView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const check = useCheckForUpdates({ trpc, invalidation });
  const upgradeStored = useUpgradePluginFromStoredUrl({ trpc, invalidation });
  const upgradeShowcase = useUpgradePluginFromShowcase({ trpc, invalidation });
  const upgrade = plugin.updateSource === "showcase" ? upgradeShowcase : upgradeStored;
  const [verdict, setVerdict] = useState<UpdateVerdict>({ kind: "idle" });

  const runCheck = async (): Promise<void> => {
    // @orb-gate-ignore caught-failure-ownership(promise:mutateAsync): useCheckForUpdates carries
    // errorToast: "Couldn't check for updates." — the toast is the surface; undefined just leaves the verdict
    // as-is. Ends if that mutation drops its errorToast.
    const results = await check.mutateAsync(undefined).catch(() => undefined);
    if (results === undefined) {
      return;
    }
    const mine = results.find((result) => result.pluginId === plugin.id);
    // A plugin nothing can serve a version for (or a since-uninstalled one) is simply absent from the batch —
    // treat that like "couldn't determine". `unreachable` is the leak-free arm the server hands back for a
    // blocked/404/garbage source, and it carries no reason by design, so neither does this line. A showcase row
    // reaches it only by falling out of the batch (a slug this build stopped shipping), which is the same
    // honest "couldn't determine" — there is no fetch to have failed.
    if (mine === undefined || mine.status === "unreachable") {
      setVerdict({ kind: "unreachable" });
      return;
    }
    if (mine.status === "update-available") {
      setVerdict({ kind: "available", newVersion: mine.newVersion });
      return;
    }
    setVerdict({ kind: "up-to-date" });
  };

  const applyUpgrade = async (): Promise<void> => {
    // @orb-gate-ignore caught-failure-ownership(promise:mutateAsync): both upgrade mutations carry
    // errorToast: serverReason("Couldn't update that plugin.") — the toast is the surface. Ends if either
    // mutation drops its errorToast.
    const updated = await upgrade.mutateAsync({ pluginId: plugin.id }).catch(() => undefined);
    if (updated === undefined) {
      return;
    }
    // The durable truth is now on the refetched row (new version, and `reconsentPending` if it widened reach) —
    // drop the transient verdict. The toast reads the SERVER's own `reconsentPending`, so it can never disagree
    // with the ReConsentNotice the parent renders from the same flag.
    setVerdict({ kind: "idle" });
    if (updated.reconsentPending) {
      notify.info(`${plugin.name} stayed off — this update asks for more than you've allowed. Check below.`);
      return;
    }
    notify.success(`${plugin.name} is now ${updated.version}.`);
  };

  return (
    <Row align="center" gap="field" justify="start">
      <Button
        aria-label={`Check ${plugin.name} for updates`}
        intent="secondary"
        loading={check.isPending}
        onClick={(): void => {
          // @orb-gate-ignore caught-failure-ownership(promise:runCheck): runCheck already catches its own
          // mutation's rejection internally, so it never rejects — belt-and-suspenders. Ends if runCheck stops
          // catching internally.
          void runCheck().catch(() => undefined);
        }}
        size="sm"
      >
        {CHECK_FOR_UPDATES_LABEL}
      </Button>
      {verdict.kind === "available" ? (
        <Button
          aria-label={`Update ${plugin.name} to ${verdict.newVersion}`}
          intent="primary"
          loading={upgrade.isPending}
          onClick={(): void => {
            // @orb-gate-ignore caught-failure-ownership(promise:applyUpgrade): applyUpgrade already
            // catches its own mutation's rejection internally, so it never rejects — belt-and-suspenders. Ends
            // if applyUpgrade stops catching internally.
            void applyUpgrade().catch(() => undefined);
          }}
          size="sm"
        >
          {updateAvailableLabel(verdict.newVersion)}
        </Button>
      ) : null}
      {verdict.kind === "up-to-date" ? (
        <Text prose={true} voice="gloss">
          {UPDATE_UP_TO_DATE_LINE}
        </Text>
      ) : null}
      {verdict.kind === "unreachable" ? (
        <Text prose={true} voice="gloss">
          {UPDATE_UNREACHABLE_LINE}
        </Text>
      ) : null}
    </Row>
  );
}

interface ReConsentNoticeProps {
  readonly plugin: PluginView;
  /** Writes the person's own confirmed SUBSET — which may be narrower than the ask, and may even be
   *  narrower than the prior grant. Clears `reconsentPending` only when it covers the whole ask; the
   *  caller supplies the anti-TOCTOU host echo, which is about what was RENDERED, not what was ticked. */
  readonly onAllow: (grant: readonly PluginCapability[]) => void;
  /** Fires the SAME uninstall the row's overflow menu triggers — the notice's other escape action (P1-3). */
  readonly onRemove: () => void;
  readonly allowing: boolean;
  readonly removing: boolean;
}

/** The re-consent notice — what the plugin asks for beyond the confirmed grant, and the paths forward:
 *  allow whatever subset of it you choose, or remove the plugin. `role="alert"` because it renders whenever
 *  `plugin.reconsentPending` is true, which is a standing fact about the row, not a one-shot toast.
 *
 * THE ESCAPE ACTION LIVES INSIDE THE NOTICE (side-eye #650 P1-3), not just described in its prose and left
 * for a person to hunt down behind the row's unrelated `⋯` menu. Two shapes were wrong here before, and the
 * second is why this component now owns draft state:
 *   1. every ungranted capability rendered as a DISABLED CHECKBOX — a control that looked live and silently
 *      did nothing on click, beside a sentence saying the plugin wanted exactly that permission;
 *   2. then a READ-ONLY list with one all-or-nothing button — honest, but it made the obvious next action
 *      ("tick the one I'm willing to allow") impossible on a surface where install has always allowed it.
 * The rows are now REALLY interactive (the same arm the install card uses), which is the only correct answer
 * to (1): the fix for a control that looks tickable and isn't is a control that IS, not a quieter statement.
 * The read-only "Not granted" arm still exists and is still right — for the DURABLE disclosure below, which
 * reports a settled fact rather than asking a question. */
export function ReConsentNotice({ plugin, onAllow, onRemove, allowing, removing }: ReConsentNoticeProps): ReactElement {
  // The delta this notice exists to explain: everything currently declared that isn't yet granted. Computed
  // from the SAME two durable fields `reconsentPending` itself is judged against, so the notice can never
  // disagree with the flag that triggered it. Note it is derived from the SERVER's grant, not the draft —
  // the "New" marks name what this update is asking for and must not flicker off as boxes are ticked.
  const ungranted = plugin.declaredCapabilities.filter((capability) => !plugin.grantedCapabilities.includes(capability));
  // The draft starts at what the owner already allowed — nothing new pre-ticked (file header). Reset from
  // the server's truth by the `key` at the call site, so this initializer runs again whenever the row's
  // version or stored grant moves.
  const [draft, setDraft] = useState<readonly PluginCapability[]>(() => [...plugin.grantedCapabilities]);
  const onToggle = (capability: PluginCapability, next: boolean): void => {
    setDraft((current) => (next ? [...current, capability] : current.filter((c) => c !== capability)));
  };
  const summary = grantSummaryLine(draft);
  return (
    // THE WARNING-CALLOUT SKIN (owner rework 2026-08-29 — "no hierarchy"): this block is the one thing on
    // the row that NEEDS the owner, and it used to render as more of the same prose wall. It is set apart by
    // a LEADING ACCENT RULE (the list-row ember-bar / rpg-hud-rail kicker grammar — `border-l-2` +
    // `ps-block`), NOT a full bordered box. The full `/40` warning border shipped by the rework nested a
    // second box INSIDE the plugin's own Card border, and nested borders read cheap — tightest at ~390px,
    // where the two edges sit a handful of px apart (side-eye 2026-08-29 residual P3). A left rule carries
    // the same "attend to this" boundary with one edge, not two — at SOLID `border-l-warning`, not the box's
    // `/40`, because a single 2px edge needs the full-weight amber to register where a four-side box could
    // whisper (the ember-bar precedent is `border-l-primary` at full opacity for exactly this reason).
    // STILL NO FILL, and that arm is measured, not taste: a `bg-warning/10` tint under this block composited
    // the badge pills' own translucent tints over an amber-lifted ground and dropped them under AA
    // (design-audit on the staged sha: "New" 4.44:1, "Reaches further" 4.19:1, 54×P1 — the
    // alpha-token-composited class), and recoloring a paragraph of consent copy amber would spend the
    // prose's contrast the same way. So a border-only leading rule is the zero-contrast-tax boundary: it
    // paints no ground behind the pills at all. The ruling survives ("state it apart with a warning edge,
    // never a fill"); its INPUT changed from a full box to a leading rule.
    <Stack aria-label={`What ${plugin.name} asks for beyond what you've allowed`} className="border-l-2 border-l-warning ps-block" gap="block" role="alert">
      <Text className="max-w-(--reading-measure-prose)" voice="promoted">
        {reConsentLine(ungranted, plugin.widenedNetHosts)}
      </Text>
      {/* The measure caps the body + headline (side-eye 2026-08-29 residual P2): at pane width the consent
          copy ran edge-to-edge near ~90ch, past the comfortable line length. THE TOKEN, NOT `max-w-prose`
          (#1175) — 65 CSS `ch` is 93-101 typographic characters in Geist, so the utility never met the 65-75
          band; `--reading-measure-prose` (47ch) is the derived one (#1145) and rides the PARAGRAPH, since a
          `ch` resolves in the element's own font. The per-capability consequence lines are capped at their
          own home (plugin-grant-list.tsx). */}
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        Orbweaver did not grant the extra permissions, so {plugin.name} stayed off. Tick what you're willing to allow and confirm below — turning it back on is
        still a separate step, above — or remove it.
      </Text>
      {/* The INTERACTIVE arm (`onToggle`), defaulting to the prior grant. `addedCapabilities` and
          `addedNetHosts` mark what this update added — the capability half derived from the two projected
          grant fields, the host half taken VERBATIM from the server's recorded delta (a client cannot
          compute it; see plugin-grant-list.tsx's header). `netHosts` is passed ungated on purpose: this
          screen is asking about reach, including reach that is not granted yet. */}
      <PluginGrantList
        addedCapabilities={ungranted}
        addedNetHosts={plugin.widenedNetHosts}
        capabilitiesLabel={`What ${plugin.name} asks for`}
        declared={plugin.declaredCapabilities}
        granted={draft}
        netHosts={plugin.netHosts ?? []}
        netHostsHeading="Hosts this version can reach"
        onToggle={onToggle}
      />
      {/* The same roll-up the install card carries at its decision point: at a large ask the per-row marks
          are what to READ and this is what travels with the click. `null` at an empty selection. */}
      {summary === null ? null : <Text voice="label">{summary}</Text>}
      <Row gap="field" justify="start">
        <Button intent="primary" loading={allowing} onClick={(): void => onAllow(draft)} size="sm">
          Allow selected
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
