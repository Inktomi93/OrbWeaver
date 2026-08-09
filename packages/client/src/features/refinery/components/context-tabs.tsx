// The refinery CONTEXT tabs — Runs · Setup · Versions (delta 2 arm A, ruled; schema-renderer §6.3/§16.3).
// CONTEXT carries the session's CROSS-RUN dimension — never the current payload (the anti-echo law):
//   · RUNS — the append-only ledger: stage pill · round · verdict chip · the economics line (model,
//     tokens, wall time — `durationMs`/`sourceRunId` are why the columns exist) + the strippedKeys warn
//     line; every row carries its ACTIONS (View · Use for apply · Judge again) — no dead readouts.
//   · SETUP — what is IN FORCE (anchor · stage modes · payload schema chip · guidance · fit) — each row
//     with its action; it links out to edit, it never becomes a second settings surface.
//   · VERSIONS — the D28 snapshot walk (§16.2): label-classified rows (Refinery / Manual / Pre-restore)
//     + Compare (DiffView vs the live card) + the existing `restore` verb (itself reversible).

import type { RefineryStage, RenderHintTone } from "@orb/contracts/refinery";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { DiffView } from "@orb/ui/diff";
import { EmptyState } from "@orb/ui/empty-state";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useGatedQuery, useInvalidation, useTRPC } from "#data";
import type { RefineryContextState } from "#lib";
import { testId } from "#lib";
import { RefineryChip } from "./refinery-chip.tsx";

type RunLedger = inferOutput<Trpc["refinery"]["listRuns"]>;
type RunView = RunLedger[number];
type SnapshotList = inferOutput<Trpc["character"]["listSnapshots"]>;

const STAGE_TONE: Record<RefineryStage, RenderHintTone> = { score: "info", rewrite: "neutral", analyze: "warn" };
const VERDICT_TONE: Record<string, RenderHintTone> = {
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire verdict member (`REFINERY_VERDICTS`, @orb/contracts/refinery) — a camelCase respell would break the lookup.
  ACCEPT: "good",
  // biome-ignore lint/style/useNamingConvention: same — the wire verdict member.
  NEEDS_REFINEMENT: "warn",
  // biome-ignore lint/style/useNamingConvention: same — the wire verdict member.
  REGRESSION: "bad",
};
const MS_PER_SECOND = 1000;

/** The §6.2 label convention's prefixes — the version walk's classifier. */
const REFINERY_SNAPSHOT_PREFIX = "auto: before refinery apply";
const PRE_RESTORE_PREFIX = "auto: before restore";

function verdictOf(run: RunView): string | null {
  if (run.stage !== "analyze") {
    return null;
  }
  const verdict = (run.payload as Record<string, unknown>)["verdict"];
  return typeof verdict === "string" ? verdict : null;
}

function economicsOf(run: RunView): string {
  if (run.model === null) {
    return "hand-authored";
  }
  const tokens = run.promptTokens === null || run.outputTokens === null ? "usage unreported" : `${run.promptTokens} in / ${run.outputTokens} out`;
  return `${run.model} · ${tokens} · ${(run.durationMs / MS_PER_SECOND).toFixed(1)}s`;
}

export interface RunsTabProps {
  readonly runs: readonly RunView[];
  readonly viewedRunId: string | null;
  readonly onView: (run: RunView) => void;
  /** Arm a rewrite run for the NEXT apply/analyze (§16.1 operate-back) — null clears back to latest. */
  readonly armedRewriteId: string | null;
  readonly onArmRewrite: (runId: string | null) => void;
  readonly onRunScore: () => void;
}

function RunRow({
  run,
  viewed,
  armed,
  onView,
  onArmRewrite,
}: {
  run: RunView;
  viewed: boolean;
  armed: boolean;
  onView: (run: RunView) => void;
  onArmRewrite: (runId: string | null) => void;
}): ReactElement {
  const verdict = verdictOf(run);
  return (
    <Card elevated={viewed}>
      <Stack gap="tight" padding="row">
        <Row align="center" gap="field">
          <RefineryChip tone={STAGE_TONE[run.stage]}>{run.stage}</RefineryChip>
          <Text voice="label">round {run.iteration}</Text>
          {verdict !== null ? <RefineryChip tone={VERDICT_TONE[verdict] ?? "neutral"}>{verdict}</RefineryChip> : null}
          {run.payloadConfig.kind === "custom" ? <RefineryChip tone="info">custom schema</RefineryChip> : null}
          {armed ? <RefineryChip tone="good">in force for apply</RefineryChip> : null}
        </Row>
        <Text voice="gloss">{economicsOf(run)}</Text>
        {run.strippedKeys.length > 0 ? (
          <Text data-testid={testId("refineryStrippedWarn")} voice="gloss">
            {run.strippedKeys.length} invented key{run.strippedKeys.length === 1 ? "" : "s"} dropped from this payload — {run.strippedKeys.join(", ")}. The
            parse kept the shape; the keys are recorded, not silently swallowed.
          </Text>
        ) : null}
        <Row gap="field">
          <Button intent="ghost" onClick={(): void => onView(run)} size="sm">
            View
          </Button>
          {run.stage === "rewrite" ? (
            <Button intent="ghost" onClick={(): void => onArmRewrite(armed ? null : run.id)} size="sm">
              {armed ? "Use latest instead" : "Use for apply"}
            </Button>
          ) : null}
        </Row>
      </Stack>
    </Card>
  );
}

export function RunsTab({ runs, viewedRunId, onView, armedRewriteId, onArmRewrite, onRunScore }: RunsTabProps): ReactElement {
  if (runs.length === 0) {
    return (
      <EmptyState
        action={
          <Button onClick={onRunScore} size="sm">
            Run score
          </Button>
        }
        description="Every stage you run is recorded here — what it cost, which model ran it, and the verdict it produced."
        title="No runs yet"
      />
    );
  }
  // Newest first — the ledger reads backward from "now" (the mock's ordering).
  const newestFirst = [...runs].reverse();
  return (
    <Stack data-testid={testId("refineryRunsTab")} gap="tight">
      {newestFirst.map((run) => (
        <RunRow armed={run.id === armedRewriteId} key={run.id} onArmRewrite={onArmRewrite} onView={onView} run={run} viewed={run.id === viewedRunId} />
      ))}
    </Stack>
  );
}

export interface SetupTabProps {
  readonly anchorLine: string;
  readonly stageModesLine: string;
  readonly schemaLine: string;
  readonly guidance: string | null;
  readonly fitLine: string | null;
  readonly onViewOriginal: () => void;
  readonly onEditConfig: () => void;
  readonly onEditGuidance: () => void;
}

function SetupRow({ k, v, action, onAction }: { k: string; v: string; action?: string; onAction?: () => void }): ReactElement {
  return (
    <Card>
      <Row align="center" gap="row" padding="row">
        <Stack className="min-w-0 flex-1" gap="tight">
          <Text voice="kicker">{k}</Text>
          <Text voice="label">{v}</Text>
        </Stack>
        {action !== undefined && onAction !== undefined ? (
          <Button intent="ghost" onClick={onAction} size="sm">
            {action}
          </Button>
        ) : null}
      </Row>
    </Card>
  );
}

export function SetupTab({
  anchorLine,
  stageModesLine,
  schemaLine,
  guidance,
  fitLine,
  onViewOriginal,
  onEditConfig,
  onEditGuidance,
}: SetupTabProps): ReactElement {
  return (
    <Stack data-testid={testId("refinerySetupTab")} gap="tight">
      <SetupRow action="View" k="Original card" onAction={onViewOriginal} v={anchorLine} />
      <SetupRow action="Change" k="Stage modes" onAction={onEditConfig} v={stageModesLine} />
      <SetupRow action="Change" k="Payload schema" onAction={onEditConfig} v={schemaLine} />
      <SetupRow
        action="Edit"
        k="Guidance"
        onAction={onEditGuidance}
        v={guidance === null || guidance.length === 0 ? "none — every stage runs unsteered" : `"${guidance}"`}
      />
      {fitLine !== null ? <SetupRow k="Prompt fit" v={fitLine} /> : null}
    </Stack>
  );
}

// ── the Versions walk ───────────────────────────────────────────────────────────────────────────────────

type SnapshotRow = SnapshotList[number];

function classOf(snapshot: SnapshotRow): { word: string; tone: RenderHintTone } {
  const label = snapshot.label ?? "";
  if (label.startsWith(REFINERY_SNAPSHOT_PREFIX)) {
    return { word: "Refinery", tone: "info" };
  }
  if (label.startsWith(PRE_RESTORE_PREFIX)) {
    return { word: "Pre-restore", tone: "warn" };
  }
  return { word: "Manual", tone: "neutral" };
}

/** The Versions empty-state's next action: mint the FIRST snapshot by hand (the same verb the History
 *  tab offers) — rides character's user-bus for the card half; the list is writer-local. */
const useSnapshotCharacterNow = createEntityMutation<{ characterId: RefineryContextState["characterId"]; label: string }, unknown>({
  options: (trpc) => trpc.character.snapshot.mutationOptions(),
  invalidates: (trpc) => [trpc.character.listSnapshots.pathFilter()],
  errorToast: "Couldn't snapshot the card.",
});

/** Restore rides character's OWN machinery: `restore` snapshots first (reversible by construction) and
 *  its `character.update` emits `charactersChanged`, which the seam routes to `trpc.character.*` — only
 *  the snapshot list itself needs the writer-local row (it gains the pre-restore row). */
const useRestoreCharacterSnapshot = createEntityMutation<{ characterId: RefineryContextState["characterId"]; snapshotId: SnapshotRow["id"] }, unknown>({
  options: (trpc) => trpc.character.restore.mutationOptions(),
  invalidates: (trpc) => [trpc.character.listSnapshots.pathFilter()],
  errorToast: "Couldn't restore that version.",
});

export function VersionsTab({ state, liveDescription }: { state: RefineryContextState; liveDescription: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const snapshots = useQuery(trpc.character.listSnapshots.queryOptions({ characterId: state.characterId }));
  const restore = useRestoreCharacterSnapshot({ trpc, invalidation });
  const [compareId, setCompareId] = useState<SnapshotRow["id"] | null>(null);
  // The LIST stays trimmed; the blob is fetched per selected snapshot (§16.2's paginate-the-list,
  // fetch-content-per-pair posture — the `getSnapshot` read).
  const comparing = useGatedQuery(compareId, (snapshotId) => trpc.character.getSnapshot.queryOptions({ characterId: state.characterId, snapshotId }));
  const snapshotNow = useSnapshotCharacterNow({ trpc, invalidation });
  const rows = snapshots.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={(): void => snapshotNow.mutate({ characterId: state.characterId, label: "manual: before refining" })} size="sm">
            Snapshot the card now
          </Button>
        }
        description="Every apply snapshots the card first, and you can snapshot by hand — versions land here as they are made."
        title="No versions yet"
      />
    );
  }
  return (
    <Stack data-testid={testId("refineryVersionsTab")} gap="tight">
      <Text voice="gloss">Restoring changes the LIVE card only — the session still compares against its own pinned original.</Text>
      {rows.map((snapshot) => {
        const klass = classOf(snapshot);
        return (
          <Card key={snapshot.id}>
            <Stack gap="tight" padding="row">
              <Row align="center" gap="field">
                <RefineryChip tone={klass.tone}>{klass.word}</RefineryChip>
                <Text className="min-w-0 flex-1 truncate" voice="gloss">
                  {snapshot.label ?? "unlabeled"}
                </Text>
              </Row>
              <Row gap="field">
                <Button intent="ghost" onClick={(): void => setCompareId(compareId === snapshot.id ? null : snapshot.id)} size="sm">
                  {compareId === snapshot.id ? "Hide compare" : "Compare"}
                </Button>
                <Button intent="ghost" onClick={(): void => restore.mutate({ characterId: state.characterId, snapshotId: snapshot.id })} size="sm">
                  Restore
                </Button>
              </Row>
              {compareId === snapshot.id ? (
                <Stack gap="tight">
                  <Text voice="kicker">description — this version vs live</Text>
                  {comparing.data === undefined ? (
                    <Text voice="gloss">Loading that version…</Text>
                  ) : (
                    <DiffView after={liveDescription} before={comparing.data.content.description ?? ""} mode="words" />
                  )}
                </Stack>
              ) : null}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
