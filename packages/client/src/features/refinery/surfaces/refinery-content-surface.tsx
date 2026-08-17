// The refinery CONTENT surface — THE WORKBENCH (program #102, the owner-picked mockup variant C,
// `reports/design/refinery-mockups/refinery-c-workbench.html`). Masthead · three lanes across the width
// (score readout · the rewrite focal island · analyze verdict) · one foot run bar. The GIT-TERMS state
// model still rides the copy, never the words: the session is a WORKSPACE (the draft state line — §20b),
// the credit line teaches the pin, runs are commits (the ledger walks them), per-block Keep/Discard stages
// hunks, apply merges, save-as-copy branches off, and a live-card change is a visible conflict block (§21).
//
// WHAT THE REBUILD REPLACED, and the finding it answers (audit #102 / issue #125): the surface rendered ONE
// stage at a time behind a stepper, in a narrow single column whose work stopped at the top ~45% of the
// canvas. The owner picked variant C, which is a genuine change to the STAGE MODEL and not a repaint — the
// whole pipeline is on the canvas at once — so:
//   • the STAGE STEPPER IS GONE. A stage switcher is meaningless when every stage is visible; what it also
//     carried is redistributed rather than dropped — the per-stage status is the lane's own payload, the
//     running hairline is in the lane band, the not-run-yet WHY is the lane's body, and clearing a
//     view-back pin (previously a side effect of pressing a stage cell) is now the explicit "Back to
//     latest" verb beside the superseded chip. Nothing the stepper did is unreachable.
//   • `effectiveStage` is gone with it, and so is every fact that was addressed THROUGH it: the §8 fit
//     line, the preflight WARN and the Run verb are per-STAGE, so they live in each lane's own run control.
//     The foot bar keeps only the session-wide acts (guidance · hand-edit · iterate · the terminal apply).
//   • the lanes tell the truth about EACH OTHER (`lib/workbench-lanes.ts`): a rewrite older than the latest
//     score, or a verdict about a rewrite the canvas is no longer showing, says so. Three payloads side by
//     side is a claim that they belong together, and that claim is sometimes false.
//
// THIS PANE OWNS ITS SCROLL (`h-full min-h-0 overflow-y-auto`) — the house requirement `databank-detail-
// surface.tsx`'s header states verbatim: the shell's CONTENT region carries NO overflow, so a surface
// without it "simply has its tail unreachable". It shipped without it once and the tail here is the
// TERMINAL ACT (live 2026-08-09: content 3 981px in a 952px box, Apply unreachable by mouse, key or script).
//
// THE NO-SELECTION ARM IS ITS OWN MODULE (`components/refinery-start-pane.tsx`): the landing joins a
// different read set than the pipeline does — the roster, for the #79 resume-or-mint decision a character
// pick resolves.

import type { RefinerySelection, RefineryStage } from "@orb/contracts/refinery";
import { isAppendedRewrite } from "@orb/contracts/refinery";
import type { RefinerySessionId } from "@orb/kit/ids";
import type { CompareDecision } from "@orb/ui/compare-blocks";
import { Container, Row, Stack, Surface } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { setRefineryViewedRun, useRefineryArmedRewriteId, useRefineryViewedRunId, useSelectedRefinerySessionId } from "#state";
import { ApplyOutcome } from "../components/apply-outcome.tsx";
import type { OutcomeState } from "../components/apply-row.tsx";
import { ApplyRow } from "../components/apply-row.tsx";
import { LaneRunControl } from "../components/lane-run-control.tsx";
import type { ManualTarget } from "../components/manual-rewrite-dialog.tsx";
import { ManualRewriteDialog } from "../components/manual-rewrite-dialog.tsx";
import { PayloadLane } from "../components/payload-lane.tsx";
import { RefineryStartPane } from "../components/refinery-start-pane.tsx";
import { RewriteLane } from "../components/rewrite-lane.tsx";
import { RunControlsCard } from "../components/run-controls-card.tsx";
import { ScopeEditorDialog } from "../components/scope-editor-dialog.tsx";
import { SessionMasthead } from "../components/session-masthead.tsx";
import { useIterateRefinery, useRunRefineryStage, useSubmitManualRewrite, useUpdateRefinerySession } from "../hooks/use-refinery-mutations.ts";
import { useRefineryPreflight } from "../hooks/use-refinery-schemas.ts";
import { useRefineryRuns, useRefinerySession } from "../hooks/use-refinery-sessions.ts";
import { reviewEntriesOf } from "../lib/review-entries.ts";
import { scorePayloadOf } from "../lib/run-views.ts";
import type { LaneView } from "../lib/workbench-lanes.ts";
import { workbenchLanesOf } from "../lib/workbench-lanes.ts";

type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];
// Re-derived locally from the wire (§7.4).
type KeptAccept = inferInput<Trpc["refinery"]["applyFields"]>["accepts"][number];
type StagePreflightView = NonNullable<ReturnType<typeof useRefineryPreflight>["data"]>["stages"][number];

export function RefineryContentSurface(): ReactElement {
  const sessionId = useSelectedRefinerySessionId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    <Container className="relative h-full min-h-0 overflow-y-auto outline-none" name="refinery-content" ref={surfaceRef} tabIndex={-1}>
      {sessionId === null ? <RefineryStartPane /> : <RefinerySessionPane key={sessionId} sessionId={sessionId} />}
    </Container>
  );
}

function RefinerySessionPane({ sessionId }: { sessionId: RefinerySessionId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const deps = { trpc, invalidation };
  const session = useRefinerySession(sessionId);
  const runs = useRefineryRuns(sessionId);
  const preflight = useRefineryPreflight(sessionId);
  // Cache-first cross-feature read (channel row 2); gated — no key is built until the session landed.
  const character = useGatedQuery(session.data?.characterId ?? null, (id) => trpc.character.get.queryOptions({ characterId: id }));

  const runStage = useRunRefineryStage(deps);
  const iterate = useIterateRefinery(deps);
  const manual = useSubmitManualRewrite(deps);
  const updateSession = useUpdateRefinerySession(deps);

  const [scopeOpen, setScopeOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeState | null>(null);
  // The run ids THIS view produced — the hero gauge's arrival signal (`useCountUp`'s `arrived`). Ids, not a
  // boolean: a lane can show an OLDER run (view-back) while a newer one landed.
  const [landedRunIds, setLandedRunIds] = useState<ReadonlySet<string>>(() => new Set());
  const noteLanded = (...ids: readonly string[]): void => setLandedRunIds((prev) => new Set([...prev, ...ids]));
  const viewedRunId = useRefineryViewedRunId();
  const armedRewriteId = useRefineryArmedRewriteId();

  const allRuns: readonly RunView[] = runs.data ?? [];
  const lanes = workbenchLanesOf(
    allRuns,
    { viewedRunId, armedRewriteId },
    { pendingStage: runStage.pendingVariables?.stage ?? null, iterating: iterate.isPending },
  );
  const { sheet, decide } = useRewriteDecisions(lanes.rewriteRunId);

  if (session.data === undefined || character.data === undefined) {
    return (
      <Stack gap="row" padding="section">
        <Text voice="gloss">Loading the session…</Text>
      </Stack>
    );
  }
  const view = session.data;
  const card = character.data;
  const running = runStage.isPending || iterate.isPending;

  const rewriteEntries = rewriteEntriesFor(lanes.rewriteRun, card, view);
  const decided = sheet ?? Array.from({ length: rewriteEntries.length }, (): CompareDecision => null);
  const keptAccepts = keptAcceptsOf(rewriteEntries, decided);
  const manualTargets = manualTargetsOf(view.selection, card);
  const backToLatest = (): void => setRefineryViewedRun(null);

  const runControlFor = (lane: LaneView): ReactElement => (
    <LaneRunControl
      busy={running}
      contextTokens={preflight.data?.contextTokens ?? null}
      hasRun={lane.run !== null}
      onRun={(): void => runStage.mutate({ sessionId, stage: lane.stage }, { onSuccess: (run): void => noteLanded(run.id) })}
      onScopeOpen={(): void => setScopeOpen(true)}
      running={lane.running}
      stage={lane.stage}
      stagePre={preflightSliceOf(preflight.data, lane.stage)}
    />
  );

  return (
    // INSTRUMENT tier (density-pass-spec.md §3.1): the workbench is a cockpit you scan — three payloads per
    // glance — so its islands resolve the dense steps and its rails are kickers + hairlines, not boxes.
    <Surface tier="instrument">
      <Stack className="px-gutter pt-block pb-gutter" data-testid={testId("refineryContent")} gap="block">
        <SessionMasthead
          anchoredAt={view.createdAt}
          applied={outcome !== null && outcome.applied.length > 0}
          cardName={card.name}
          model={lanes.rewrite.run?.model ?? lanes.score.run?.model ?? null}
          onEditScope={(): void => setScopeOpen(true)}
          round={view.iterationCount}
          selection={view.selection}
          status={view.status}
        />

        {outcome === null ? (
          // THE THREE LANES ACROSS THE WIDTH. Fixed rails either side of a fluid focal, and a container
          // query — never a viewport breakpoint — decides when the canvas can hold them: the shell's docked
          // LIST and CONTEXT panels narrow this pane independently of the window. Below `@5xl` the lanes
          // stack, which keeps every lane's full width at the phone/3-pane mount instead of crushing the
          // diff into a column no prose fits in. (Refinery's own `panelDefaults` collapse both panels — the
          // D62 content-first hub — so the three-lane arm is the default, not the lucky case.)
          <Row align="start" className="@max-5xl:flex-col @max-5xl:items-stretch" gap="block">
            <Stack className="w-full shrink-0 @5xl:w-60" gap="row">
              <PayloadLane
                arrived={lanes.score.run !== null && landedRunIds.has(lanes.score.run.id)}
                behind={lanes.score.behind}
                onBackToLatest={backToLatest}
                run={lanes.score.run}
                runControl={runControlFor(lanes.score)}
                running={lanes.score.running}
                stage="score"
                viewingBack={lanes.score.viewingBack}
              />
            </Stack>
            <Stack className="min-w-0 flex-1" gap="row">
              <RewriteLane
                behind={lanes.rewrite.behind}
                decided={decided}
                entries={rewriteEntries}
                onBackToLatest={backToLatest}
                onDecide={(index, decision): void => decide(index, decision, rewriteEntries.length)}
                run={lanes.rewriteRun}
                runControl={runControlFor(lanes.rewrite)}
                running={lanes.rewrite.running}
                viewingBack={lanes.rewrite.viewingBack}
              />
            </Stack>
            <Stack className="w-full shrink-0 @5xl:w-68" gap="row">
              <PayloadLane
                arrived={lanes.analyze.run !== null && landedRunIds.has(lanes.analyze.run.id)}
                behind={lanes.analyze.behind}
                onBackToLatest={backToLatest}
                run={lanes.analyze.run}
                runControl={runControlFor(lanes.analyze)}
                running={lanes.analyze.running}
                stage="analyze"
                viewingBack={lanes.analyze.viewingBack}
              />
            </Stack>
          </Row>
        ) : (
          <ApplyOutcome
            applied={outcome.applied}
            copyName={outcome.copyName}
            dropped={outcome.dropped}
            onDone={(): void => setOutcome(null)}
            onEditScope={(): void => {
              setOutcome(null);
              setScopeOpen(true);
            }}
            onRerunRewrite={(): void => {
              setOutcome(null);
              runStage.mutate({ sessionId, stage: "rewrite" }, { onSuccess: (run): void => noteLanded(run.id) });
            }}
            snapshotLabel={outcome.snapshotLabel}
          />
        )}

        <RunControlsCard
          apply={
            lanes.rewriteRun === null ? null : (
              <ApplyRow
                armedRewrite={lanes.armedRewrite}
                armedRewriteId={armedRewriteId}
                keptAccepts={keptAccepts}
                onOutcome={setOutcome}
                sessionId={sessionId}
              />
            )
          }
          canIterate={lanes.analyze.run !== null}
          guidance={view.guidance}
          onIterate={(): void => iterate.mutate({ sessionId }, { onSuccess: (round): void => noteLanded(round.rewrite.id, round.analyze.id) })}
          onManualOpen={(): void => setManualOpen(true)}
          running={running}
          sessionId={sessionId}
        />

        <ScopeEditorDialog
          card={card}
          onOpenChange={setScopeOpen}
          onSave={(selection): void => updateSession.mutate({ sessionId, patch: { selection } })}
          open={scopeOpen}
          score={scorePayloadOf(lanes.score.run ?? undefined) ?? null}
          selection={view.selection}
        />
        <ManualRewriteDialog
          onOpenChange={setManualOpen}
          onSubmit={(fields): void => {
            manual.mutate({ sessionId, fields: [...fields] }, { onSuccess: (): void => setManualOpen(false) });
          }}
          open={manualOpen}
          saving={manual.isPending}
          targets={manualTargets}
        />
      </Stack>
    </Surface>
  );
}

/** The per-rewrite-run decision sheet (keyed BY REWRITE RUN — a re-run reopens every block Undecided;
 *  the ruled fork: a verb pressed against old text is not a judgement about the new text). */
function useRewriteDecisions(rewriteRunId: string | null): {
  sheet: readonly CompareDecision[] | undefined;
  decide: (index: number, decision: CompareDecision, count: number) => void;
} {
  const [decidedByRun, setDecidedByRun] = useState<Readonly<Record<string, readonly CompareDecision[]>>>({});
  const sheet = rewriteRunId === null ? undefined : decidedByRun[rewriteRunId];
  const decide = (index: number, decision: CompareDecision, count: number): void => {
    if (rewriteRunId === null) {
      return;
    }
    setDecidedByRun((prev) => {
      const next = [...(prev[rewriteRunId] ?? Array.from({ length: count }, (): CompareDecision => null))];
      next[index] = decision;
      return { ...prev, [rewriteRunId]: next };
    });
  };
  return { sheet, decide };
}

/** The reviewable entries for the chosen rewrite run (empty until one settles). */
function rewriteEntriesFor(
  rewriteRun: RunView | null,
  card: Parameters<typeof reviewEntriesOf>[1],
  view: { originalCard: Parameters<typeof reviewEntriesOf>[2]; selection: RefinerySelection },
): ReturnType<typeof reviewEntriesOf> {
  if (rewriteRun === null || rewriteRun.stage !== "rewrite") {
    return [];
  }
  return reviewEntriesOf((rewriteRun.payload as { fields: never[] }).fields, card, view.originalCard, view.selection);
}

/** The preflight slice one lane reads. */
function preflightSliceOf(data: ReturnType<typeof useRefineryPreflight>["data"], stage: RefineryStage): StagePreflightView | undefined {
  return data?.stages.find((s) => s.stage === stage);
}

/** The kept accepts the terminal verbs send: each Keep press's target, with `confirmDiverged` riding
 *  exactly the diverged entries (the §21 informed re-confirmation — never a blanket flag). */
function keptAcceptsOf(rewriteEntries: ReturnType<typeof reviewEntriesOf>, decided: readonly CompareDecision[]): KeptAccept[] {
  return rewriteEntries.flatMap((entry, i): KeptAccept[] => {
    if (decided[i] !== true) {
      return [];
    }
    // An APPEND is addressed by its ordinal and NOTHING else: it has no slot to name and no history to have
    // diverged from, so sending either key would be a malformed address the verb drops.
    if (entry.appendIndex !== undefined) {
      return [{ field: entry.entry.field, appendIndex: entry.appendIndex }];
    }
    return [
      {
        field: entry.entry.field,
        ...(isAppendedRewrite(entry.entry) || entry.entry.greetingIndex === undefined ? {} : { greetingIndex: entry.entry.greetingIndex }),
        ...(entry.diverged ? { confirmDiverged: true as const } : {}),
      },
    ];
  });
}

type ManualCard = Parameters<typeof manualTextOf>[0] & { greetings: readonly { text: string }[] };

/** The hand-edit dialog's targets: exactly the SELECTION's addressable fields with their CURRENT live
 *  text (out-of-range greeting indexes are dropped — the dialog never offers a slot that cannot land). */
function manualTargetsOf(selection: RefinerySelection, card: ManualCard): ManualTarget[] {
  return selection.fields.flatMap((field): ManualTarget[] => {
    if (field === "greetings") {
      const indexes = selection.greetingIndexes ?? card.greetings.map((_, i) => i);
      return indexes.filter((i) => i < card.greetings.length).map((i) => ({ field, greetingIndex: i, text: card.greetings[i]?.text ?? "" }));
    }
    return [{ field, text: manualTextOf(card, field) }];
  });
}

function manualTextOf(
  card: {
    description: string | null;
    personality: string | null;
    scenario: string | null;
    exampleMessages: string | null;
    systemPrompt: string | null;
    postHistoryInstructions: string | null;
    creatorNotes: string | null;
    depthPrompt: { prompt: string } | null;
  },
  field: string,
): string {
  switch (field) {
    case "description":
      return card.description ?? "";
    case "personality":
      return card.personality ?? "";
    case "scenario":
      return card.scenario ?? "";
    case "exampleMessages":
      return card.exampleMessages ?? "";
    case "systemPrompt":
      return card.systemPrompt ?? "";
    case "postHistoryInstructions":
      return card.postHistoryInstructions ?? "";
    case "depthPrompt":
      return card.depthPrompt === null ? "" : card.depthPrompt.prompt;
    case "creatorNotes":
      return card.creatorNotes ?? "";
    default:
      return "";
  }
}
