import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Stack } from "@orb/ui/layout";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import type { ReactElement } from "react";
import { useId, useState } from "react";

export function MacroDescriptionCompositionStory(): ReactElement {
  const callerDescriptionId = useId();
  const [value, setValue] = useState("A traveler arrives.");
  const [showHelper, setShowHelper] = useState(true);
  return (
    <CtIsolation subject="MacroTextarea descriptions" isolates="Native caller descriptions composed with registered Field and macro helper descriptions">
      <Stack>
        <p id={callerDescriptionId}>Authoring context from the caller.</p>
        <Field label="Arrival" description="Registered field guidance.">
          <MacroTextarea
            aria-describedby={callerDescriptionId}
            helper={showHelper ? "Live macro helper." : undefined}
            onChange={setValue}
            suggestions={[]}
            value={value}
          />
        </Field>
        <Button onClick={(): void => setShowHelper(false)}>Hide helper</Button>
      </Stack>
    </CtIsolation>
  );
}
