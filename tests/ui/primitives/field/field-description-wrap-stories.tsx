import { CtIsolation } from "@orb/testkit/browser";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

// A value with no break point, as a pasted address or a model id reads: at a phone's largest text it is wider than the screen.
const UNBROKEN_VALUE = "https://example.test/v1/chat/completions/stream/with/a/path/no/break/point";

/** A Field whose description holds one unbroken value, in a pane that scrolls sideways when something outgrows it. */
export function UnbrokenDescriptionStory(): ReactElement {
  return (
    <CtIsolation subject="Field" isolates="A description with no break point inside a settings pane at enlarged text">
      <Stack className="overflow-x-auto" data-probe="pane">
        <Field label="Endpoint" description={UNBROKEN_VALUE}>
          <Input defaultValue="primary" />
        </Field>
      </Stack>
    </CtIsolation>
  );
}
