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

import { useInvalidation, useTRPC } from "@orb/client/data";
import type { ReviewEntry, StageCell, StagePaneProps } from "@orb/client/features/refinery";
import {
  AcceptReview,
  BUILTIN_STAGE_HINTS,
  buildRenderPlan,
  PayloadView,
  RefineryContentSurface,
  RefineryListHeader,
  RefineryListSurface,
  RunControlsCard,
  SchemaEditorDialog,
  ScopeEditorDialog,
  SetupTabBody,
  StagePane,
  StageStepper,
  TeachingState,
  useApplyRefineryFields,
  useDeleteRefinerySession,
  useIterateRefinery,
  useRefineryRuns,
  useRefinerySession,
  useRefinerySessions,
  useRunRefineryStage,
  useStartRefinerySession,
  useUpdateRefinerySession,
} from "@orb/client/features/refinery";
import { selectRefinerySession, setRefineryViewedRun } from "@orb/client/state";
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
import { CtAppDataProviders } from "../../../support/ct/ct-data-providers.tsx";
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

  const start = useStartRefinerySession(deps);
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
      <button type="button" onClick={(): void => start.mutate({ characterId })}>
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

// --- R3 SURFACE stories (pure presentation — no wire; the props cross the CT boundary as JSON) ---

export interface PayloadViewStoryProps {
  /** A FIXED stage renders its projected contract + the built-in hint set (the blessed look IS the
   *  general renderer applied to a hinted schema). */
  readonly stage?: RefineryStage;
  /** A CUSTOM schema renders hint-overlay-free — exactly the embedded-schema path `StagePane` runs. */
  readonly schema?: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
}

/** The ONE payload renderer over either a fixed stage's projected contract or a custom schema — the
 *  same derivation `StagePane` performs, minus the run chrome. */
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
 *  the narrowest-real-mount measurement needs a real box to overflow out of. Absent ⇒ content-sized. */
export function TeachingStateStory({ width }: { readonly width?: number }): ReactElement {
  return (
    <CtAppDataProviders>
      {width === undefined ? (
        <TeachingState onStart={(): void => undefined} starting={false} />
      ) : (
        <div data-testid="teaching-frame" style={{ overflow: "visible", width }}>
          <TeachingState onStart={(): void => undefined} starting={false} />
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
export function RefineryRosterStory(): ReactElement {
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

// --- The HERO COUNT-UP ramp (the money shot) ---

type StagePaneRun = NonNullable<StagePaneProps["run"]>;

const RAMP_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
/** MINTED, never hand-written (the `typeIdSchema` 26-char-suffix rule). Two distinct ids because `arrived`
 *  is decided BY ID: the run a session was merely opened on must not be mistaken for the one that landed. */
const RAMP_OPENED_RUN_ID = mintTypeId(ID_PREFIX.refineryRun);
const RAMP_LANDED_RUN_ID = mintTypeId(ID_PREFIX.refineryRun);
const RAMP_FROZEN_AT = 1_750_000_000_000;

/** One settled fixed SCORE run on the wire shape `listRuns` returns — the pane's whole input. */
function scoreRun(id: StagePaneRun["id"], overallScore: number): StagePaneRun {
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
 * The hero gauge's count-up driven THROUGH `StagePane`, exactly as `RefineryContentSurface` drives it —
 * because the arm this animation exists for only appears there.
 *
 * WHY NOT `PayloadView` DIRECTLY (this story's previous shape, replaced under #47). A first run in
 * production goes `run === null && running` → `RunningPane` → the run lands → `PayloadView` MOUNTS holding
 * its final number. `PayloadView` therefore never renders `pending` with an empty payload in the app at
 * all; a story that mounted it that way was exercising a path the product does not have, and the local
 * `awaited` latch that made that story pass was itself unreachable code. The buttons below are the two
 * halves of a real mutation — "run" is the call going in flight (`runStage.isPending`), "land" is its
 * `onSuccess` handing back a run whose id the surface records in `landedRunIds`, which is the ONLY thing
 * that says `arrived`. Re-introduce the mount-with-value skip and the first-run test goes red here.
 */
export function HeroRampStory({ from, to }: HeroRampStoryProps): ReactElement {
  const [run, setRun] = useState<StagePaneRun | null>(from === undefined ? null : scoreRun(RAMP_OPENED_RUN_ID, from));
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
      <StagePane
        activeStage="score"
        arrived={run !== null && landedRunIds.has(run.id)}
        decided={[]}
        entries={[]}
        onDecide={(): void => undefined}
        run={run}
        running={running}
        viewingBack={false}
      />
    </div>
  );
}

// --- The stage stepper's RUNNING arm (the indeterminate hairline + its reduced-motion opt-out) ---

export interface StageStepperStoryProps {
  readonly cells: readonly StageCell[];
  readonly active: RefineryStage;
  /** Mounts the stepper inside a fixed-width `@container` frame — the stepper stacks vertically below the
   *  container's `@lg` step, so the narrow-mount proof needs a real container to query. Absent ⇒ bare
   *  (content-sized, no `@container` ancestor, so it stays horizontal — the running-arm stories' mount). */
  readonly width?: number;
}

/** The stepper at a chosen state — the running cell carries the indeterminate hairline whose whole
 *  reduced-motion contract is that the travelling segment is REMOVED, not parked. `width` mounts it in a
 *  narrow `@container` for the P2 no-clip proof. */
export function StageStepperStory({ cells, active, width }: StageStepperStoryProps): ReactElement {
  if (width === undefined) {
    return <StageStepper active={active} cells={cells} onSelect={(): void => undefined} />;
  }
  return (
    <div data-testid="stepper-frame" style={{ overflow: "visible", width }}>
      <Container name="refinery-stepper-cq">
        <StageStepper active={active} cells={cells} onSelect={(): void => undefined} />
      </Container>
    </div>
  );
}

const RUN_CONTROLS_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);

/** The run bar at a fixed narrow CONTAINER width — the P1 overlap proof. `analyze` is the widest verb
 *  cluster (Hand-edit · Re-run analyze · Iterate), so if the fit-line readout ever paints through a button
 *  it does so here. The frame carries `overflow: visible` so an overlap is measurable, not clipped away.
 *  The preflight slice is deliberately UNDER budget (no ⚠, no PreflightWarn) — the fit-line + verbs row is
 *  the whole subject. Wrapped in the data providers because the guidance field's blur mutation hook is
 *  constructed at render (never fired here). */
export function RunControlsCardStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtAppDataProviders>
      <div data-testid="run-controls-frame" style={{ overflow: "visible", width }}>
        <RunControlsCard
          canIterate={true}
          contextTokens={8000}
          effectiveStage="analyze"
          guidance={null}
          hasRun={true}
          onIterate={(): void => undefined}
          onManualOpen={(): void => undefined}
          onRun={(): void => undefined}
          onScopeOpen={(): void => undefined}
          running={false}
          sessionId={RUN_CONTROLS_SESSION_ID}
          stagePre={{
            stage: "analyze",
            model: castId<ModelId>("test-model"),
            temperature: null,
            maxOutputTokens: 4096,
            inputEstimate: 2736,
            outputEstimate: 1490,
          }}
        />
      </div>
    </CtAppDataProviders>
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
