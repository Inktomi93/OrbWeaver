import type { PayloadLaneProps } from "@orb/client/features/refinery";
import { PayloadLane, SchemaEditorDialog } from "@orb/client/features/refinery";
import { setRefineryViewedRun, useRefineryViewedRunId } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useEffect } from "react";

export function PayloadOwnerStory({ run }: { readonly run: NonNullable<PayloadLaneProps["run"]> }): ReactElement {
  return (
    <CtClientProviders>
      <PayloadLane stage={run.stage} run={run} running={false} viewingBack={false} behind={null} onBackToLatest={(): void => undefined} />
    </CtClientProviders>
  );
}

function WalkedBackLane({ run }: { readonly run: NonNullable<PayloadLaneProps["run"]> }): ReactElement {
  const viewedRunId = useRefineryViewedRunId();
  useEffect(() => {
    setRefineryViewedRun(run.id);
  }, [run.id]);
  return (
    <PayloadLane
      stage={run.stage}
      run={run}
      running={false}
      viewingBack={viewedRunId === run.id}
      behind={null}
      onBackToLatest={(): void => setRefineryViewedRun(null)}
    />
  );
}

/** One lane on a run the view-back pin holds, wired to the pin the way the workbench wires its lanes. */
export function PayloadWalkedBackStory({ run }: { readonly run: NonNullable<PayloadLaneProps["run"]> }): ReactElement {
  return (
    <CtClientProviders>
      <WalkedBackLane run={run} />
    </CtClientProviders>
  );
}

export function SchemaPreviewStory(): ReactElement {
  return (
    <CtClientProviders>
      <SchemaEditorDialog open={true} onOpenChange={(): void => undefined} stage="score" editing={null} onSaved={(): void => undefined} />
    </CtClientProviders>
  );
}
