import { CtIsolation } from "@orb/testkit/browser";
import { holdsExternalMedia } from "@orb/ui/sandbox-frame";
import type { ReactElement } from "react";

export interface ExternalMediaCase {
  readonly html: string;
  readonly css?: string;
}

/** Each case's answer, stamped on its own output in order, so a spec reads what the production read decided. */
export function ExternalMediaStory({ cases }: { readonly cases: readonly ExternalMediaCase[] }): ReactElement {
  return (
    <CtIsolation subject="holdsExternalMedia" isolates="The host's read of framed markup for external media, without a frame">
      {cases.map((entry, index) => (
        <output key={String(index)} data-slot="external-media-case" data-holds={String(holdsExternalMedia(entry.html, entry.css))} />
      ))}
    </CtIsolation>
  );
}
