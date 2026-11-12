import { CtIsolation } from "@orb/testkit/browser";
import { Combobox } from "@orb/ui/combobox";
import { CONTROL_SIZES } from "@orb/ui/lib";
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

/** Committed chips in a field at every step of the control scale, each field in a fixed cell. */
export function ChipInsetStory(): ReactElement {
  return (
    <CtIsolation subject="Combobox" isolates="The chip box inside the field at each control step, free of feature layout.">
      <div style={{ display: "grid", gap: "1rem", padding: "1rem", inlineSize: "24rem" }}>
        {CONTROL_SIZES.map((step) => (
          <div key={step} data-step={step}>
            <Combobox aria-label={`Keywords ${step}`} defaultValue={["ember", "cinder"]} size={step} />
          </div>
        ))}
      </div>
    </CtIsolation>
  );
}

/** Committed chips wrapping onto a second line in a narrow cell, so a remove target has a neighbour beside it and one below. */
export function ChipRemoveTargetsStory(): ReactElement {
  return (
    <CtIsolation subject="Combobox" isolates="The chip remove hit areas against the next chip, the wrapped line and the draft input, free of feature layout.">
      <div style={{ padding: "1rem", inlineSize: "17rem" }}>
        <Combobox aria-label="Keywords" defaultValue={["ember", "cinder", "ash", "pewter", "umber", "ochre"]} />
      </div>
    </CtIsolation>
  );
}

/** A field in a pane of a fixed pixel width, so a rem-sized minimum in the field can outgrow the pane at enlarged text. */
export function NarrowPaneStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtIsolation subject="Combobox" isolates="The draft input's minimum width against its pane at enlarged text, free of feature layout.">
      <div data-slot="narrow-pane" style={{ inlineSize: width }}>
        <Combobox aria-label="Keywords" defaultValue={["ember", "cinder"]} />
      </div>
    </CtIsolation>
  );
}
