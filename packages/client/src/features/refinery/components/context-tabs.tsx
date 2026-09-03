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
import { Row, Stack } from "@orb/ui/layout";
import { RECEDED_INK } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useGatedQuery, useInvalidation, useTRPC } from "#data";
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
 *  to itself, so the row's `title` never repeats what's already on screen (#115's stutter rule). */
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
        <Text voice="gloss" {...(modelTitle === null ? {} : { title: modelTitle })}>
          {economicsOf(run)}
        </Text>
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
          // GHOST, and deliberately the quiet twin (side-eye 2026-08-19 P1-4). This ledger's empty state and
          // the SCORE lane's own run control offered the same act on one screen, and the filled-accent one
          // was HERE — in the pane that records what happened — while the work pane's verb sat secondary.
          // §14 is bolder in the work pane, quieter in the ledger; the canvas's one filled run control is the
          // FOCAL lane's (`workbench-lanes.ts` decides which lane that is). This stays a real door, because
          // the Runs tab can be open with the workbench scrolled past its lanes.
          // (#1256, 2026-09-02 — the #1141/#1244/#1249 fork, fifth instance): this comment block's own
          // words ("GHOST, and deliberately the quiet twin") are the recession ruling; the primitive keeps
          // inheriting since #969, so the composite states its own ink through the shared spelling.
          <Button className={RECEDED_INK} intent="ghost" onClick={onRunScore} size="sm">
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
   *  to EDIT, or `null` to author a new one; both verbs were UI-unreachable before this took a stage
   *  (live custom-schema drive, 2026-08-14 — only score authoring had a door). */
  readonly onEditSchema: (stage: RefinerySchemaStage) => void;
  /** Opens the WORKBENCH control that owns a concept this pane only reads (#171) — never an editor of this
   *  pane's own (see the door note on `SetupTab`). */
  readonly onOpenDoor: (door: RefineryWorkbenchDoor) => void;
}

/** One Setup row: the value in force, and the control that acts on it.
 *
 *  THE `note` PROP IS GONE (#171, owner: "a fucking cop out"). It printed a sentence saying where a value
 *  was edited instead — the shape P1-8's second arm asked for when the alternative was a bare row that
 *  read as unfinished. Three of six rows ended in one, and a row whose only trailing content is "go
 *  somewhere else" carries no leverage: it is the deferral rendered AS content. What replaced it is a real
 *  door (`onAction` opening the owning control on the workbench — see `SetupTab`), which satisfies both
 *  rulings: the row still does not EDIT (one home, #158), and it no longer reads as a dead readout. A row
 *  with no action at all survives only where the value has no editor anywhere in the app. */
function SetupRow({ k, v, action, onAction }: { k: string; v: string; action?: string; onAction?: () => void }): ReactElement {
  return (
    <Card>
      <Row align="center" gap="row" padding="row">
        <Stack className="min-w-0 flex-1" gap="tight">
          <Text voice="kicker">{k}</Text>
          <Text voice="label">{v}</Text>
        </Stack>
        {action !== undefined && onAction !== undefined ? (
          // THE ACCESSIBLE NAME CARRIES THE ROW (side-eye #81 P2). Three of these rows say "Change" and one
          // says "View", so a screen-reader user tabbing the Setup tab — or anyone reading a list of this
          // pane's controls out of visual context — met three identically-named buttons that open three
          // different editors. The name is DERIVED from the two strings the row already has, so a new row
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
 * The Setup readout (CONTEXT). EVERY ACTION HERE OPENS WHAT ITS LABEL SAYS — which was not true before
 * (side-eye 2026-08-09 P1-7 + P1-8): one prop opened the schema editor and the other opened the scope
 * dialog, and the four rows were wired across them almost at random. "Guidance → Edit" opened SCOPE;
 * "Stage modes → Change" opened the SCHEMA EDITOR, which cannot change a stage mode at all. The props
 * are now named for the surface they open (`onEditSchema`) so the next wiring mistake is visible at the
 * call site rather than only on screen.
 *
 * ── THE WORKBENCH/SETUP SPLIT, STATED (#158 items 1-3, owner-ruled 2026-08-17) ───────────────────────
 * One screen was rendering two independently-editable homes for the same concepts, inches apart. The
 * ruling: ONE home per concept. The line drawn here, and its side:
 *  - **SCOPE is edited in the WORKBENCH** (the masthead's strip + its Edit scope door), and this row is
 *    the READOUT. Not the other way round, which is what #158's parenthetical suggested, because the
 *    tree's evidence points the other way: the masthead's own header records the prior ruling that its
 *    strip is "the only place the session's selection is legible, and the Edit-scope door beside it is
 *    the §8 preflight warn's own remedy"; that remedy ("Narrow the selection") lives in CONTENT's lane
 *    run control and would become a cross-panel jump the shell has no verb for; and THIS pane mounted
 *    the editor with `score={null}` while CONTENT passes the real score payload — Setup's copy was the
 *    DEGRADED one. Keeping the degraded arm and deleting the rich one is the wrong direction.
 *  - **PROMPT FIT is read in the LANE**, per stage, beside the verb whose budget it is. The row that used
 *    to print `≈ N/M tok` here is gone rather than echoed: it stated the SCORE stage's input estimate
 *    only — one of six numbers `LaneRunControl` prints — so it was not a copy of the fact, it was a
 *    third of it. (It also carried a `fitWarn` half added to stop the two homes disagreeing, side-eye
 *    P2 "CONTEXT drops the ⚠"; deleting the second home closes that more completely than syncing it.)
 *  - **AUDITED AND NOT DOUBLED:** the schema rows and Stage modes. What CONTENT shows adjacent to these
 *    is a RUN's provenance — the rewrite band's `2 · Rewrite · balanced`, the Runs ledger's "custom
 *    schema" chip — i.e. what a produced payload was made with, which is a fact about history, not the
 *    config in force. Two facts that happen to share a vocabulary are not two homes.
 *
 * ── A DOOR, NOT A SENTENCE (#171, owner screenshot post-#158: "a fucking cop out") ────────────────────
 * The one-home ruling left Scope, Guidance and Stage modes as rows whose trailing content was a sentence
 * naming somewhere else ("Changed on the workbench…", "Edited in the run bar…", "Set per stage when a run
 * is configured"). Each of those rows DOES state real in-force state — that half was never the problem —
 * but the deferral was rendered as content, which is the cop-out re-derived one layer down. The rows keep
 * their readout and take the affordance the sentence was standing in for:
 *  - **Scope → "Edit"** raises the `scope` workbench door: the masthead's OWN `ScopeEditorDialog` opens
 *    (the rich one, with the score-informed hints — this pane's deleted copy passed `score={null}`). No
 *    second editor is minted here, so #158's ruling is untouched; the row is a remote control for the one
 *    home, which is exactly what the sentence was describing in prose.
 *  - **Guidance → "Edit"** raises the `guidance` door: the run bar's live textarea takes focus and scrolls
 *    into view. Same shape, same reason. Its VALUE is now "in force" / "none", not the sentence itself
 *    (side-eye 2026-08-19): quoting the text here put an authored value in two places on one screen, one
 *    of them read-only, which is precisely what the section's anti-echo law forbids. The row still states
 *    real in-force state — that half was never the problem — and the door is what makes it actionable.
 *  - **Stage modes** keeps NO action, because it has no editor anywhere in the app — and its old note was
 *    the emptiest of the three (it named no reachable place at all). It states the modes in force, which
 *    is this tab's whole charter. Building the missing control is a feature, not a polish fix, and is NOT
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
      {/* ONE ROW PER STAGE (live custom-schema drive, 2026-08-14): the single "Payload schema" row wired
          ONLY the score stage's editor, so custom-ANALYZE authoring and editing a saved analyze schema had
          no door at all. Each stage now carries its own "Change" → the editor at that stage; the body
          resolves edit-vs-author. */}
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
      {/* NOT "the LIVE card" (side-eye 2026-08-19 P3; the #104 precedent, verbatim: caps mid-sentence is
          "the one place the app raises its voice at the reader"). The contrast is real and survives in
          words — the live card against the session's pinned original — and the sentence carries it. */}
      <Text voice="gloss">Restoring changes the live card only. The session still compares against its own pinned original.</Text>
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
