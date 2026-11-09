import { Band } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Archive } from "@orb/ui/icons";
import type { ReactElement } from "react";

/** A band with a label, a census and a state mark, named as the config list names it: the words in DOM order, space-separated. */
export function BandNameStory({ label, count, mark }: { readonly label: string; readonly count: number; readonly mark: string }): ReactElement {
  return (
    <CtIsolation subject="Band" isolates="The band's label, census and mark against its accessible name need no application data.">
      <Band
        aria-label={`${label} ${String(count)} ${mark}`}
        chevron="closed"
        count={count}
        icon={Archive}
        label={label}
        marks={
          <Badge data-slot="band-name-mark" size="compact">
            {mark}
          </Badge>
        }
      />
    </CtIsolation>
  );
}
