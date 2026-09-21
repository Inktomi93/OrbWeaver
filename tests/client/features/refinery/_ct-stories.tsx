// Refinery R2 data-tier CT stories (core/Spine-Testing.md §7 — a CT mounts ONLY from a non-test module).
//
// R3 SHIPPED — `refinerySection` mounts `RefineryContentSurface` in the live CONTENT slot
// (`features/refinery/lib/refinery-section.tsx:88`), and `RefineryContentStory` below drives that REAL
// surface. (This header said the opposite until 2026-08-14: it claimed R3 was design-gated with no
// production surface, which made `RefineryDataProbe` read as an unavoidable surrogate rather than what it
// is — the WRITE-TIER probe. Audit finding `client-preset-refinery-02`.)
//
// `RefineryDataProbe` keeps its own job: the R2 hooks driven bare, so a mutation's toast/refusal channel is
// observable without the surface's chrome in the way. It mounts the REAL hooks from the feature front door,
// through the REAL app QueryClient (`CtAppDataProviders` — the one whose MutationCache `meta.errorToast` IS
// the `notify` channel) and the real toast surface, over a network stubbed at `page.route`. Every observable
// the CTs assert is either rendered text the hooks produced or a wire call `routeTrpc` counted — never a
// hand-mock of a hook.
//
// The id props stay BRANDED across the CT process boundary. A brand is compile-time only, so a branded id
// serializes as the plain string it already is — and the `.ct.tsx` MINTS them (`mintTypeId(ID_PREFIX.x)`,
// never a hand-written literal), so nothing here has to `castId` a made-up string back into a brand. That is
// the honest form of the `CharacterCardTileStory` note, not a departure from it: that story takes plain
// strings because its ids come from a fixture's display data, not from a mint.

import { useInvalidation, useOpenRefinery, useTRPC } from "@orb/client/data";
import type { PayloadLaneProps, ReviewEntry, RewriteLaneProps } from "@orb/client/features/refinery";
import {
  AcceptReview,
  BUILTIN_STAGE_HINTS,
  buildRenderPlan,
  LaneRunControl,
  PayloadLane,
  PayloadView,
  RefineryContentSurface,
  RefineryListHeader,
  RefineryListSurface,
  RewriteLane,
  RunControlsCard,
  RunsTabBody,
  SchemaEditorDialog,
  ScopeEditorDialog,
  SetupTabBody,
  TeachingState,
  useApplyRefineryFields,
  useDeleteRefinerySession,
  useIterateRefinery,
  useRefineryRuns,
  useRefinerySession,
  useRefinerySessions,
  useRunRefineryStage,
  useUpdateRefinerySession,
} from "@orb/client/features/refinery";
import { refinerySectionSelection, selectRefinerySession, setMobileViewport, setRefineryViewedRun } from "@orb/client/state";
import type { CharacterCard } from "@orb/contracts/character";
import type { RefinableField, RefinerySchemaStage, RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import type { CharacterId, ModelId, RefinerySchemaId, RefinerySessionId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { CompareDecision } from "@orb/ui/compare-blocks";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { Suspense, useState } from "react";
import { VersionsTabBody } from "../../../../packages/client/src/features/refinery/components/refinery-context-tabs.tsx";
import { CtAppDataProviders, CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";

export interface RefineryDataStoryProps {
  /** The selected session the detail reads + every session-scoped write target. */
  readonly sessionId: RefinerySessionId;
  /** The card `startSession` opens against. */
  readonly characterId: CharacterId;
}

function RefineryDataProbe({ sessionId, characterId }: RefineryDataStoryProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const deps = { trpc, invalidation };

  const sessions = useRefinerySessions();
  const session = useRefinerySession(sessionId);
  const runs = useRefineryRuns(sessionId);

  // The START door is the SHARED flow now (`#data`'s `useOpenRefinery`) — one resume-or-mint rule behind
  // all three of the product's doors (#157). The probe drives it through the same seam the surfaces do.
  const { openRefinery } = useOpenRefinery();
  const update = useUpdateRefinerySession(deps);
  const remove = useDeleteRefinerySession(deps);
  const runStage = useRunRefineryStage(deps);
  const iterate = useIterateRefinery(deps);
  const apply = useApplyRefineryFields(deps);
  // The apply OUTCOME, rendered. `applyFields` itemizes per entry — and since the emptying arm landed it
  // itemizes the KIND too ("replaced" vs "cleared"), because destruction has to be stated, not inferred
  // from a diff with a blank side. The hooks type through the tRPC wire types, so the only honest proof
  // that the field survives the whole chain is reading it off a real response and painting it.
  const [outcome, setOutcome] = useState<string | null>(null);

  return (
    <div>
      {/* Optional-chained on purpose: `routeTrpc` answers an UNLISTED procedure `{result:{data:null}}`, so a
          story that renders `data.length` mount-throws in every test that does not script all three reads. */}
      <p data-testid="roster">{`rows=${sessions.data?.length ?? "…"}`}</p>
      <p data-testid="session">{`status=${session.data?.status ?? "…"}`}</p>
      <p data-testid="runs">{`runs=${runs.data?.length ?? "…"}`}</p>
      <button type="button" onClick={(): void => void openRefinery(characterId).catch(() => undefined)}>
        start session
      </button>
      {/* The FRESHNESS DRIVER, exercised through the real seam. Every refinery write is `busDriven` now —
          the server emits `refineryChanged` and `use-user-bus` routes it to `invalidateUser`. This button is
          that last hop and nothing more (the SSE socket itself is `use-user-bus`'s own CT), so a CT can prove
          the tick a SECOND DEVICE's write produces actually repaints this tab's roster. */}
      <button type="button" onClick={(): void => invalidation.invalidateUser({ type: "refineryChanged" })}>
        user bus tick
      </button>
      <button type="button" onClick={(): void => update.mutate({ sessionId, patch: { name: "Renamed" } })}>
        save session
      </button>
      <button type="button" onClick={(): void => remove.mutate({ sessionId })}>
        delete session
      </button>
      <button type="button" onClick={(): void => runStage.mutate({ sessionId, stage: "analyze" })}>
        run stage
      </button>
      <button type="button" onClick={(): void => iterate.mutate({ sessionId })}>
        iterate
      </button>
      <p data-testid="applied">{`applied=${outcome ?? "…"}`}</p>
      <button
        type="button"
        onClick={(): void =>
          apply.mutate(
            { sessionId, accepts: [{ field: "description" }] },
            { onSuccess: (data): void => setOutcome(data.applied.map((entry) => `${entry.field}:${entry.kind}`).join(",")) },
          )
        }
      >
        apply
      </button>
    </div>
  );
}

/** The R2 data tier on the REAL app QueryClient + the real toast surface — the wiring a mutation's ERROR
 *  TOAST and its errors-as-data REFUSAL need to be observable at all (the plain CT client has no
 *  MutationCache error channel). */
export function RefineryDataStory({ sessionId, characterId }: RefineryDataStoryProps): ReactElement {
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <RefineryDataProbe characterId={characterId} sessionId={sessionId} />
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

// --- The LIVE R3 CONTENT surface (the primary workflow, mounted whole) ---

export interface RefineryContentStoryProps {
  /** The session the drill store opens — the same seam the roster row writes. */
  readonly sessionId: RefinerySessionId;
  /** A run id the story can PIN through `setRefineryViewedRun` — the §16.1 view-back door. It lives in the
   *  state commons because the CONTEXT Runs tab drives it from a SIBLING pane, so the button below is the
   *  production seam standing in for that pane, not a stub of the surface's own behaviour. Absent ⇒ no
   *  walker button (the plain live-latest arm). */
  readonly viewBackRunId?: string;
}

/**
 * The REAL `RefineryContentSurface`, exactly as `refinerySection` mounts it, on the REAL app data tier and
 * toast channel over a `page.route`-stubbed network. Nothing here re-implements the surface: the story
 * supplies only what the SHELL supplies in production — the drill selection, and the sibling pane's
 * view-back door.
 *
 * THE DRILL IS SEEDED DURING THE FIRST RENDER PASS, NOT IN AN EFFECT. An effect would paint the START pane
 * first and swap on the second commit, so every test would be racing a flash it does not care about — and a
 * CT that barriers on a mid-flight state is exactly the flake the harness law forbids.
 */
export function RefineryContentStory({ sessionId, viewBackRunId }: RefineryContentStoryProps): ReactElement {
  useState((): null => {
    selectRefinerySession(sessionId);
    setRefineryViewedRun(null);
    return null;
  });
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        {viewBackRunId === undefined ? null : (
          <button onClick={(): void => setRefineryViewedRun(viewBackRunId)} type="button">
            walk back
          </button>
        )}
        <RefineryContentSurface />
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

/**
 * The REAL `RefineryContentSurface` with NOTHING selected — the LANDING, i.e. the arm `RefineryStartPane`
 * owns: the teaching state, its character door, and the resume-or-mint decision a pick resolves (#79).
 *
 * The selection is CLEARED during the first render pass for the same reason `RefineryContentStory` seeds
 * one there: an effect would paint one arm and swap on the second commit, and a CT that barriers on a
 * mid-flight state is the flake the harness law forbids. Clearing rather than trusting the store's initial
 * value keeps this story independent of whatever a prior mount in the same page left behind.
 */
export function RefineryStartStory(): ReactElement {
  useState((): null => {
    refinerySectionSelection.clear();
    setRefineryViewedRun(null);
    return null;
  });
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <RefineryContentSurface />
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

/**
 * The FULL desktop landing exactly as `refinerySection` mounts it — the sessions roster (list header +
 * surface) AND the CONTENT landing picker, in ONE tree on ONE data tier. It is the only mount where the
 * #307 duplicate-door is visible at all: the roster's empty-state CTA and the CONTENT picker are two
 * different shell surfaces, and the defect is the CTA opening a SECOND full-library picker over the one
 * CONTENT already shows. It is also the faithful mount for the #308 read count — the roster's
 * `listSessions` and the picker's `character.list`, deduped through the one production QueryClient.
 *
 * Selection cleared and the viewport regime published during the first render pass (never an effect), the
 * reason every story here states: an effect would paint one arm and swap on the second commit, and a CT
 * that barriers on a mid-flight state is the flake the harness law forbids.
 */
export function RefineryLandingStory({ mobile = false }: { readonly mobile?: boolean }): ReactElement {
  useState((): null => {
    setMobileViewport(mobile);
    refinerySectionSelection.clear();
    setRefineryViewedRun(null);
    return null;
  });
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <Suspense fallback={<p>loading roster</p>}>
          <div>
            <RefineryListHeader />
            <RefineryListSurface />
          </div>
          <RefineryContentSurface />
        </Suspense>
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

// --- R3 SURFACE stories (pure presentation — no wire; the props cross the CT boundary as JSON) ---

export interface PayloadViewStoryProps {
  /** A FIXED stage renders its projected contract + the built-in hint set (the blessed look IS the
   *  general renderer applied to a hinted schema). */
  readonly stage?: RefineryStage;
  /** A CUSTOM schema renders hint-overlay-free — exactly the embedded-schema path `PayloadLane` runs. */
  readonly schema?: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
}

/** The ONE payload renderer over either a fixed stage's projected contract or a custom schema — the
 *  same derivation `PayloadLane` performs, minus the lane chrome. */
export function PayloadViewStory({ stage, schema, payload }: PayloadViewStoryProps): ReactElement {
  const resolved = schema ?? projectJsonSchema(REFINERY_STAGE_PAYLOADS[stage ?? "score"]);
  const plan = buildRenderPlan(resolved, schema === undefined ? BUILTIN_STAGE_HINTS[stage ?? "score"] : {});
  return <PayloadView payload={payload} plan={plan} />;
}

/** The no-selection TEACHING state, mounted whole — the door the phone and the desktop both land on
 *  when nothing is open. Wrapped in the data providers because its character door (rendered only after
 *  "Pick a character") reads the roster; at rest nothing queries.
 *
 *  `width` mounts it in a FIXED-width container: a content-sized CT root agrees with an overflow bug, so
 *  the narrowest-real-mount measurement needs a real box to overflow out of. Absent ⇒ content-sized.
 *
 *  THE `<Container>` IS PRODUCTION, NOT SCAFFOLDING (2026-08-19). The teaching row's tracks are a
 *  CONTAINER query (`gridVariants.triple`), and in production this state renders inside
 *  `RefineryContentSurface`'s own `<Container name="refinery-content">`. Without one here every
 *  container-queried arm resolves to its narrow default, so a CT would measure the stacked layout at
 *  every width and read as green about a composition it never rendered. */
export function TeachingStateStory({ width }: { readonly width?: number }): ReactElement {
  const teaching = <TeachingState onStart={(): void => undefined} starting={false} />;
  return (
    <CtAppDataProviders>
      {width === undefined ? (
        <Container>{teaching}</Container>
      ) : (
        <div data-testid="teaching-frame" style={{ overflow: "visible", width }}>
          <Container>{teaching}</Container>
        </div>
      )}
    </CtAppDataProviders>
  );
}

export interface AcceptReviewStoryProps {
  readonly entries: readonly ReviewEntry[];
}

// --- The ROSTER surface (the server-side character-identity proof) ---

/** The sessions roster on the REAL data tier. It reads `refinery.listSessions` and NOTHING else — that
 *  is the point of the story: the row's title, avatar and search key all come off the summary the
 *  server sent, so a card whose row sits past `character.list`'s 100-row page still names itself. Any
 *  `character.list` call this surface made would be recorded by `routeTrpc` and is asserted absent. */
export interface RefineryRosterStoryProps {
  /** Publish the shell's MOBILE viewport regime before the first paint — the state the one-shell rule
   *  turns on (`resolvePanelMode`'s `listIsScreen` arm: on a phone with nothing selected this roster IS
   *  the screen and CONTENT is not rendered at all). The header's `+` reads it to decide whether the
   *  landing's picker is already on screen, so a CT cannot ask that question without setting it. Written
   *  during the first render pass, never in an effect, for the reason every story here states: an effect
   *  would paint the desktop arm and swap on the second commit. @defaultValue false */
  readonly mobile?: boolean;
  /** Open a session before the first paint — the arm where CONTENT shows the pipeline rather than the
   *  landing picker, which is where the header's `+` is the only start door on a desktop. */
  readonly selectedSessionId?: RefinerySessionId;
}

export function RefineryRosterStory({ mobile = false, selectedSessionId }: RefineryRosterStoryProps): ReactElement {
  useState((): null => {
    setMobileViewport(mobile);
    if (selectedSessionId === undefined) {
      refinerySectionSelection.clear();
    } else {
      selectRefinerySession(selectedSessionId);
    }
    return null;
  });
  return (
    <CtAppDataProviders>
      <Suspense fallback={<p>loading roster</p>}>
        <div>
          <RefineryListHeader />
          <RefineryListSurface />
        </div>
      </Suspense>
    </CtAppDataProviders>
  );
}

// --- The SCHEMA EDITOR (the raw door, the arm picker, the forge arms, edit-existing) ---

export interface SchemaEditorStoryProps {
  readonly stage?: RefinerySchemaStage;
  /** Editing an EXISTING library row (P1-15's unlocked branch) vs authoring a new one. */
  readonly editing?: { readonly id: RefinerySchemaId; readonly name: string; readonly description: string; readonly schema: Record<string, unknown> } | null;
}

/** The custom-schema editor, open, on the REAL app data tier + toast channel (its forge/save calls are
 *  mutations whose refusals and pending arms are the observables). `onOpenChange`/`onSaved` are
 *  swallowed here — closing is the caller's business and a CT asserts on what the dialog RENDERS. */
export function SchemaEditorStory({ stage = "score", editing = null }: SchemaEditorStoryProps): ReactElement {
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <SchemaEditorDialog editing={editing} onOpenChange={(): void => undefined} onSaved={(): void => undefined} open={true} stage={stage} />
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

/** The same editor with a REAL owner of its `open` state — the only way a CT can see whether a close
 *  request was honoured or guarded (#81 P1: the dialog had no Cancel at all, and Esc destroyed the draft
 *  in silence). The closed arm renders a marker so "it closed" is an assertable rendered fact rather than
 *  the absence of a portal. */
export function SchemaEditorCloseGuardStory({ stage = "score", editing = null }: SchemaEditorStoryProps): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <SchemaEditorDialog editing={editing} onOpenChange={setOpen} onSaved={(): void => undefined} open={open} stage={stage} />
        {open ? null : <p>the schema editor is closed</p>}
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

// --- The SETUP context tab (the two schema-verb doors: author-analyze + edit-saved) ---

export interface SetupTabBodyStoryProps {
  /** The open session the tab reads (its `stageConfig` decides which stage rows are custom vs fixed). */
  readonly sessionId: RefinerySessionId;
  /** The card the tab's gated `character.get` resolves (the scope dialog + anchor line need it). */
  readonly characterId: CharacterId;
}

/** The LIVE Setup context-tab body on the REAL data tier, exactly as the CONTEXT panel mounts it, over a
 *  `page.route`-stubbed network. The subject is the SCHEMA-EDITOR DOORS: one row per stage, each opening
 *  the editor at that stage — over the saved row when the stage is custom (EDIT), or fresh when fixed. */
export function SetupTabBodyStory({ sessionId, characterId }: SetupTabBodyStoryProps): ReactElement {
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <SetupTabBody state={{ sessionId, characterId }} />
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

/** The RUNS context tab on the REAL data tier — mounted for its EMPTY arm, whose "Run score" is the twin
 *  of the SCORE lane's own verb one pane over. The pin it exists for is the WEIGHT of that twin (§14:
 *  bolder in the work pane, quieter in the ledger), which is a rendered fact and has no other mount. */
export function RunsTabBodyStory({ sessionId, characterId }: SetupTabBodyStoryProps): ReactElement {
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <RunsTabBody state={{ sessionId, characterId }} />
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

/** THE #171 DOORS, mounted the way the SHELL mounts them: the CONTEXT pane's Setup readout and the
 *  WORKBENCH that owns the controls it reads, in one tree, sharing the state commons. It is the only mount
 *  where a door can be proven at all — the Setup row raises a request and the OWNING control answers it,
 *  and neither half can show that alone. The drill is seeded during the first render pass (never in an
 *  effect), for the same reason `RefineryContentStory` seeds one there. */
export function RefineryDoorStory({ sessionId, characterId }: SetupTabBodyStoryProps): ReactElement {
  useState((): null => {
    selectRefinerySession(sessionId);
    setRefineryViewedRun(null);
    return null;
  });
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <SetupTabBody state={{ sessionId, characterId }} />
        <RefineryContentSurface />
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

// --- The HERO COUNT-UP ramp (the money shot) ---

type PayloadLaneRun = NonNullable<PayloadLaneProps["run"]>;

const RAMP_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
/** MINTED, never hand-written (the `typeIdSchema` 26-char-suffix rule). Two distinct ids because `arrived`
 *  is decided BY ID: the run a session was merely opened on must not be mistaken for the one that landed. */
const RAMP_OPENED_RUN_ID = mintTypeId(ID_PREFIX.refineryRun);
const RAMP_LANDED_RUN_ID = mintTypeId(ID_PREFIX.refineryRun);
const RAMP_FROZEN_AT = 1_750_000_000_000;

/** One settled fixed SCORE run on the wire shape `listRuns` returns — the pane's whole input. */
function scoreRun(id: PayloadLaneRun["id"], overallScore: number): PayloadLaneRun {
  return {
    id,
    sessionId: RAMP_SESSION_ID,
    iteration: 0,
    model: castId<ModelId>("test-summarizer"),
    promptTokens: 2736,
    outputTokens: 1490,
    durationMs: 23_600,
    sourceRunId: null,
    strippedKeys: [],
    createdAt: RAMP_FROZEN_AT,
    stage: "score",
    payloadConfig: { kind: "fixed", mode: "full" },
    payload: { fieldScores: [], overallScore, priorityImprovements: [], summary: "A solid card." },
  };
}

export interface HeroRampStoryProps {
  /** A score the pane is ALREADY showing at mount, from a session the user merely opened (no arrival —
   *  the re-run arm's starting state). Absent ⇒ the pane opens on the not-run-yet arm, i.e. the FIRST-RUN
   *  arm, which is the one the money shot exists for. */
  readonly from?: number;
  /** The score that lands when "land" is pressed. */
  readonly to: number;
}

/**
 * The hero gauge's count-up driven THROUGH `PayloadLane`, exactly as `RefineryContentSurface` drives it —
 * because the arm this animation exists for only appears there. (It drove `StagePane` until the workbench
 * rebuild; `PayloadLane` is the same body dispatch under the lane's own band.)
 *
 * WHY NOT `PayloadView` DIRECTLY (this story's previous shape, replaced under #47). A first run in
 * production goes `run === null && running` → the running body → the run lands → `PayloadView` MOUNTS
 * holding its final number. `PayloadView` therefore never renders `pending` with an empty payload in the
 * app at all; a story that mounted it that way was exercising a path the product does not have, and the
 * local `awaited` latch that made that story pass was itself unreachable code. The buttons below are the
 * two halves of a real mutation — "run" is the call going in flight (`runStage.isPending`), "land" is its
 * `onSuccess` handing back a run whose id the surface records in `landedRunIds`, which is the ONLY thing
 * that says `arrived`. Re-introduce the mount-with-value skip and the first-run test goes red here.
 */
export function HeroRampStory({ from, to }: HeroRampStoryProps): ReactElement {
  const [run, setRun] = useState<PayloadLaneRun | null>(from === undefined ? null : scoreRun(RAMP_OPENED_RUN_ID, from));
  const [running, setRunning] = useState(false);
  // The surface's own signal: the ids ITS mutations produced. A session merely opened contributes none, so
  // the `from` run above is deliberately absent from this set.
  const [landedRunIds, setLandedRunIds] = useState<ReadonlySet<string>>(() => new Set());
  return (
    <div>
      <button onClick={(): void => setRunning(true)} type="button">
        run
      </button>
      <button
        onClick={(): void => {
          const landed = scoreRun(RAMP_LANDED_RUN_ID, to);
          setLandedRunIds((prev) => new Set([...prev, landed.id]));
          setRun(landed);
          setRunning(false);
        }}
        type="button"
      >
        land
      </button>
      <PayloadLane
        arrived={run !== null && landedRunIds.has(run.id)}
        behind={null}
        onBackToLatest={(): void => undefined}
        run={run}
        running={running}
        stage="score"
        viewingBack={false}
      />
    </div>
  );
}

// --- The LANE RUN CONTROL: the running hairline + the fit-line/verb geometry at a rail width ---

export interface LaneRunControlStoryProps {
  readonly stage: RefineryStage;
  /** A call for THIS stage is in flight — the arm that carries the indeterminate hairline. */
  readonly running: boolean;
  /** Mounts the control in a fixed-width frame — a rail is 15–17rem, and a content-sized CT root agrees
   *  with an overflow bug. `overflow: visible` so an overlap is measurable rather than clipped away. */
  readonly width: number;
}

/** One lane's run control at a rail width. The preflight slice is deliberately UNDER budget (no ⚠, no
 *  PreflightWarn) — the fit-line + verb row is the subject; the WARN arm has its own story below. */
export function LaneRunControlStory({ stage, running, width }: LaneRunControlStoryProps): ReactElement {
  return (
    <div data-testid="lane-run-frame" style={{ overflow: "visible", width }}>
      <LaneRunControl
        busy={running}
        contextTokens={8000}
        hasRun={true}
        onRun={(): void => undefined}
        blocked={null}
        onScopeOpen={(): void => undefined}
        running={running}
        stage={stage}
        stagePre={{
          stage,
          model: castId<ModelId>("test-model"),
          temperature: null,
          maxOutputTokens: 4096,
          inputEstimate: 2736,
          outputEstimate: 1490,
        }}
      />
    </div>
  );
}

const RUN_CONTROLS_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);

/** The FOOT run bar at a fixed narrow CONTAINER width — the P1-2 proof that survived the workbench
 *  rebuild: an input and its action cluster cannot share one line's slack, so the guidance field must keep
 *  a usable width instead of being squeezed under a min-content verb cluster. Wrapped in the data providers
 *  because the guidance field's blur mutation hook is constructed at render (never fired here). */
export function RunControlsCardStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtAppDataProviders>
      <div data-testid="run-controls-frame" style={{ overflow: "visible", width }}>
        <RunControlsCard
          canIterate={true}
          guidance={null}
          onIterate={(): void => undefined}
          onManualOpen={(): void => undefined}
          running={false}
          sessionId={RUN_CONTROLS_SESSION_ID}
        />
      </div>
    </CtAppDataProviders>
  );
}

// --- The REWRITE island (the ONE focal lane): the focal field, the queue, and the tally ---

export interface RewriteLaneStoryProps {
  readonly entries: readonly ReviewEntry[];
  /** No settled rewrite run — the lane's not-run-yet arm. */
  readonly empty?: boolean;
}

/** The rewrite island held exactly as the workbench holds it: the decision sheet lives in the caller (belt
 *  10 — every field opens UNDECIDED and undecided fails closed), the lane owns which field is open. */
export function RewriteLaneStory({ entries, empty = false }: RewriteLaneStoryProps): ReactElement {
  const [decided, setDecided] = useState<readonly CompareDecision[]>(entries.map(() => null));
  // Exactly what the lane READS off a run (`RewriteLaneProps["run"]` is the narrowed view): its round, its
  // stage and the provenance its band prints. The reviewable entries arrive on their own prop — the surface
  // joins the payload against the live card and the session pin before the lane ever sees it.
  const run: NonNullable<RewriteLaneProps["run"]> = { iteration: 1, stage: "rewrite", payloadConfig: { kind: "fixed", mode: "balanced" } };
  return (
    <RewriteLane
      behind={null}
      decided={decided}
      entries={entries}
      // The island's own CT is about its accept anatomy, so it mounts in the state the workbench gives it
      // whenever a score exists — carrying the focal (`lib/workbench-lanes.ts` decides it in production).
      focal={true}
      onBackToLatest={(): void => undefined}
      onDecide={(index, decision): void => setDecided((prev) => prev.map((d, i) => (i === index ? decision : d)))}
      run={empty ? null : run}
      runControl={null}
      running={false}
      viewingBack={false}
    />
  );
}

/** The accept review, controlled the way the content surface holds it: every entry opens UNDECIDED
 *  (belt 10 — fail-closed is the initial state, not a prop). */
export function AcceptReviewStory({ entries }: AcceptReviewStoryProps): ReactElement {
  const [decided, setDecided] = useState<readonly CompareDecision[]>(entries.map(() => null));
  return (
    <AcceptReview
      decided={decided}
      entries={entries}
      onDecide={(index, decision): void => setDecided((prev) => prev.map((d, i) => (i === index ? decision : d)))}
    />
  );
}

/** The card the scope rows describe. Declared HERE, in full, rather than taken as a prop: the dialog's
 *  contract is `CharacterCard` (the contracts shape), and the character CT fixture is a WIRE fixture that
 *  does not satisfy it. Nothing in this story turns on the card's content — only on its field texts
 *  supplying each row's gloss and its two greetings giving the tri-state parent something to count. */
const SCOPE_CARD: CharacterCard = {
  name: "Zephyrine Vale",
  description: "A wandering cartographer who fills ledgers nobody asked her for.",
  personality: "Guarded, precise.",
  scenario: null,
  greetings: [{ text: "The road is long." }, { text: "You again." }],
  exampleMessages: null,
  systemPrompt: null,
  postHistoryInstructions: null,
  depthPrompt: null,
  creatorNotes: null,
  creator: null,
  cardVersion: null,
  nickname: null,
  source: null,
  creationDate: null,
  modificationDate: null,
  extensions: null,
  residualData: null,
  avatarAssetId: null,
  refinery: null,
};

export interface ScopeEditorReopenStoryProps {
  /** The scope image the pane mounts with. */
  readonly initialFields: readonly RefinableField[];
  /** The image a SERVER write lands while the dialog is closed (the `applyFields` remap). */
  readonly remappedFields: readonly RefinableField[];
}

/**
 * `ScopeEditorDialog` held exactly the way BOTH production call sites hold it
 * (`surfaces/refinery-content-surface.tsx`, `components/refinery-context-tabs.tsx`): mounted PERMANENTLY
 * beside the pane and merely gated by `open`, with its `selection` fed from a value a server write can move
 * underneath it.
 *
 * "Remap scope" stands in for `refinery.applyFields` rewriting `view.selection`. In production that change
 * reaches the client through the USER BUS (`useApplyRefineryFields`/`useUpdateRefinerySession` are both
 * `busDriven: true`, so neither mutation invalidates on its own), and a CT has no bus to fire — so the story
 * drives the same prop change the bus-invalidated refetch produces, which is the input the dialog actually
 * sees either way.
 */
export function ScopeEditorReopenStory({ initialFields, remappedFields }: ScopeEditorReopenStoryProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<readonly RefinableField[]>(initialFields);
  return (
    <CtAppDataProviders>
      <button onClick={(): void => setOpen(true)} type="button">
        Open scope
      </button>
      <button onClick={(): void => setFields(remappedFields)} type="button">
        Remap scope
      </button>
      <ScopeEditorDialog
        card={SCOPE_CARD}
        onOpenChange={setOpen}
        // The pane's own write-back: a save moves the session image, which is the second way `selection`
        // changes under a dialog that is still mounted. `fields` is OPTIONAL on the patch (the delta only
        // ever omits the GREETING axis, but the type allows either), so an absent one leaves the image be.
        onSave={(patch): void => setFields((prev) => patch.fields ?? prev)}
        open={open}
        score={null}
        selection={{ fields: [...fields] }}
      />
    </CtAppDataProviders>
  );
}

/** The LIVE Versions context-tab body, mounted the way the CONTEXT panel mounts it. Its own story because
 *  the tab's READ ARMS are the subject: `character.listSnapshots` is a plain `useQuery`, so pending and
 *  failed are states this body renders itself rather than states a boundary above it absorbs. */
export function VersionsTabBodyStory({ sessionId, characterId }: SetupTabBodyStoryProps): ReactElement {
  // `CtDataProviders`, NOT the app client its Runs/Setup siblings use: those two exist to observe an
  // errorToast, and the app QueryClient carries `retry: 2` with backoff — which turns this body's SETTLED
  // read-failure arm into ~seconds of pending. This pin's subject is that arm, so it takes the client whose
  // `retry: false` makes "failed" a state the first response reaches.
  return (
    <CtDataProviders>
      <VersionsTabBody state={{ sessionId, characterId }} />
    </CtDataProviders>
  );
}
