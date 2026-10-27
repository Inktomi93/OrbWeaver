// The refinery CONTEXT tabs — Runs · Setup · Versions (delta 2 arm A, ruled).
// CONTEXT carries the session's CROSS-RUN dimension — never the current payload (the anti-echo law):
//   · RUNS — the append-only ledger: stage pill · round · verdict chip · the economics line (model,
//     tokens, wall time — `durationMs`/`sourceRunId` are why the columns exist) + the strippedKeys warn
//     line; every row carries its ACTIONS (View · Use for apply · Judge again) — no dead readouts.
//   · SETUP — what is IN FORCE (anchor · stage modes · payload schemas · scope · guidance) — each row
//     with its action; it links out to edit, it never becomes a second settings surface.
//   · VERSIONS — the D28 snapshot walk: label-classified rows (Refinery / Manual / Pre-restore)
//     + Compare (DiffView vs the live card) + the existing `restore` verb (itself reversible).

import type { RefinerySchemaStage, RefineryStage, RenderHintTone } from "@orb/contracts/refinery";
import { modelDisplayName } from "@orb/kit/model-name";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { DiffView } from "@orb/ui/diff";
import { EmptyState } from "@orb/ui/empty-state";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, QueryErrorState, SkeletonRows, useGatedQuery, useInvalidation, useTRPC } from "#data";
import type { RefineryContextState } from "#lib";
import { testId } from "#lib";
import type { RefineryWorkbenchDoor } from "#state";
import { RefineryChip } from "./refinery-chip.tsx";

type RunLedger = inferOutput<Trpc["refinery"]["listRuns"]>;
type RunView = RunLedger[number];
type SnapshotList = inferOutput<Trpc["character"]["listSnapshots"]>;

const STAGE_TONE: Record<RefineryStage, RenderHintTone> = { score: "info", rewrite: "neutral", analyze: "warn" };
const VERDICT_TONE: Record<string, RenderHintTone> = {
  ACCEPT: "good",
  NEEDS_REFINEMENT: "warn",
  REGRESSION: "bad",
};
const MS_PER_SECOND = 1000;

/** The label convention's prefixes — the version walk's classifier. */
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
  return `${modelDisplayName(run.model)} · ${tokens} · ${(run.durationMs / MS_PER_SECOND).toFixed(1)}s`;
}

/** The full model identifier, when the readable derivation changed it — `null` when a hosted id derives
 *  to itself, so the hint never repeats what's already on screen. */
function economicsModelTitle(run: RunView): string | null {
  if (run.model === null || modelDisplayName(run.model) === run.model) {
    return null;
  }
  return run.model;
}

export interface RunsTabProps {
  readonly runs: readonly RunView[];
  readonly viewedRunId: string | null;
  readonly onView: (run: RunView) => void;
  /** Arm a rewrite run for the NEXT apply/analyze (operate-back) — null clears back to latest. */
  readonly armedRewriteId: string | null;
  readonly onArmRewrite: (runId: string | null) => void;
  readonly onGoToScore: () => void;
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
  const modelTitle = economicsModelTitle(run);
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
        <Row align="center" gap="field">
          <Text voice="gloss">{economicsOf(run)}</Text>
          {modelTitle === null ? null : <HintTrigger className="" hint={modelTitle} subject="the model" />}
        </Row>
        {run.strippedKeys.length > 0 ? (
          <Text data-testid={testId("refineryStrippedWarn")} voice="gloss">
            {run.strippedKeys.length} invented key{run.strippedKeys.length === 1 ? "" : "s"} dropped from this payload — {run.strippedKeys.join(", ")}. The
            parse kept the shape; the keys are recorded, not silently swallowed.
          </Text>
        ) : null}
        <Row className="flex-wrap" gap="field">
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

export function RunsTab({ runs, viewedRunId, onView, armedRewriteId, onArmRewrite, onGoToScore }: RunsTabProps): ReactElement {
  if (runs.length === 0) {
    return (
      <EmptyState
        action={
          // The ledger recovers the owning run control even when the workbench has scrolled past it.
          <Button intent="ghost" onClick={onGoToScore} size="sm" tone="muted">
            Go to Score
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
  /** The SCORE stage's payload schema, named — the custom row's name, or the fixed-built-in readout. */
  readonly scoreSchemaLine: string;
  /** The ANALYZE stage's payload schema, named — same convention as `scoreSchemaLine`. */
  readonly analyzeSchemaLine: string;
  readonly scopeLine: string;
  /** WHETHER guidance is in force — never the guidance TEXT (the anti-echo split; see `guidanceLineOf`
   *  in the body module, and the `Guidance → Edit` bullet below). A `string | null` here is what let the
   *  verbatim sentence be printed beside the textarea that owns it. */
  readonly guidanceLine: string;
  readonly onViewOriginal: () => void;
  /** Opens the SCHEMA EDITOR for a specific STAGE (score / analyze) — see the door note on `SetupTab`. The
   *  BODY resolves whether that stage is currently on a custom schema and hands the editor the existing row
   *  to EDIT, or `null` to author a new one, so both stages' schemas have a door. */
  readonly onEditSchema: (stage: RefinerySchemaStage) => void;
  /** Opens the WORKBENCH control that owns a concept this pane only reads — never an editor of this
   *  pane's own (see the door note on `SetupTab`). */
  readonly onOpenDoor: (door: RefineryWorkbenchDoor) => void;
}

/** One Setup row: the value in force, and the control that acts on it.
 *
 *  NO "EDITED ELSEWHERE" SENTENCE (the owner: "a fucking cop out"). A row whose only trailing content is "go
 *  somewhere else" carries no leverage: it is the deferral rendered AS content. The row carries a real door
 *  (`onAction` opening the owning control on the workbench — see `SetupTab`), so it still does not EDIT
 *  (one home) and it never reads as a dead readout. A row
 *  with no action at all survives only where the value has no editor anywhere in the app. */
function SetupRow({ k, v, action, onAction }: { k: string; v: string; action?: string; onAction?: () => void }): ReactElement {
  return (
    <Card>
      <Row align="center" gap="row" padding="row">
        <Stack className="flex-1 min-inline-0" gap="tight">
          <Text voice="kicker">{k}</Text>
          <Text voice="label">{v}</Text>
        </Stack>
        {action !== undefined && onAction !== undefined ? (
          // THE ACCESSIBLE NAME CARRIES THE ROW. Several of these rows say "Change", so without the row a
          // screen-reader user tabbing the Setup tab — or anyone reading a list of this pane's controls out of
          // visual context — would meet identically-named buttons that open different editors. The name is DERIVED from the two strings the row already has, so a new row
          // cannot ship an ambiguous one, and it CONTAINS the visible label (WCAG 2.5.3 label-in-name: the
          // accessible name must start with what the control visibly says, or voice control cannot hit it).
          <Button aria-label={`${action} ${k}`} intent="ghost" onClick={onAction} size="sm">
            {action}
          </Button>
        ) : null}
      </Row>
    </Card>
  );
}

/**
 * The Setup readout (CONTEXT). EVERY ACTION HERE OPENS WHAT ITS LABEL SAYS. The props are named for the
 * surface they open (`onEditSchema`) so a wiring mistake is visible at the call site rather than only on
 * screen.
 *
 * ── THE WORKBENCH/SETUP SPLIT, STATED (an owner ruling) ─────────────────────────────────────────────────
 * ONE home per concept, never two independently-editable homes on one screen. The line drawn here, and its
 * side:
 *  - **SCOPE is edited in the WORKBENCH** (the masthead's strip + its Edit scope door), and this row is
 *    the READOUT, because the masthead's own header records the ruling that its strip is "the only place the session's selection is legible, and the Edit-scope door beside it is
 *    the §8 preflight warn's own remedy"; that remedy ("Narrow the selection") lives in CONTENT's lane
 *    run control and would become a cross-panel jump the shell has no verb for; and CONTENT passes the
 *    real score payload to the editor, which this pane cannot.
 *  - **PROMPT FIT is read in the LANE**, per stage, beside the verb whose budget it is. A `≈ N/M tok` row
 *    here would state one of the numbers `LaneRunControl` prints, a fraction of the fact, and a second home
 *    that has to be kept from disagreeing.
 *  - **AUDITED AND NOT DOUBLED:** the schema rows and Stage modes. What CONTENT shows adjacent to these
 *    is a RUN's provenance — the rewrite band's `2 · Rewrite · balanced`, the Runs ledger's "custom
 *    schema" chip — i.e. what a produced payload was made with, which is a fact about history, not the
 *    config in force. Two facts that happen to share a vocabulary are not two homes.
 *
 * ── A DOOR, NOT A SENTENCE (the owner: "a fucking cop out") ───────────────────────────────────────────
 * Scope, Guidance and Stage modes each state real in-force state, and a trailing sentence naming somewhere
 * else ("Changed on the workbench…") would render the deferral as content. The rows keep their readout and
 * take the affordance such a sentence would stand in for:
 *  - **Scope → "Edit"** raises the `scope` workbench door: the masthead's OWN `ScopeEditorDialog` opens
 *    (the rich one, with the score-informed hints). No second editor is minted here, so the one-home ruling
 *    holds; the row is a remote control for the one home.
 *  - **Guidance → "Edit"** raises the `guidance` door: the run bar's live textarea takes focus and scrolls
 *    into view. Same shape, same reason. Its VALUE is "in force" / "none", not the text itself: quoting the text here would put an authored value
 *    in two places on one screen, one of them read-only, which the section's anti-echo law forbids.
 *  - **Stage modes** keeps NO action, because it has no editor anywhere in the app. It states the modes in
 *    force, which is this tab's whole charter. Building the missing control is a feature, not a polish fix, and is NOT
 *    smuggled in here.
 */
export function SetupTab({
  anchorLine,
  stageModesLine,
  scoreSchemaLine,
  analyzeSchemaLine,
  scopeLine,
  guidanceLine,
  onViewOriginal,
  onEditSchema,
  onOpenDoor,
}: SetupTabProps): ReactElement {
  return (
    <Stack data-testid={testId("refinerySetupTab")} gap="tight">
      <SetupRow action="View" k="Original card" onAction={onViewOriginal} v={anchorLine} />
      <SetupRow action="Edit" k="Scope" onAction={(): void => onOpenDoor("scope")} v={scopeLine} />
      {/* ONE ROW PER STAGE, so custom-ANALYZE authoring and editing a saved analyze schema have a door as score
          does. Each stage carries its own "Change" → the editor at that stage; the body resolves
          edit-vs-author. */}
      <SetupRow action="Change" k="Score schema" onAction={(): void => onEditSchema("score")} v={scoreSchemaLine} />
      <SetupRow action="Change" k="Analyze schema" onAction={(): void => onEditSchema("analyze")} v={analyzeSchemaLine} />
      <SetupRow k="Stage modes" v={stageModesLine} />
      <SetupRow action="Edit" k="Guidance" onAction={(): void => onOpenDoor("guidance")} v={guidanceLine} />
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

/** Placeholder rows while the snapshot walk lands — enough to hold the tab's height without asserting a
 *  population. */
const SNAPSHOT_PENDING_ROWS = 3;

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
  // The LIST stays trimmed; the blob is fetched per selected snapshot (the paginate-the-list,
  // fetch-content-per-pair posture — the `getSnapshot` read).
  const comparing = useGatedQuery(compareId, (snapshotId) => trpc.character.getSnapshot.queryOptions({ characterId: state.characterId, snapshotId }));
  const snapshotNow = useSnapshotCharacterNow({ trpc, invalidation });
  // "NO VERSIONS YET" IS A CLAIM ABOUT THE SNAPSHOT LOG. `snapshots.data ?? []` would collapse three states
  // into that one sentence — and its empty state offers to MINT the first snapshot, so a reader whose list
  // merely failed to load would be invited to write a version of a card that already has a dozen.
  if (snapshots.isError) {
    return <QueryErrorState label="this card's versions" onRetry={(): void => void snapshots.refetch().catch(globalThis.reportError)} />;
  }
  if (snapshots.isPending) {
    return <SkeletonRows count={SNAPSHOT_PENDING_ROWS} shape="line" />;
  }
  const rows = snapshots.data;
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
      {/* NOT "the LIVE card" (caps mid-sentence is "the one place the app raises its voice at the reader"). The contrast is real and survives in
          words — the live card against the session's pinned original — and the sentence carries it. */}
      <Text voice="gloss">Restoring changes the live card only. The session still compares against its own pinned original.</Text>
      {rows.map((snapshot) => {
        const klass = classOf(snapshot);
        return (
          <Card key={snapshot.id}>
            <Stack gap="tight" padding="row">
              <Row align="center" gap="field">
                <RefineryChip tone={klass.tone}>{klass.word}</RefineryChip>
                <Text className="flex-1 truncate min-inline-0" voice="gloss">
                  {snapshot.label ?? "unlabeled"}
                </Text>
              </Row>
              <Row className="flex-wrap" gap="field">
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
