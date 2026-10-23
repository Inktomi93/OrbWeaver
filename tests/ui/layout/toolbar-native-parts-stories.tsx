import { CtIsolation } from "@orb/testkit/browser";
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarInput, ToolbarLink, ToolbarSeparator } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

export function ToolbarNativePartsStory(): ReactElement {
  const [activations, setActivations] = useState(0);
  return (
    <CtIsolation subject="Toolbar" isolates="Domain-free native keyboard navigation, grouping and text entry">
      <Toolbar aria-label="Document tools">
        <ToolbarGroup aria-label="Formatting">
          <ToolbarButton onClick={(): void => setActivations((count) => count + 1)}>Bold</ToolbarButton>
          <ToolbarButton>Italic</ToolbarButton>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup aria-label="Locked" disabled={true}>
          <ToolbarButton focusableWhenDisabled={false}>Frozen</ToolbarButton>
        </ToolbarGroup>
        <ToolbarLink href="#document-history">Document history</ToolbarLink>
        <ToolbarInput aria-label="Query" />
      </Toolbar>
      <output aria-label="Bold activations">{activations}</output>
    </CtIsolation>
  );
}
