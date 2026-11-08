import { CtIsolation } from "@orb/testkit/browser";
import { ListRow } from "@orb/ui/list-row";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import { useState } from "react";

/** One row per state attribute, and a plain row beside them as the control; the plain row's click is counted, so a handler that never fires reads as zero. */
export function StateAttributeStory(): ReactElement {
  const [clicks, setClicks] = useState(0);
  return (
    <CtIsolation subject="ListRow state attributes" isolates="Selected, expanded and disabled rows style and behave from the attributes alone">
      <ListRow clickable={true} onClick={(): void => setClicks(clicks + 1)} title="Plain" />
      <ListRow clickable={true} data-selected="" title="Selected" />
      <ListRow aria-expanded={true} clickable={true} title="Expanded" />
      <ListRow aria-expanded={true} clickable={true} rowTint="row" title="Expanded row tint" />
      <ListRow clickable={true} rowTint="row" title="Plain row tint" />
      <div data-probe="tint" data-tone="neutral" style={{ backgroundColor: `var(${TOKENS["color.tone-tint-active"].cssVar})` }} />
      <ListRow clickable={true} data-disabled="" title="Disabled" />
      <output data-slot="clicks">{clicks}</output>
    </CtIsolation>
  );
}
