import { CtIsolation } from "@orb/testkit/browser";
import { Row } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";

const LONG_LINE = "A line far longer than the narrow row it sits in, written so that it can only fit by being clipped with an ellipsis";

/** Each clipped-line arm as a flex child of a narrow row, beside a sibling that must keep its width. */
export function TextTruncateStory(): ReactElement {
  return (
    <CtIsolation subject="Text" isolates="A clipped line shrinks to the room a row leaves it, with no min-inline-0 beside it">
      <div style={{ inlineSize: "16rem" }}>
        <Row data-case="fill" gap="field">
          <Text truncate="fill">{LONG_LINE}</Text>
          <span data-sibling="fill" style={{ flex: "none", inlineSize: "4rem" }}>
            sibling
          </span>
        </Row>
        <Row data-case="plain" gap="field">
          <Text truncate={true}>{LONG_LINE}</Text>
          <span data-sibling="plain" style={{ flex: "none", inlineSize: "4rem" }}>
            sibling
          </span>
        </Row>
        <Row data-case="heading" gap="field">
          <Heading level={3} truncate="fill">
            {LONG_LINE}
          </Heading>
          <span data-sibling="heading" style={{ flex: "none", inlineSize: "4rem" }}>
            sibling
          </span>
        </Row>
      </div>
    </CtIsolation>
  );
}
