import { CtClientProviders } from "@orb/testkit/browser";
import { FileInput, Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";

/** The file-import glyph as the design system draws it, alone: the markup a door that wears it must match. */
export function FileInputGlyphStory(): ReactElement {
  return (
    <CtClientProviders>
      <Icon icon={FileInput} label="File-import glyph" size="sm" />
    </CtClientProviders>
  );
}
