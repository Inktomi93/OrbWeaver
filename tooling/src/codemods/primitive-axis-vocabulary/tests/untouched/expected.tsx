import { Button as UiButton } from "@orb/ui/button";
import { NumberField } from "@orb/ui/number-field";
import { Text } from "@orb/ui/text";
import { Toggle as UiToggle } from "@orb/ui/toggle";
import { Button } from "another-library";

// A computed axis, an aliased import, a foreign Button and an unmapped value stay for a hand edit.
export const Untouched = ({ intent, tone }: Props) => (
  <>
    <Button intent="ghost" size="icon">Foreign</Button>
    <UiButton intent="ghost" size="icon">Aliased</UiButton>
    <UiToggle intent="outline">Aliased</UiToggle>
    <Text tone={tone}>Computed</Text>
    <Text tone="muted" ink={ink}>Computed ink</Text>
    <Text tone="sparkle">Unmapped</Text>
    <NumberField size="md" aria-label="Unmapped step" />
  </>
);
