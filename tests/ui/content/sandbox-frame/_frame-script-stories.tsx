import { CtIsolation } from "@orb/testkit/browser";
import { holdsScript } from "@orb/ui/sandbox-frame";
import type { ReactElement } from "react";

/** Each markup's answer, stamped on its own output in order, so a spec reads what the production read decided. */
export function FrameScriptStory({ cases }: { readonly cases: readonly string[] }): ReactElement {
  return (
    <CtIsolation subject="holdsScript" isolates="The host's read of framed markup for script its controls need, without a frame">
      {cases.map((html, index) => (
        <output key={String(index)} data-slot="frame-script-case" data-holds={String(holdsScript(html))} />
      ))}
    </CtIsolation>
  );
}
