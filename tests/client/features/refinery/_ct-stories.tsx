// Refinery R2 data-tier CT stories (core/Spine-Testing.md §7 — a CT mounts ONLY from a non-test module).
//
// R3 (the refinery SURFACE) is design-gated on the owner's mockup ruling, so there is no production surface
// to drive the R2 hooks through yet. This probe is that surface's stand-in and NOTHING more: it mounts the
// REAL hooks from the feature front door, through the REAL app QueryClient (`CtAppDataProviders` — the one
// whose MutationCache `meta.errorToast` IS the `notify` channel) and the real toast surface, over a network
// stubbed at `page.route`. Every observable the CTs assert is either rendered text the hooks produced or a
// wire call `routeTrpc` counted — never a hand-mock of a hook.
//
// The id props stay BRANDED across the CT process boundary. A brand is compile-time only, so a branded id
// serializes as the plain string it already is — and the `.ct.tsx` MINTS them (`mintTypeId(ID_PREFIX.x)`,
// never a hand-written literal), so nothing here has to `castId` a made-up string back into a brand. That is
// the honest form of the `CharacterCardTileStory` note, not a departure from it: that story takes plain
// strings because its ids come from a fixture's display data, not from a mint.

import { useInvalidation, useTRPC } from "@orb/client/data";
import type { ReviewEntry, StageCell } from "@orb/client/features/refinery";
import {
  AcceptReview,
  BUILTIN_STAGE_HINTS,
  buildRenderPlan,
  PayloadView,
  RefineryListHeader,
  RefineryListSurface,
  SchemaEditorDialog,
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
import type { RefinerySchemaStage, RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySchemaId, RefinerySessionId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { CompareDecision } from "@orb/ui/compare-blocks";
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

// --- The HERO COUNT-UP ramp (the money shot) ---

export interface HeroRampStoryProps {
  /** The payload the pane opens with. `null` = the pane opens PENDING with no payload, i.e. the
   *  plan-shaped skeleton — the first-run arm, where the count-up is supposed to run 0 → score. */
  readonly from: number | null;
  /** The score that lands when "land" is pressed. */
  readonly to: number;
}

/** The hero gauge's count-up, driven by a PRESS rather than a timer: the CT clicks "land" and then
 *  reads every value the numeral printed (a MutationObserver in the test), so the ramp is proven by the
 *  frames it actually painted instead of by racing one. */
export function HeroRampStory({ from, to }: HeroRampStoryProps): ReactElement {
  const [score, setScore] = useState<number | null>(from);
  const plan = buildRenderPlan(projectJsonSchema(REFINERY_STAGE_PAYLOADS.score), BUILTIN_STAGE_HINTS.score);
  return (
    <div>
      <button onClick={(): void => setScore(to)} type="button">
        land
      </button>
      <PayloadView payload={score === null ? {} : { overallScore: score, summary: "A solid card." }} pending={score === null} plan={plan} />
    </div>
  );
}

// --- The stage stepper's RUNNING arm (the indeterminate hairline + its reduced-motion opt-out) ---

export interface StageStepperStoryProps {
  readonly cells: readonly StageCell[];
  readonly active: RefineryStage;
}

/** The stepper at a chosen state — the running cell carries the indeterminate hairline whose whole
 *  reduced-motion contract is that the travelling segment is REMOVED, not parked. */
export function StageStepperStory({ cells, active }: StageStepperStoryProps): ReactElement {
  return <StageStepper active={active} cells={cells} onSelect={(): void => undefined} />;
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
