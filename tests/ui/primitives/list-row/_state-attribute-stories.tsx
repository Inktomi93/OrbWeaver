import { CtIsolation } from "@orb/testkit/browser";
import { ListRow } from "@orb/ui/list-row";
import type { ReactElement } from "react";
import { useState } from "react";

/** One row per state attribute, and a plain row beside them as the control; a disabled row's click is counted. */
export function StateAttributeStory(): ReactElement {
  const [clicks, setClicks] = useState(0);
  return (
    <CtIsolation subject="ListRow state attributes" isolates="Selected, expanded and disabled rows style and behave from the attributes alone">
      <ListRow clickable={true} title="Plain" />
      <ListRow clickable={true} data-selected="" title="Selected" />
      <ListRow aria-expanded={true} clickable={true} title="Expanded" />
      <ListRow aria-expanded={true} clickable={true} rowTint="row" title="Expanded row tint" />
      <ListRow clickable={true} rowTint="row" title="Plain row tint" />
      <div data-probe="tint" data-tone="neutral" style={{ backgroundColor: "var(--color-tone-tint-active)" }} />
      <ListRow clickable={true} data-disabled="" onClick={(): void => setClicks(clicks + 1)} title="Disabled" />
      <output data-slot="clicks">{clicks}</output>
    </CtIsolation>
  );
}
