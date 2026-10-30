import { CtIsolation } from "@orb/testkit/browser";
import { ColorField } from "@orb/ui/color-field";
import type { ReactElement } from "react";
import { useState } from "react";

/** The caller side of the seal: it keeps the committed value and counts every commit it is told about. */
export function CommittedColorStory({ initial, disabled }: { readonly initial: string; readonly disabled: boolean }): ReactElement {
  const [value, setValue] = useState(initial);
  const [commits, setCommits] = useState(0);
  return (
    <CtIsolation subject="ColorField" isolates="The draft, commit gate and clear sentinel are the seal's own logic between its inputs and the caller.">
      <ColorField
        aria-label="Accent"
        disabled={disabled}
        onValueChange={(next): void => {
          setValue(next);
          setCommits(commits + 1);
        }}
        resetLabel="Clear accent"
        value={value}
      />
      <output aria-label="Committed color">{value}</output>
      <output aria-label="Commit count">{commits}</output>
    </CtIsolation>
  );
}
