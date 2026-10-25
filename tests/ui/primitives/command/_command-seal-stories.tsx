import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@orb/ui/command";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef } from "react";

const ROW_COUNT = 60;
const CENTERED_ROW = 40;

/** A caller reaches the real search input through its ref while the seal still owns the correction it keeps on it. */
export function CommandInputRefStory(): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <CtIsolation subject="Command" isolates="The search input's ref and ARIA correction need no feature services.">
      <Button onClick={(): void => inputRef.current?.focus()}>Focus through the ref</Button>
      <Command label="Pick a row" shouldFilter={false}>
        <CommandInput aria-label="Search rows" expanded={false} ref={inputRef} />
        <CommandList listSize="compact">
          <CommandItem value="alpha">Alpha</CommandItem>
        </CommandList>
      </Command>
    </CtIsolation>
  );
}

/** One pane that scrolls around a bounded list whose row 40 asks to be centred in it. */
export function CommandCenterRowStory(): ReactElement {
  return (
    <CtIsolation subject="Command" isolates="Centring a row inside its own list needs no feature services.">
      <Stack className="block-(--height-scroll-sm) overflow-y-auto" data-slot="outer-pane">
        <Button>Above the list</Button>
        <Command label="Pick a row" shouldFilter={false}>
          <CommandInput aria-label="Search rows" />
          <CommandList aria-label="Rows" listSize="compact">
            {Array.from({ length: ROW_COUNT }, (_, index) => (
              <CommandItem centerInList={index === CENTERED_ROW} key={`row-${String(index)}`} value={`row-${String(index)}`}>
                {`Row ${String(index)}`}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </Stack>
    </CtIsolation>
  );
}
