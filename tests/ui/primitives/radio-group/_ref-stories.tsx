import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import type { ReactElement } from "react";
import { useRef } from "react";

export function RadioRefStory({ value = "alpha" }: { readonly value?: string }): ReactElement {
  const group = useRef<HTMLDivElement>(null);
  return (
    <CtIsolation subject="RadioGroup ref" isolates="Controlled native radio focus with a public caller ref">
      <Button onClick={(): void => group.current?.focus()}>Focus group through caller ref</Button>
      <RadioGroup ref={group} tabIndex={-1} aria-label="Controlled radios" value={value}>
        <RadioGroupItem value="alpha" aria-label="Alpha">
          Alpha
        </RadioGroupItem>
        <RadioGroupItem value="beta" aria-label="Beta">
          Beta
        </RadioGroupItem>
      </RadioGroup>
    </CtIsolation>
  );
}
