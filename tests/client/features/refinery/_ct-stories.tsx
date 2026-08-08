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
import {
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
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import type { ReactElement } from "react";
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
      <button type="button" onClick={(): void => apply.mutate({ sessionId, accepts: [{ field: "description" }] })}>
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
