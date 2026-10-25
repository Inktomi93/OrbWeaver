import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

export function SelectTriggerRefStory(): ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(true);
  const [ownership, setOwnership] = useState("Unchecked");
  return (
    <CtIsolation subject="Select" isolates="The trigger ref and native keyboard behavior need no application services.">
      <Button onClick={(): void => triggerRef.current?.focus()}>Return to picker</Button>
      <Button onClick={(): void => setMounted(!mounted)}>Toggle picker</Button>
      <Button onClick={(): void => setOwnership(triggerRef.current === null ? "Released" : "Attached")}>Inspect trigger</Button>
      <Text role="status">{ownership}</Text>
      {mounted ? (
        <Select
          aria-label="Choice"
          items={[
            { label: "Alpha", value: "alpha" },
            { label: "Beta", value: "beta" },
          ]}
          defaultValue="alpha"
          triggerRef={triggerRef}
        />
      ) : null}
    </CtIsolation>
  );
}
