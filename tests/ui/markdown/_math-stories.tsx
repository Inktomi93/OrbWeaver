import { CtIsolation } from "@orb/testkit/browser";
import { Markdown } from "@orb/ui/markdown";
import type { ComponentProps, ReactElement } from "react";

/** The Markdown door rendering the source a case passes. */
export function MathStory(props: ComponentProps<typeof Markdown>): ReactElement {
  return (
    <CtIsolation subject="Markdown math" isolates="The Markdown renderer alone, without a message row or a room">
      <Markdown {...props} />
    </CtIsolation>
  );
}
