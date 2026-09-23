// `_ct-stories.tsx` — the tracker-blocks CT story module (docs/law/Spine-Testing.md §7: a CT only mounts
// from a NON-test module). One story so far: the TWO-WRITER scenario for the tracker value cell (#1485),
// which the tracker-blocks CT cannot express by mounting the primitive directly — it needs a parent that
// changes the value WHILE the editor is open.
//
// THE "ARRIVE" BUTTON PREVENTS ITS OWN MOUSEDOWN DEFAULT ON PURPOSE. A normal click would move focus off
// the open input, and the resulting BLUR would commit before the new value ever landed — the story would
// then exercise the ordinary commit path and pass against the bug. Suppressing the mousedown default keeps
// focus in the field, so the value genuinely changes underneath a live edit, which is the whole scenario.

import { TrackerValue } from "@orb/client/components";
import type { ReactElement } from "react";
import { useState } from "react";

/** The value arrives from elsewhere (a model write, another seat) while the user has the field open. */
export function TrackerValueTwoWriters(): ReactElement {
  const [value, setValue] = useState("24");
  // What `onEdit` was actually called with — the assert-the-mutation-fired channel. "none" = never called.
  const [committed, setCommitted] = useState("none");
  return (
    <div>
      <TrackerValue
        ariaLabel="Vitality value"
        display={value}
        onEdit={(next): void => {
          setCommitted(next);
          setValue(next);
        }}
      />
      <output data-testid="tracker-value-committed">{committed}</output>
      <button
        type="button"
        onClick={(): void => setValue("31")}
        onMouseDown={(e): void => {
          e.preventDefault(); // keep focus in the open editor — see the header
        }}
      >
        arrive 31
      </button>
    </div>
  );
}
