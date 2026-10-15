import type { PayloadLaneProps } from "@orb/client/features/refinery";
import { PayloadLane, SchemaEditorDialog } from "@orb/client/features/refinery";
import { CtClientProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import type { ReactElement } from "react";

export function PayloadOwnerStory({ run }: { readonly run: NonNullable<PayloadLaneProps["run"]> }): ReactElement {
  return (
    <CtClientProviders>
      <PayloadLane stage={run.stage} run={run} running={false} viewingBack={false} behind={null} onBackToLatest={(): void => undefined} />
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
