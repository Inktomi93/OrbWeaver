import { CtIsolation } from "@orb/testkit/browser";
import { Combobox } from "@orb/ui/combobox";
import type { ReactElement } from "react";
import { useState } from "react";

/** Free-text chip entry with no suggestion popup; the caller keeps the chips and a count of the changes it was told about. */
export function FreeTextChipsStory({ maxItems }: { readonly maxItems?: number }): ReactElement {
  const [chips, setChips] = useState<readonly string[]>([]);
  const [changes, setChanges] = useState(0);
  return (
    <CtIsolation subject="Combobox" isolates="Free-text commit, split, dedupe and the cap are the seal's own logic around Base UI's chip list.">
      <Combobox
        aria-label="Keywords"
        {...(maxItems === undefined ? {} : { maxItems })}
        onValueChange={(next): void => {
          setChips(next);
          setChanges(changes + 1);
        }}
        value={chips}
      />
      <output aria-label="Committed chips">{chips.join("|")}</output>
      <output aria-label="Change count">{changes}</output>
    </CtIsolation>
  );
}

/** A parent that re-renders and hands the seal freshly derived arrays every time (the collection-prop shape). */
export function RerenderingParentStory(): ReactElement {
  const [chips, setChips] = useState<readonly string[]>(["ember"]);
  const [renders, setRenders] = useState(0);
  return (
    <CtIsolation subject="Combobox" isolates="A fresh array identity on every parent render must not drop chips or the draft.">
      <button onClick={(): void => setRenders(renders + 1)} type="button">
        Rerender parent
      </button>
      <output aria-label="Parent renders">{renders}</output>
      <Combobox aria-label="Keywords" items={["ash", "cinder"].map((item) => item)} onValueChange={(next): void => setChips(next)} value={[...chips]} />
      <output aria-label="Committed chips">{chips.join("|")}</output>
    </CtIsolation>
  );
}
