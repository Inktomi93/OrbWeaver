import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Dialog, DialogFooter, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Toggle } from "@orb/ui/toggle";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const BODY_LINES = Array.from({ length: 40 }, (_, line) => `Line ${line + 1} of a body that is taller than the dialog.`);

/** A column that scrolls sideways when a control outgrows it, holding labels the walk measured wider than a phone column. */
export function LabelsStory(): ReactElement {
  return (
    <CtIsolation subject="Button and Toggle" isolates="Label wrapping at enlarged text, without the settings pane around the controls">
      <Stack className="overflow-x-auto" data-probe="column" gap="row">
        <Button variant="outline">Start from a theme…</Button>
        <Toggle aria-label="Read the chat first">Read the chat first</Toggle>
        <Button variant="ghost" size="sm">
          Reset all to Inherit
        </Button>
      </Stack>
    </CtIsolation>
  );
}

/** A full dialog whose body is taller than the dialog, so the popup column has less room than its children ask for. */
export function FullDialogStory(): ReactElement {
  return (
    <CtIsolation subject="Dialog" isolates="The title and the foot of a full dialog at enlarged text, without a feature body">
      <Dialog defaultOpen={true}>
        <DialogPopup size="full">
          <DialogTitle truncate={true}>Rewrite the reply</DialogTitle>
          <Stack>
            {BODY_LINES.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </Stack>
          <DialogFooter>
            <Button className="min-inline-(--width-popup-floor)">Fetch and add</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </CtIsolation>
  );
}

/** A row that ends at its trailing edge and holds one control wider than the line. */
export function EndRowStory(): ReactElement {
  return (
    <CtIsolation subject="Row" isolates="End alignment of an over-wide control inside a scroller">
      <Stack className="overflow-x-auto" data-probe="scroller">
        <Row justify="end" data-probe="row">
          <Button className="min-inline-(--width-popup-floor)">Add selected</Button>
        </Row>
      </Stack>
    </CtIsolation>
  );
}

export function PopoverFieldsStory(): ReactElement {
  return (
    <CtIsolation subject="Popover" isolates="The popup's width against the screen at enlarged text, with a field that asks for room">
      <Popover>
        <PopoverTrigger>Pick color</PopoverTrigger>
        <PopoverPopup>
          <Stack>
            <Input aria-label="Hex" defaultValue="#ffaa00" />
            <Input aria-label="Name" defaultValue="A colour with a long name that asks for room" />
          </Stack>
        </PopoverPopup>
      </Popover>
    </CtIsolation>
  );
}

/** Two stepped fields side by side, the way an editor row seats a depth and a role. */
export function NumberRowStory(): ReactElement {
  return (
    <CtIsolation subject="NumberField" isolates="The stepped field's input box at enlarged text, beside a sibling in one row">
      <Stack className="overflow-x-auto" data-probe="column">
        <Row gap="field" align="start">
          <NumberField aria-label="Count" defaultValue={0} min={0} />
          <NumberField aria-label="Priority" defaultValue={100} />
        </Row>
        <span data-probe="control-md" style={{ display: "block", blockSize: `var(${TOKENS["size.control-md"].cssVar})` }} />
      </Stack>
    </CtIsolation>
  );
}
