// The refinery CONTENT surface (R3 — the D62 anatomy: stepper · scope strip · stage pane · run bar,
// rendered into the founding-member section). The GIT-TERMS state model rides the copy, never the words:
// the session is a WORKSPACE (the draft state line — §20b), the anchor line teaches the pin, runs are
// commits (the ledger walks them), per-block Keep/Discard stages hunks, apply merges, save-as-copy
// branches off, and a live-card change is a visible conflict block (§21).
//
// The pane never goes blank between stages (the surface mock's drawing call): each stage pane renders
// the LATEST SETTLED payload of that stage — or the view-back run the ledger pinned — with the running
// state carried on the stepper cell.
//
// THIS PANE OWNS ITS SCROLL (`h-full min-h-0 overflow-y-auto`) — the house requirement `databank-detail-
// surface.tsx`'s header states verbatim: the shell's CONTENT region carries NO overflow, so a surface
// without it "simply has its tail unreachable". It shipped without it and the tail here is the TERMINAL ACT
// — live 2026-08-09 on a settled score+rewrite: content 3 981px in a 952px box, NO scrollable ancestor,
// `scrollIntoView` a no-op, so Apply/Save-as-copy/run bar/Hand-edit were unreachable by mouse, key or
// script. Invisible to every prior review: engines were adopt-only, and with no payload the pane fits.

import type { RefinerySelection, RefineryStage } from "@orb/contracts/refinery";
import { isAppendedRewrite } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import type { CompareDecision } from "@orb/ui/compare-blocks";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { selectRefinerySession, setRefineryViewedRun, useRefineryArmedRewriteId, useRefineryViewedRunId, useSelectedRefinerySessionId } from "#state";
import { ApplyOutcome } from "../components/apply-outcome.tsx";
import type { OutcomeState } from "../components/apply-row.tsx";
import { ApplyRow } from "../components/apply-row.tsx";
import type { ManualTarget } from "../components/manual-rewrite-dialog.tsx";
import { ManualRewriteDialog } from "../components/manual-rewrite-dialog.tsx";
import { RefineryChip } from "../components/refinery-chip.tsx";
import { RunControlsCard } from "../components/run-controls-card.tsx";
import { ScopeEditorDialog } from "../components/scope-editor-dialog.tsx";
import { StagePane } from "../components/stage-pane.tsx";
import type { StageCell } from "../components/stage-stepper.tsx";
import { StageStepper } from "../components/stage-stepper.tsx";
import { TeachingState } from "../components/teaching-state.tsx";
import {
  useIterateRefinery,
  useRunRefineryStage,
  useStartRefinerySession,
  useSubmitManualRewrite,
  useUpdateRefinerySession,
} from "../hooks/use-refinery-mutations.ts";
import { useRefineryPreflight } from "../hooks/use-refinery-schemas.ts";
import { useRefineryRuns, useRefinerySession } from "../hooks/use-refinery-sessions.ts";
import { scopeChipLabelOf } from "../lib/render-plan.ts";
import { reviewEntriesOf } from "../lib/review-entries.ts";
import { scorePayloadOf, statusLineOf } from "../lib/run-views.ts";

type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];

export function RefineryContentSurface(): ReactElement {
  const sessionId = useSelectedRefinerySessionId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    <Container className="h-full min-h-0 overflow-y-auto outline-none" name="refinery-content" ref={surfaceRef} tabIndex={-1}>
      {sessionId === null ? <RefineryStartPane /> : <RefinerySessionPane key={sessionId} sessionId={sessionId} />}
    </Container>
  );
}

function RefineryStartPane(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const start = useStartRefinerySession({ trpc, invalidation });
  return (
    <TeachingState
      onStart={(characterId: CharacterId): void => {
        start.mutate({ characterId }, { onSuccess: (session): void => selectRefinerySession(castId<RefinerySessionId>(session.id)) });
      }}
      starting={start.isPending}
    />
  );
}

/** The stepper's not-run-yet status states WHY (the stage-order teaching, per stage). */
function notRunStatusOf(stage: RefineryStage, latestOf: ReadonlyMap<RefineryStage, RunView>): string {
  if (stage === "analyze") {
    return latestOf.get("rewrite") === undefined ? "needs a rewrite to judge" : "not run yet";
  }
  if (stage === "rewrite" && latestOf.get("score") === undefined) {
    return "runs best after a score";
  }
  return "not run yet";
}

// Re-derived locally from the wire (§7.4).
type KeptAccept = inferInput<Trpc["refinery"]["applyFields"]>["accepts"][number];
type StagePreflightView = NonNullable<ReturnType<typeof useRefineryPreflight>["data"]>["stages"][number];

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

  const [activeStage, setActiveStage] = useState<RefineryStage>("score");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeState | null>(null);
  // The run ids THIS view produced — the hero gauge's arrival signal (`useCountUp`'s `arrived`). Ids, not a
  // boolean: the pane can show an OLDER run (view-back, a stage switch) while a newer one landed.
  const [landedRunIds, setLandedRunIds] = useState<ReadonlySet<string>>(() => new Set());
  const noteLanded = (...ids: readonly string[]): void => setLandedRunIds((prev) => new Set([...prev, ...ids]));
  const viewedRunId = useRefineryViewedRunId();
  const armedRewriteId = useRefineryArmedRewriteId();

  const allRuns: readonly RunView[] = runs.data ?? [];
  const latestOf = new Map<RefineryStage, RunView>();
  for (const run of allRuns) {
    latestOf.set(run.stage, run); // oldest-first wire — the last write per stage wins.
  }
  const { viewedRun, armedRewrite, effectiveStage, paneRun, rewriteRun, rewriteRunId } = runSelectionOf(allRuns, latestOf, {
    viewedRunId,
    armedRewriteId,
    activeStage,
  });
  const { sheet, decide } = useRewriteDecisions(rewriteRunId);

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

  const cells = stageCellsOf(latestOf, runStage, iterate.isPending);
  const paneRunning = paneRunningOf({ running, iterating: iterate.isPending, pendingStage: runStage.pendingVariables?.stage, effectiveStage });

  const rewriteEntries = rewriteEntriesFor(rewriteRun, card, view);
  const decided = sheet ?? Array.from({ length: rewriteEntries.length }, (): CompareDecision => null);
  const keptAccepts = keptAcceptsOf(rewriteEntries, decided);

  const { stagePre, contextTokens } = preflightSliceOf(preflight.data, effectiveStage);
  const manualTargets = manualTargetsOf(view.selection, card);

  return (
    <Stack data-testid={testId("refineryContent")} gap="row" padding="block">
      <SessionHeaderRow
        applied={outcome !== null && outcome.applied.length > 0}
        cardName={card.name}
        onEditScope={(): void => setScopeOpen(true)}
        status={view.status}
      />

      <StageStepper
        active={effectiveStage}
        cells={cells}
        onSelect={(stage): void => {
          setActiveStage(stage);
          setRefineryViewedRun(null);
        }}
      />

      {/* WRAPS (side-eye 2026-08-09 P2). A non-wrapping `Row` clipped the tail chips off the pane at the
          3-pane / mobile container width — CREATOR NOTES / EXAMPLE MESSAGES were painted past the edge and
          invisible. `flex-wrap` lets the strip reflow onto a second line (the teaching-steps precedent);
          `gap="field"` supplies the between-line gap too. */}
      <Row align="center" className="flex-wrap" gap="field">
        <Text voice="kicker">Scope</Text>
        {view.selection.fields.map((field) => (
          <RefineryChip key={field} tone="info">
            {scopeChipLabelOf(field, view.selection.greetingIndexes)}
          </RefineryChip>
        ))}
      </Row>

      {outcome !== null ? (
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
      ) : (
        <StagePane
          activeStage={effectiveStage}
          arrived={paneRun !== null && landedRunIds.has(paneRun.id)}
          decided={decided}
          entries={rewriteEntries}
          onDecide={(index, decision): void => decide(index, decision, rewriteEntries.length)}
          run={effectiveStage === "rewrite" ? rewriteRun : paneRun}
          running={paneRunning}
          viewingBack={viewedRun !== null}
        />
      )}

      <RunControlsCard
        canIterate={latestOf.get("analyze") !== undefined}
        contextTokens={contextTokens}
        effectiveStage={effectiveStage}
        guidance={view.guidance}
        hasRun={latestOf.get(effectiveStage) !== undefined}
        onIterate={(): void => iterate.mutate({ sessionId }, { onSuccess: (round): void => noteLanded(round.rewrite.id, round.analyze.id) })}
        onManualOpen={(): void => setManualOpen(true)}
        onRun={(): void => runStage.mutate({ sessionId, stage: effectiveStage }, { onSuccess: (run): void => noteLanded(run.id) })}
        onScopeOpen={(): void => setScopeOpen(true)}
        running={running}
        sessionId={sessionId}
        stagePre={stagePre}
      />

      {effectiveStage === "rewrite" && rewriteRun !== null ? (
        <ApplyRow armedRewrite={armedRewrite} armedRewriteId={armedRewriteId} keptAccepts={keptAccepts} onOutcome={setOutcome} sessionId={sessionId} />
      ) : null}

      <ScopeEditorDialog
        card={card}
        onOpenChange={setScopeOpen}
        onSave={(selection): void => updateSession.mutate({ sessionId, patch: { selection } })}
        open={scopeOpen}
        score={scorePayloadOf(latestOf.get("score")) ?? null}
        selection={view.selection}
      />
      <ManualRewriteDialog
        onOpenChange={setManualOpen}
        onSubmit={(fields): void => {
          manual.mutate({ sessionId, fields: [...fields] }, { onSuccess: (): void => setManualOpen(false) });
          setActiveStage("rewrite");
        }}
        open={manualOpen}
        saving={manual.isPending}
        targets={manualTargets}
      />
    </Stack>
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

/** The stepper cells: per-stage settled status (or the not-run WHY) + the running shimmer. */
function stageCellsOf(
  latestOf: ReadonlyMap<RefineryStage, RunView>,
  runStage: { isPending: boolean; pendingVariables?: { stage?: RefineryStage } | undefined },
  iterating: boolean,
): StageCell[] {
  const pendingStage = runStage.isPending ? (runStage.pendingVariables?.stage ?? null) : null;
  return (["score", "rewrite", "analyze"] as const).map((stage) => {
    const latest = latestOf.get(stage);
    const status = latest === undefined ? notRunStatusOf(stage, latestOf) : statusLineOf(latest);
    return { stage, status, done: latest !== undefined, running: pendingStage === stage || (iterating && stage !== "score") };
  });
}

/** Is a call in flight FOR THE STAGE THE PANE IS SHOWING? `running` alone is true for any stage's call,
 *  so dimming on it would shimmer the score pane while a rewrite runs — the same "the status lies" defect
 *  the pending arm exists to fix, one pane over (side-eye 2026-08-09 P1-10). An `iterate` turn drives
 *  whichever stage is effective, since that is the pane it will land in. */
function paneRunningOf(args: { running: boolean; iterating: boolean; pendingStage: RefineryStage | undefined; effectiveStage: RefineryStage }): boolean {
  if (!args.running) {
    return false;
  }
  return (args.pendingStage ?? (args.iterating ? args.effectiveStage : null)) === args.effectiveStage;
}

/** The preflight slice the pane reads for the effective stage. */
function preflightSliceOf(
  data: ReturnType<typeof useRefineryPreflight>["data"],
  effectiveStage: RefineryStage,
): { stagePre: StagePreflightView | undefined; contextTokens: number | null } {
  return { stagePre: data?.stages.find((s) => s.stage === effectiveStage), contextTokens: data?.contextTokens ?? null };
}

/** The session header row: the card name, the roster status, and §20b's workspace state line — the ONE
 *  place draft flips to written. */
function SessionHeaderRow({
  cardName,
  status,
  applied,
  onEditScope,
}: {
  cardName: string;
  status: string;
  applied: boolean;
  onEditScope: () => void;
}): ReactElement {
  return (
    <Row align="center" gap="row">
      <Stack className="min-w-0 flex-1" gap="tight">
        <Row align="center" gap="field">
          <Text voice="label">{cardName}</Text>
          <RefineryChip tone={status === "active" ? "info" : "neutral"}>{status}</RefineryChip>
          <RefineryChip tone="neutral">{applied ? "applied · snapshot taken" : "draft — the live card is untouched"}</RefineryChip>
        </Row>
        <Text voice="gloss">Anchored to the card as it was when this session started — every analyze compares against that pin.</Text>
      </Stack>
      <Button intent="secondary" onClick={onEditScope} size="sm">
        Edit scope
      </Button>
    </Row>
  );
}

/** Which runs the pane is standing on: the view-back pin (the CONTEXT ledger's walker), the armed
 *  rewrite (§16.1 operate-back), the effective stage, and the rewrite the accept review targets. */
function runSelectionOf(
  allRuns: readonly RunView[],
  latestOf: ReadonlyMap<RefineryStage, RunView>,
  pins: { viewedRunId: string | null; armedRewriteId: string | null; activeStage: RefineryStage },
): {
  viewedRun: RunView | null;
  armedRewrite: RunView | null;
  effectiveStage: RefineryStage;
  paneRun: RunView | null;
  rewriteRun: RunView | null;
  rewriteRunId: string | null;
} {
  const viewedRun = pins.viewedRunId === null ? null : (allRuns.find((r) => r.id === pins.viewedRunId) ?? null);
  const armedRewrite = pins.armedRewriteId === null ? null : (allRuns.find((r) => r.id === pins.armedRewriteId && r.stage === "rewrite") ?? null);
  // A view-back pin from the CONTEXT ledger overrides the active stage (the walker loads WHERE you are).
  const effectiveStage = viewedRun?.stage ?? pins.activeStage;
  const paneRun = viewedRun ?? latestOf.get(effectiveStage) ?? null;
  const rewriteRun = armedRewrite ?? (paneRun !== null && paneRun.stage === "rewrite" ? paneRun : (latestOf.get("rewrite") ?? null));
  return { viewedRun, armedRewrite, effectiveStage, paneRun, rewriteRun, rewriteRunId: rewriteRun === null ? null : rewriteRun.id };
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
