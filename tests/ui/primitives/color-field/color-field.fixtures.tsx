// Story wrapper for color-field CT (CT mounts from a non-test module). Reproduces the real
// controlled-consumer shape: the parent owns `value` and passes the committed color back down,
// while `<Field>` supplies the outer label the swatch trigger registers with.
import { ColorField } from "@orb/ui/color-field";
import { Field } from "@orb/ui/field";
import type { ReactElement } from "react";
import { useState } from "react";

export interface ColorFieldHarnessProps {
  initialValue?: string;
}

export function ColorFieldHarness({
  initialValue = "#f4a261",
}: ColorFieldHarnessProps): ReactElement {
  const [value, setValue] = useState(initialValue);
  return (
    <div>
      <span data-testid="committed-value">{value}</span>
      <Field label="Accent">
        <ColorField onValueChange={setValue} value={value} />
      </Field>
    </div>
  );
}
