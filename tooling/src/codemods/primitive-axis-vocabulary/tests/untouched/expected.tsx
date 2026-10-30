import { Button as UiButton } from "@orb/ui/button";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { Button } from "another-library";

// A computed axis, an aliased import, a foreign Button, a Toggle intent and an unmapped value stay for a hand edit.
export const Untouched = ({ intent, tone }: Props) => (
  <>
    <Button intent="ghost">Foreign</Button>
    <UiButton intent="ghost">Aliased</UiButton>
    <Toggle intent="outline">Scope</Toggle>
    <Text tone={tone}>Computed</Text>
    <Text tone="muted" ink={ink}>Computed ink</Text>
    <Text tone="sparkle">Unmapped</Text>
  </>
);
