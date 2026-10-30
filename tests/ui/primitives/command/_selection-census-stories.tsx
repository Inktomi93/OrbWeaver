import { CtIsolation } from "@orb/testkit/browser";
import { Command, CommandInput, CommandItem, CommandList } from "@orb/ui/command";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The real cmdk serializer supplies both true and false selection attributes. */
export function CommandSelectionCensusStory(): ReactElement {
  return (
    <CtIsolation subject="Command selection census" isolates="Selection attribute serialization and computed paint need no feature services.">
      <Container style={{ inlineSize: 320 }}>
        <Command label="Census choices" value="alpha" shouldFilter={false}>
          <CommandInput aria-label="Search census choices" />
          <CommandList aria-label="Census choices">
            <CommandItem value="alpha">Alpha</CommandItem>
            <CommandItem value="beta">Beta</CommandItem>
            <CommandItem value="gamma">Gamma</CommandItem>
          </CommandList>
        </Command>
      </Container>
    </CtIsolation>
  );
}
