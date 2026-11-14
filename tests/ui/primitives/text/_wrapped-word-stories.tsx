import { CtIsolation } from "@orb/testkit/browser";
import { Heading } from "@orb/ui/text";
import type { ReactElement } from "react";

/** A heading set with the word-wrap axis, in a pane of a fixed width narrower than its one long word. */
export function WrappedWordStory({ width, word }: { readonly width: number; readonly word: string }): ReactElement {
  return (
    <CtIsolation subject="Text" isolates="How a heading breaks a word wider than its pane needs no application services.">
      <div style={{ inlineSize: width }}>
        <Heading level={2} wrap="word">
          {word}
        </Heading>
      </div>
    </CtIsolation>
  );
}
