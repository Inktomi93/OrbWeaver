import { CtIsolation } from "@orb/testkit/browser";
import { Autocomplete } from "@orb/ui/autocomplete";
import { Button } from "@orb/ui/button";
import { ColorField } from "@orb/ui/color-field";
import { Combobox } from "@orb/ui/combobox";
import { Icon, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import type { ControlSize } from "@orb/ui/lib";
import { CONTROL_SIZES } from "@orb/ui/lib";
import { NumberField } from "@orb/ui/number-field";
import { Select } from "@orb/ui/select";
import { Toggle } from "@orb/ui/toggle";
import type { ReactElement, ReactNode } from "react";

const SELECT_ITEMS = [{ value: "a", label: "Alpha" }];

// A field fills its container, so each sits in a fixed cell; `flex-start` keeps the row from stretching any control.
function Cell({ children }: { readonly children: ReactNode }): ReactElement {
  return <div style={{ inlineSize: "10rem" }}>{children}</div>;
}

/** One row of every control the scale reaches, all at one step. */
function ScaleRow({ step, odd }: { readonly step: ControlSize; readonly odd?: ControlSize }): ReactElement {
  return (
    <div data-step={step} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "1rem" }}>
      <Button size={step}>Save</Button>
      <Button aria-label={`Add ${step}`} size={step} square={true} variant="ghost">
        <Icon icon={Plus} size="xs" />
      </Button>
      <Button size={step} variant="outline" wrap={true}>
        Wrap
      </Button>
      <Toggle size={step} variant="outline">
        Scope
      </Toggle>
      <Cell>
        <Input aria-label={`Text ${step}`} size={step} />
      </Cell>
      <Cell>
        <Select aria-label={`Pick ${step}`} defaultValue="a" items={SELECT_ITEMS} size={step} />
      </Cell>
      <Cell>
        <NumberField aria-label={`Count ${step}`} defaultValue={3} size={step} />
      </Cell>
      <Cell>
        <Combobox aria-label={`Tags ${step}`} size={step} />
      </Cell>
      <Cell>
        <Autocomplete aria-label={`Find ${step}`} items={["Alpha"]} size={step} />
      </Cell>
      <ColorField aria-label={`Colour ${step}`} onValueChange={(): void => undefined} size={step} value="#336699" />
      {odd === undefined ? null : (
        <Cell>
          <Input aria-label={`Planted ${odd}`} size={odd} />
        </Cell>
      )}
    </div>
  );
}

/** Every step of the control scale, one row each. */
export function ControlScaleStory(): ReactElement {
  return (
    <CtIsolation subject="The D336 control scale" isolates="Button, Toggle and the field primitives at each step, in rows free of feature layout">
      <div style={{ display: "grid", gap: "2rem", padding: "2rem" }}>
        {CONTROL_SIZES.map((step) => (
          <ScaleRow key={step} step={step} />
        ))}
      </div>
    </CtIsolation>
  );
}

/** The `sm` row with one control planted at another step: the measure must report two heights. */
export function PlantedStepStory({ odd }: { readonly odd: ControlSize }): ReactElement {
  return (
    <CtIsolation subject="A planted wrong step" isolates="one field at a foreign step inside the sm row">
      <div style={{ padding: "2rem" }}>
        <ScaleRow odd={odd} step="sm" />
      </div>
    </CtIsolation>
  );
}
