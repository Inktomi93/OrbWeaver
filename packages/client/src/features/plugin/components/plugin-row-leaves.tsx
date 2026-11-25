// plugin-row leaf components — the two sub-rows `PluginRow` composes, apart from it (the
// `plugin-leaf-nodes.tsx` precedent). Both close over their OWN mutation hooks and local UI state, so they are
// genuine leaves the parent only mounts:
//   · UpdateCheckRow — the U8 2b auto update-check + update, for the source the server names on the row
//     (`updateSource`: remembered bundle URL, remembered Git repository, or shipped showcase copy). A stored URL
//     or Git update shows its review before it applies.
//   · ReConsentNotice — the #650/#658 re-consent surface a reach-widening upgrade forces (rendered by the
//     parent whenever `plugin.reconsentPending` is the server's own durable verdict).

import type { PluginCapability } from "@orb/contracts/plugin";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { DestructiveAction } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { rethrowUnlessTrpcFailure } from "#lib";
import {
  APPLY_UPDATE_LABEL,
  approveLabel,
  CHECK_FOR_UPDATES_LABEL,
  consentAskKind,
  firstConsentLine,
  grantSummaryLine,
  pluginApplyUpdateLabel,
  pluginCheckForUpdatesLabel,
  pluginUpdateFromCommitLabel,
  pluginUpdateReviewLabel,
  pluginUpdateToLabel,
  REMOVE_PLUGIN_DESCRIPTION,
  reConsentLine,
  STORED_UPDATE_NOTHING_NEW,
  storedUpdateChangeLines,
  storedUpdateHeading,
  UPDATE_REVIEW_DISMISS_LABEL,
  UPDATE_UNREACHABLE_LINE,
  UPDATE_UP_TO_DATE_LINE,
  updateAvailableLabel,
  updateCommitAvailableLabel,
} from "../lib/plugin-copy.ts";
import { useUpgradePluginFromStoredGit } from "../lib/plugin-distribution-mutations.ts";
import { useCheckForUpdates, usePreviewStoredUpgrade, useUpgradePluginFromShowcase, useUpgradePluginFromStoredUrl } from "../lib/plugin-mutations.ts";
import { notifyUpgradeStayedOff } from "../lib/plugin-upgrade-notice.ts";
import { PluginGrantList } from "./plugin-grant-list.tsx";

/** One projected row of `plugin.list` — the shape both leaves read (a private derived alias, mirrored by the
 *  parent `PluginRow`; a 1-line `inferOutput` derivation, not an exported shape a type home would own). */
type PluginView = inferOutput<Trpc["plugin"]["list"]>[number];
type AvailableUpdate = Extract<inferOutput<Trpc["plugin"]["checkForUpdates"]>[number], { readonly status: "update-available" | "source-changed" }>;
type StoredUpdatePreview = inferOutput<Trpc["plugin"]["previewStoredUpgrade"]>;

/** The auto update-check's local verdict for ONE row (U8 2b). Local, not server state: the check writes
 *  nothing, so its result is transient UI feedback until the person acts on it (an applied upgrade is what
 *  makes a DURABLE change, and that rides the list refetch). `idle` before the first check. `review` holds a
 *  stored URL or Git source's preview: the owner reads what the next version changes before it applies. */
export type UpdateVerdict =
  | { readonly kind: "idle" | "up-to-date" | "unreachable" }
  | {
      readonly kind: "available";
      readonly label: string;
      readonly ariaLabel: string;
      readonly proof: AvailableUpdate;
    }
  | { readonly kind: "review"; readonly preview: StoredUpdatePreview };

/** The update-check + upgrade affordance for a plugin SOMETHING can serve a newer version for (U8 2b —
 *  the thing ST's loader does). "Check for updates" runs the server batch check and shows this row's verdict;
 *  when a newer version is available, "Update to X" first shows a stored URL or Git source's review (what the
 *  next version widens), and "Apply update" then upgrades in place through the SAME server upgrade verb the
 *  file upload uses — so a reach-widening update lands the row `disabled` and the parent's ReConsentNotice
 *  renders (never silent). A shipped showcase copy applies on the first press. The verdict resets after a
 *  successful upgrade: the list refetch carries the new version/consent state, which is the durable truth.
 *
 *  ONE ROW, THREE SOURCES (#1740/#0081). `plugin.updateSource` is the SERVER's answer to "who can serve the
 *  next version": `"url"` re-fetches the remembered bundle, `"git"` clones the remembered repository, and
 *  `"showcase"` takes the copy this build ships (the only path a DIVERGED seeded example has — the boot
 *  auto-upgrade passes those over on purpose). The parent mounts this component only when that field is
 *  non-null. Splitting it by source would duplicate the verdict machine; all hooks are unconditional and only
 *  the mutation named by the row fires. */
export function UpdateCheckRow({ plugin }: { readonly plugin: PluginView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const check = useCheckForUpdates({ trpc, invalidation });
  const upgradeStored = useUpgradePluginFromStoredUrl({ trpc, invalidation });
  const upgradeShowcase = useUpgradePluginFromShowcase({ trpc, invalidation });
  const upgradeGit = useUpgradePluginFromStoredGit({ trpc, invalidation });
  const previewStored = usePreviewStoredUpgrade({ trpc, invalidation });
  const [verdict, setVerdict] = useState<UpdateVerdict>({ kind: "idle" });
  const applying = upgradeStored.isPending || upgradeShowcase.isPending || upgradeGit.isPending;
  // The Update press unmounts as the review opens, and the review unmounts as Not now or Apply closes it, so focus is
  // handed on: the review takes it on open (a screen reader lands on the group's name), the check takes it back on close.
  const checkRef = useRef<HTMLButtonElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const wasReviewing = useRef(false);
  const reviewing = verdict.kind === "review";
  useEffect(() => {
    if (reviewing) {
      reviewRef.current?.focus();
    } else if (wasReviewing.current) {
      checkRef.current?.focus();
    }
    wasReviewing.current = reviewing;
  }, [reviewing]);

  const runCheck = async (): Promise<void> => {
    // useCheckForUpdates (lib/plugin-mutations.ts) carries
    // errorToast serverReason("Couldn't check for updates."); undefined just leaves the verdict as-is.
    // Ends if that mutation drops its errorToast.
    const results = await check.mutateAsync(undefined).catch(rethrowUnlessTrpcFailure);
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
      setVerdict({
        kind: "available",
        label: updateAvailableLabel(mine.newVersion),
        ariaLabel: pluginUpdateToLabel(plugin.name, mine.newVersion),
        proof: mine,
      });
      return;
    }
    if (mine.status === "source-changed") {
      setVerdict({
        kind: "available",
        label: updateCommitAvailableLabel(mine.sourceCommit),
        ariaLabel: pluginUpdateFromCommitLabel(plugin.name, mine.sourceCommit),
        proof: mine,
      });
      return;
    }
    setVerdict({ kind: "up-to-date" });
  };

  // A stored URL or Git source is reviewed first: the preview fetches the next version and the apply echoes its
  // identity, so the bytes that land are the bytes the owner read. A shipped showcase copy is first-party and
  // applies in one press.
  const reviewUpgrade = async (): Promise<void> => {
    // usePreviewStoredUpgrade (lib/plugin-mutations.ts) carries an errorToast; undefined leaves the verdict as-is.
    // Ends if that mutation drops its errorToast.
    const preview = await previewStored.mutateAsync({ pluginId: plugin.id }).catch(rethrowUnlessTrpcFailure);
    if (preview !== undefined) {
      setVerdict({ kind: "review", preview });
    }
  };

  const applyUpgrade = async (): Promise<void> => {
    let pending: Promise<PluginView>;
    if (verdict.kind === "review") {
      const { identity } = verdict.preview;
      pending =
        identity.source === "git"
          ? upgradeGit.mutateAsync({ pluginId: plugin.id, expectedCommit: identity.sourceCommit })
          : upgradeStored.mutateAsync({ pluginId: plugin.id, expectedBundleHash: identity.bundleHash });
    } else if (plugin.updateSource === "showcase") {
      pending = upgradeShowcase.mutateAsync({ pluginId: plugin.id });
    } else {
      return;
    }
    // `pending` is useUpgradePluginFromStoredGit (lib/plugin-distribution-mutations.ts),
    // useUpgradePluginFromShowcase or useUpgradePluginFromStoredUrl (lib/plugin-mutations.ts); each carries an errorToast.
    // Ends if any of them drops it.
    const updated = await pending.catch(rethrowUnlessTrpcFailure);
    if (updated === undefined) {
      return;
    }
    // The durable truth is now on the refetched row (new version, and `reconsentPending` if it widened reach) —
    // drop the transient verdict. The notice reads the SERVER's own `reconsentPending`, so it can never disagree
    // with the ReConsentNotice the parent renders from the same flag.
    setVerdict({ kind: "idle" });
    notifyUpgradeStayedOff(plugin.name, updated);
  };

  return (
    <Stack gap="field">
      <Row align="center" wrap={true} gap="field" justify="start">
        <Button
          aria-label={pluginCheckForUpdatesLabel(plugin.name)}
          variant="outline"
          loading={check.isPending}
          ref={checkRef}
          onClick={(): void => {
            // runCheck already catches its own
            // mutation's rejection internally, so it never rejects — belt-and-suspenders. Ends if runCheck stops
            // catching internally.
            void runCheck().catch(rethrowUnlessTrpcFailure);
          }}
          size="sm"
          wrap={true}
        >
          {CHECK_FOR_UPDATES_LABEL}
        </Button>
        {verdict.kind === "available" ? (
          <Button
            aria-label={verdict.ariaLabel}
            cap="fit"
            loading={applying || previewStored.isPending}
            onClick={(): void => {
              // reviewUpgrade and applyUpgrade already catch their own mutation's rejection internally, so
              // neither rejects. Ends if either stops catching internally.
              void (plugin.updateSource === "showcase" ? applyUpgrade() : reviewUpgrade()).catch(rethrowUnlessTrpcFailure);
            }}
            size="sm"
            wrap={true}
          >
            {verdict.label}
          </Button>
        ) : null}
        {verdict.kind === "up-to-date" ? (
          <Text cap="prose" prose={true} voice="gloss">
            {UPDATE_UP_TO_DATE_LINE}
          </Text>
        ) : null}
        {verdict.kind === "unreachable" ? (
          <Text cap="prose" prose={true} voice="gloss">
            {UPDATE_UNREACHABLE_LINE}
          </Text>
        ) : null}
      </Row>
      {verdict.kind === "review" ? (
        <StoredUpdateReview
          applying={applying}
          onApply={(): void => {
            // applyUpgrade catches its own mutation's rejection internally. Ends if it stops catching.
            void applyUpgrade().catch(rethrowUnlessTrpcFailure);
          }}
          onDismiss={(): void => setVerdict({ kind: "idle" })}
          pluginName={plugin.name}
          preview={verdict.preview}
          ref={reviewRef}
        />
      ) : null}
    </Stack>
  );
}

interface StoredUpdateReviewProps {
  readonly preview: StoredUpdatePreview;
  readonly pluginName: string;
  readonly applying: boolean;
  readonly onApply: () => void;
  readonly onDismiss: () => void;
  readonly ref: RefObject<HTMLDivElement | null>;
}

/** What the next version from a stored source changes, read before it applies. The lines are the reach it widens
 *  beyond the owner's consent plus the browser-script fact; the apply echoes the preview's identity. */
function StoredUpdateReview({ preview, pluginName, applying, onApply, onDismiss, ref }: StoredUpdateReviewProps): ReactElement {
  const lines = storedUpdateChangeLines(preview);
  return (
    // Focusable by script, not a tab stop: the group's name is what a screen reader reads when the review opens.
    <Stack aria-label={pluginUpdateReviewLabel(pluginName)} focusTarget={true} gap="field" ref={ref} role="group" tabIndex={-1}>
      <Text voice="promoted">{storedUpdateHeading(preview.fromVersion, preview.toVersion)}</Text>
      {lines.length === 0 ? (
        <Text cap="prose" prose={true} voice="gloss">
          {STORED_UPDATE_NOTHING_NEW}
        </Text>
      ) : (
        <Stack gap="tight">
          {lines.map((line) => (
            <Text cap="prose" key={line} prose={true}>
              {line}
            </Text>
          ))}
        </Stack>
      )}
      <Row wrap={true} gap="field" justify="start">
        <Button aria-label={pluginApplyUpdateLabel(pluginName)} loading={applying} onClick={onApply} size="sm" variant="outline" wrap={true}>
          {APPLY_UPDATE_LABEL}
        </Button>
        <Button onClick={onDismiss} size="sm" variant="ghost" wrap={true}>
          {UPDATE_REVIEW_DISMISS_LABEL}
        </Button>
      </Row>
    </Stack>
  );
}

interface ReConsentNoticeProps {
  readonly plugin: PluginView;
  /** #1855: approve-all/deny — always grants the full declared set. The caller supplies the anti-TOCTOU
   *  host echo, which is about what was RENDERED. */
  readonly onAllow: (grant: readonly PluginCapability[]) => void;
  /** Fires the SAME uninstall the row's overflow menu triggers — the notice's other escape action (P1-3).
   *  MAY return a promise (#1563b, widened #1632): it reaches `ConfirmDialog.onConfirm`, which awaits it and
   *  holds the confirm open as the retry surface on rejection. `() => void` accepted an async handler
   *  anyway, so the declared type said the opposite of what the confirm does with the value. */
  readonly onRemove: () => void | Promise<void>;
  readonly allowing: boolean;
  readonly removing: boolean;
}

/** The re-consent notice — what the plugin asks for beyond the confirmed grant, and the paths forward:
 *  approve all or remove the plugin. `role="alert"` because it renders whenever `plugin.reconsentPending`
 *  is true, which is a standing fact about the row, not a one-shot toast.
 *
 * THE ESCAPE ACTION LIVES INSIDE THE NOTICE (side-eye #650 P1-3), not just described in its prose and left
 * for a person to hunt down behind the row's unrelated `⋯` menu.
 *
 * #1855 (owner ruling): APPROVE-ALL / DENY replaces per-grant toggles. The list is now READ-ONLY, showing
 * what the plugin asks for and what is new in this update. The person can approve the whole manifest set or
 * remove the plugin. Per-capability cherry-picking was removed because unchecking capabilities rarely leaves
 * a working plugin, and the cognitive load of per-capability decisions on a security surface is higher than
 * the benefit of partial grants. The read-only "Not granted" arm still exists for the DURABLE disclosure
 * below, which reports a settled fact rather than asking a question. */
export function ReConsentNotice({ plugin, onAllow, onRemove, allowing, removing }: ReConsentNoticeProps): ReactElement {
  // The delta this notice exists to explain: everything currently declared that isn't yet granted. Computed
  // from the SAME two durable fields `reconsentPending` itself is judged against, so the notice can never
  // disagree with the flag that triggered it.
  const ungranted = plugin.declaredCapabilities.filter((capability) => !plugin.grantedCapabilities.includes(capability));
  // #1855: approve-all/deny — the grant summary always shows the full declared set.
  const summary = grantSummaryLine(plugin.declaredCapabilities);
  // A never-approved plugin is asking for the first time, so it is not "an update".
  const firstAsk = consentAskKind(plugin) === "first";
  // No capability is "New" relative to a grant that was never given. The host marks always pass through: the
  // server records them only when an update widened reach, so they are empty on a genuine first ask.
  const newCapabilities = plugin.grantedCapabilities.length === 0 ? [] : ungranted;
  return (
    // THE WARNING-CALLOUT SKIN (owner rework 2026-08-29 — "no hierarchy"): this block is the one thing on
    // the row that NEEDS the owner, and it used to render as more of the same prose wall. It is set apart by
    // a LEADING ACCENT RULE (the list-row ember-bar / rpg-hud-rail kicker grammar — `divider="start"` and
    // `indent`), NOT a full bordered box. The full `/40` warning border shipped by the rework nested a
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
    <Stack
      aria-label={`What ${plugin.name} asks for beyond what you've allowed`}
      indent={true}
      divider="start"
      dividerWeight="rule"
      gap="block"
      role="alert"
      tone="warning"
    >
      <Text cap="prose" voice="promoted">
        {firstAsk
          ? firstConsentLine(plugin.name, plugin.declaredCapabilities.length)
          : reConsentLine(ungranted, {
              netHosts: plugin.widenedNetHosts,
              providerIds: plugin.widenedProviderIds,
              matchAutomationEvents: plugin.widenedMatchAutomationEvents,
            })}
      </Text>
      {/* The measure caps the body + headline (side-eye 2026-08-29 residual P2): at pane width the consent
          copy ran edge-to-edge near ~90ch, past the comfortable line length. THE TOKEN, NOT `max-w-(--reading-measure-min)`
          (#1175) — 65 CSS `ch` is 93-101 typographic characters in Geist, so the utility never met the 65-75
          band; `--reading-measure-prose` (47ch) is the derived one (#1145) and rides the PARAGRAPH, since a
          `ch` resolves in the element's own font. The per-capability consequence lines are capped at their
          own home (plugin-grant-list.tsx). */}
      <Text cap="prose" prose={true} voice="gloss">
        {firstAsk
          ? `Review what it asks for below. Approving turns ${plugin.name} on; you can turn it off at any time.`
          : `Orbweaver kept ${plugin.name} off until you approve what it asks for. Review it below and approve, or remove the plugin. Approving turns ${plugin.name} on; you can turn it off at any time.`}
      </Text>
      {/* #1855: READ-ONLY arm — approve-all/deny replaces per-grant toggles. `addedCapabilities` and
          `addedNetHosts` mark what this update added — the capability half derived from the two projected
          grant fields, the host half taken VERBATIM from the server's recorded delta (a client cannot
          compute it; see plugin-grant-list.tsx's header). `netHosts` is passed ungated on purpose: this
          screen is showing reach, including reach that is not granted yet. */}
      <PluginGrantList
        roleScope={{ kind: "plugin", pluginId: plugin.id }}
        addedCapabilities={newCapabilities}
        addedNetHosts={plugin.widenedNetHosts}
        addedProviderIds={plugin.widenedProviderIds}
        capabilitiesLabel={`What ${plugin.name} asks for`}
        declared={plugin.declaredCapabilities}
        granted={plugin.grantedCapabilities}
        matchAutomationEvents={plugin.matchAutomationEvents}
        matchAutomationEventsAdded={plugin.widenedMatchAutomationEvents}
        netHosts={plugin.netHosts ?? []}
        netHostsHeading="Hosts this version can reach"
        providers={plugin.providers}
      />
      {/* The roll-up line at the decision point (#1855: always the full declared set). */}
      {summary === null ? null : <Text voice="label">{summary}</Text>}
      <Row wrap={true} gap="field" justify="start">
        {/* THE ACTION NAMES ITS PLUGIN: several of these notices can share a screen, and an unnamed
            "Approve all" is how one plugin's permissions were granted to another. */}
        <Button variant="outline" loading={allowing} onClick={(): void => onAllow(plugin.declaredCapabilities)} size="sm">
          {approveLabel(plugin.name, plugin.declaredCapabilities.length)}
        </Button>
        <DestructiveAction
          confirm={{ confirmLabel: "Remove plugin", description: REMOVE_PLUGIN_DESCRIPTION, title: `Remove "${plugin.name}"?` }}
          onConfirm={onRemove}
          trigger={
            // Removal stays quieter than approval without adding another page-level primary.
            <Button variant="ghost" loading={removing} size="sm">
              Remove {plugin.name}
            </Button>
          }
        />
      </Row>
    </Stack>
  );
}
