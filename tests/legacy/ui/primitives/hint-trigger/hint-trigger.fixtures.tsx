// Fixtures for hint-trigger.ct.tsx — playwright-ct mounts only components imported from a module
// (an inline component in the test file never reaches the CT registry), and useUniqueElementIds
// demands minted ids, so the labeled-sibling anatomy lives here.
import { HintTrigger } from "@orb/ui/hint-trigger";
import type { ReactElement } from "react";
import { useId } from "react";

/** Sibling anatomy: label → HintTrigger → control (the shape field.tsx/section.tsx enforce), ids
 *  minted per mount via useId. */
export const LabeledFixture = (): ReactElement => {
  const inputId = useId();
  return (
    <span>
      <label htmlFor={inputId}>Notes</label>
      <HintTrigger className="test-trigger" hint="Visible only to you" subject="Notes" />
      <input id={inputId} type="text" />
    </span>
  );
};
