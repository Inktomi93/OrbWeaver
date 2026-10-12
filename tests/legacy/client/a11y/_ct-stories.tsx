// a11y CT stories — the PRIMITIVE-FAMILY accname probe (#1621).
//
// Not a feature story: one instance of every `@orb/ui` control family that appears with an `aria-label`
// INSIDE a `<Field>` somewhere in `packages/client/src`, each mounted in exactly that shape and each given
// two DIFFERENT names — the Field's visible `label` and the control's own `aria-label`. Which one the
// accessibility tree reports is then a measurement rather than a belief, per family, and that is the whole
// question #1587 left open for the eight non-Input families.
//
// The Field labels and the aria-labels are deliberately disjoint strings ("… group" vs "… own"): if the two
// agreed, a passing assertion would prove nothing about which one won.
//
// No providers beyond the harness's own (`playwright/index.tsx` → `CtProviders`) — these are @orb/ui
// primitives, so a `CtDataProviders` stack here would only add a tRPC client nothing calls.

import { Combobox } from "@orb/ui/combobox";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Textarea } from "@orb/ui/textarea";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useState } from "react";

const SELECT_ITEMS = [
  { label: "First", value: "first" },
  { label: "Second", value: "second" },
];

/** Every family in ONE mount — the tree is read once and every family's verdict comes out of the same
 *  snapshot, so no family's result can be an artifact of a different mount's chrome. */
export function FieldControlNameStory(): ReactElement {
  const [selectValue, setSelectValue] = useState("first");
  const [numberValue, setNumberValue] = useState<number | null>(3);
  const [switchOn, setSwitchOn] = useState(false);
  const [comboValue, setComboValue] = useState<readonly string[]>([]);
  const [segment, setSegment] = useState("first");
  const [text, setText] = useState("");
  return (
    <Stack gap="block">
      {/* The POSITIVE CONTROL. #1587 measured this family and removed five dead attributes on the strength
          of it, so a run in which the Input answers to "Input own" is a run whose method is broken. */}
      <Field label="Input group">
        <Input aria-label="Input own" onValueChange={setText} value={text} />
      </Field>
      <Field label="Textarea group">
        <Textarea aria-label="Textarea own" onValueChange={setText} value={text} />
      </Field>
      <Field label="Select group">
        <Select aria-label="Select own" items={SELECT_ITEMS} onValueChange={(next: string | null): void => setSelectValue(next ?? "")} value={selectValue} />
      </Field>
      <Field label="NumberField group">
        <NumberField aria-label="NumberField own" onValueChange={setNumberValue} value={numberValue} />
      </Field>
      <Field label="Switch group" orientation="horizontal">
        <Switch aria-label="Switch own" checked={switchOn} onCheckedChange={setSwitchOn} />
      </Field>
      <Field label="Combobox group">
        <Combobox aria-label="Combobox own" onValueChange={setComboValue} placeholder="Type a keyword" value={comboValue} />
      </Field>
      <Field label="ToggleGroup group">
        <ToggleGroup
          aria-label="ToggleGroup own"
          onValueChange={(next): void => {
            const picked = next[0];
            if (picked !== undefined) {
              setSegment(picked);
            }
          }}
          value={[segment]}
        >
          <Toggle aria-label="Toggle own" intent="outline" value="first">
            First
          </Toggle>
          <Toggle intent="outline" value="second">
            Second
          </Toggle>
        </ToggleGroup>
      </Field>
    </Stack>
  );
}
