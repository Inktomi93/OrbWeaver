import { CtIsolation } from "@orb/testkit/browser";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** The wordmark voice with and without its halo, side by side. */
export function TextHaloStory(): ReactElement {
  return (
    <CtIsolation subject="Text" isolates="A halo adds a text shadow and nothing else: the voice's type step and line height stay">
      <Text as="span" voice="monogram" data-case="plain">
        orbweaver
      </Text>
      <Text as="span" voice="monogram" halo={true} data-case="halo">
        orbweaver
      </Text>
    </CtIsolation>
  );
}
