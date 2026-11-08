import { useReportSaveStatus } from "@orb/client/forms";
import type { ConfigGroupId, SaveLifecycleState } from "@orb/client/state";
import { openConfigTo, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

function ConfigPane(): ReactElement {
  const definition = useSectionRegistry().get("config");
  if (typeof definition.content !== "function") {
    throw new Error("The production settings section has no content renderer");
  }
  return <>{definition.content()}</>;
}

/** One more section reporting through the production seam hook, as a section whose own form holds its write does. */
function ReportingSection({ id, state }: { readonly id: string; readonly state: SaveLifecycleState }): null {
  useReportSaveStatus(id, state);
  return null;
}

/** The production settings content opened on one pane, with its own aggregate save footer. */
export function ConfigSaveFooterStory({
  group,
  report,
}: {
  readonly group: ConfigGroupId;
  readonly report?: { readonly id: string; readonly state: SaveLifecycleState };
}): ReactElement {
  openConfigTo(group);
  return (
    <CtClientProviders>
      {report === undefined ? null : <ReportingSection id={report.id} state={report.state} />}
      <Container style={{ blockSize: 800, inlineSize: 900, display: "flex" }}>
        <ConfigPane />
      </Container>
    </CtClientProviders>
  );
}
