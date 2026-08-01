// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome forbids
// exporting a component from a `.ct.tsx`). A `LucideIcon` is a FUNCTION: it does not survive the CT prop
// wire (only plain data crosses), so the icon is bound HERE, in the module that executes in the browser —
// the same "build the non-serializable shape inside the story" rule the chat/character stories follow.
//
// The harness owns the pressed state so a click is observable as a real state flip (`aria-pressed` + the
// name flip), and mirrors the toggle count into a marker so the CT asserts the HANDLER fired, not a repaint.

import { RowToggleAction } from "@orb/client/components";
import { Star } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useState } from "react";

export interface RowToggleActionHarnessProps {
  /** @defaultValue false */
  readonly initialPressed?: boolean;
  /** @defaultValue "when-on" (the D11 list posture) */
  readonly rest?: "always" | "when-on";
}

/** One star toggle inside a `group` row root (what `ROW_REVEAL` keys on), plus a fired-count marker. */
export function RowToggleActionHarness({ initialPressed = false, rest = "when-on" }: RowToggleActionHarnessProps): ReactElement {
  const [pressed, setPressed] = useState(initialPressed);
  const [toggles, setToggles] = useState(0);
  return (
    <div className="group">
      <RowToggleAction
        icon={Star}
        labelOff="Star Mara"
        labelOn="Unstar Mara"
        onToggle={(): void => {
          setPressed((prev) => !prev);
          setToggles((n) => n + 1);
        }}
        pressed={pressed}
        pressedClassName="text-warning"
        rest={rest}
      />
      <p data-testid="toggle-count">{String(toggles)}</p>
    </div>
  );
}
