import { CtIsolation } from "@orb/testkit/browser/ct-isolated-subject.tsx";
import { Container } from "@orb/ui/layout";
import type { RadioGroupPickerItemProps } from "@orb/ui/radio-group";
import { RadioGroupPicker, RadioGroupPickerItem } from "@orb/ui/radio-group";
import type { ReactElement } from "react";
import { useId, useState } from "react";

const OPTIONS = [
  { value: "one", label: "One", description: "The first option, with a description long enough to wrap onto several lines in a narrow cell." },
  { value: "two", label: "Two", description: "Short." },
  { value: "three", label: "Three" },
] as const;

export function PickerNativePartsStory({
  width = 480,
  detail = false,
  shape,
}: {
  readonly width?: number;
  readonly detail?: boolean;
  readonly shape?: RadioGroupPickerItemProps["shape"];
}): ReactElement {
  const id = useId();
  const [value, setValue] = useState("one");
  return (
    <CtIsolation subject="RadioGroupPicker" isolates="Public picture-choice composition of native radios and the shared PickerCell frame">
      <Container style={{ width }}>
        <RadioGroupPicker aria-label="Sample picker" detail={detail} value={value} onValueChange={setValue}>
          {OPTIONS.map((option) => (
            <RadioGroupPickerItem
              key={option.value}
              value={option.value}
              label={option.label}
              idPrefix={`${id}-${option.value}`}
              shape={shape}
              {...("description" in option ? { description: option.description } : {})}
            />
          ))}
        </RadioGroupPicker>
      </Container>
    </CtIsolation>
  );
}
