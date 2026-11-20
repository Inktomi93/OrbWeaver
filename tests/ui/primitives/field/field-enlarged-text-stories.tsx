import { CtIsolation } from "@orb/testkit/browser";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import type { ReactElement } from "react";

/** A horizontal Field in a popup, which shrink-wraps its content and so is no size container for the Field's own steps. */
export function PopoverFieldStory(): ReactElement {
  return (
    <CtIsolation subject="Field" isolates="The control column of a horizontal Field against the popup that holds it at enlarged text">
      <Popover>
        <PopoverTrigger>Pick color</PopoverTrigger>
        <PopoverPopup>
          <Field label="Rim shade" orientation="horizontal">
            <Input defaultValue="#ffaa00" />
          </Field>
        </PopoverPopup>
      </Popover>
    </CtIsolation>
  );
}
