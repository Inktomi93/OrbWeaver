import { CtIsolation } from "@orb/testkit/browser";
import { LogViewer } from "@orb/ui/log-viewer";
import type { ReactElement } from "react";

/** Two logs that state their subjects beside one that states none, as the wire viewer stacks its prompt halves. */
export function NamedLogsStory({ subjects }: { readonly subjects: readonly [string, string] }): ReactElement {
  return (
    <CtIsolation subject="LogViewer" isolates="A log's own name and copy control need no application services.">
      <div style={{ inlineSize: 480 }}>
        <LogViewer lines={["first half"]} maxHeight="scrollSm" what={subjects[0]} />
        <LogViewer lines={["second half"]} maxHeight="scrollSm" what={subjects[1]} />
        <LogViewer lines={["no subject"]} maxHeight="scrollSm" />
      </div>
    </CtIsolation>
  );
}
