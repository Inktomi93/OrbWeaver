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
import type { ReviewEntry } from "@orb/client/features/refinery";
import {
  AcceptReview,
  BUILTIN_STAGE_HINTS,
  buildRenderPlan,
  PayloadView,
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
import type { RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { CompareDecision } from "@orb/ui/compare-blocks";
import type { ReactElement } from "react";
import { useState } from "react";
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
