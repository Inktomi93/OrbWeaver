// radio-group CT fixtures (a CT mounts ONLY from a non-test module): a group whose value is set from OUTSIDE
// the radios, the way a "set all" button drives it.

import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import type { ReactElement } from "react";
import { useState } from "react";

export function ExternallyControlledRadioGroup(): ReactElement {
  const [value, setValue] = useState("merge");
  return (
    <>
      <button type="button" onClick={(): void => setValue("keep")}>
        Keep all
      </button>
      <RadioGroup aria-label="Persona collision" value={value} onValueChange={(next): void => setValue(String(next))}>
        <RadioGroupItem value="merge">Merge</RadioGroupItem>
        <RadioGroupItem value="keep">Keep both</RadioGroupItem>
      </RadioGroup>
    </>
  );
}
