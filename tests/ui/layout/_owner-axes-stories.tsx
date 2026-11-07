import { CtIsolation } from "@orb/testkit/browser";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";

const LONG_LINE = "A line far longer than any measure it could take, so the cap and nothing else decides where the box ends.".repeat(4);

/** Each owner axis on its production primitive, with a raw reference box where the axis must equal a token. */
export function OwnerAxesStory(): ReactElement {
  return (
    <CtIsolation subject="Owner axes" isolates="Each primitive with its own props, and nothing from a shell">
      <Text data-probe="text-cap-prose" cap="prose">
        {LONG_LINE}
      </Text>
      <Text data-probe="ref-prose" style={{ maxInlineSize: "var(--reading-measure-prose)" }}>
        {LONG_LINE}
      </Text>
      <Heading data-probe="heading-cap-reading" level={2} cap="reading">
        {LONG_LINE}
      </Heading>
    </CtIsolation>
  );
}
