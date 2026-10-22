import { FlowDialog, PickerDialog, ViewerDialog } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser/ct-isolated-subject.tsx";
import type { ReactElement } from "react";

export function ViewerDialogStory(): ReactElement {
  return (
    <CtIsolation subject="ViewerDialog" isolates="isolates dialog focus containment from authenticated feature data">
      <ViewerDialog defaultOpen={true} title="Recorded content">
        <button type="button">Copy content</button>
      </ViewerDialog>
    </CtIsolation>
  );
}

export function FlowDialogStory(): ReactElement {
  return (
    <CtIsolation subject="FlowDialog" isolates="isolates dialog stage geometry from authenticated feature data">
      <FlowDialog defaultOpen={true} title="Join a room" footer={<button type="button">Continue</button>}>
        <div style={{ height: 1600, flexShrink: 0 }}>Preview</div>
      </FlowDialog>
    </CtIsolation>
  );
}

export function PickerDialogStory(): ReactElement {
  return (
    <CtIsolation subject="PickerDialog" isolates="isolates dialog placement and keyboard dismissal from authenticated feature data">
      <PickerDialog defaultOpen={true} title="Pick an image">
        <input aria-label="Find images" />
        <button type="button">Choose image</button>
      </PickerDialog>
    </CtIsolation>
  );
}
