import { MutedLine } from "@orb/client/data";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { MUTED_LINE_STORY } from "./_muted-line-labels.ts";

/** The production muted line with its action, as a filter miss under a search box draws it; the action counts its presses. */
export function MutedLineStory({ announce }: { readonly announce: boolean }): ReactElement {
  const [presses, setPresses] = useState(0);
  return (
    <CtClientProviders>
      <Container>
        <MutedLine
          action={{ label: MUTED_LINE_STORY.action, onAction: (): void => setPresses((count) => count + 1) }}
          announce={announce}
          data-presses={presses}
          data-testid={MUTED_LINE_STORY.testId}
        >
          {MUTED_LINE_STORY.line}
        </MutedLine>
      </Container>
    </CtClientProviders>
  );
}
