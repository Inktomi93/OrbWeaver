import { CtIsolation } from "@orb/testkit/browser";
import { Select } from "@orb/ui/select";
import type { SelectItems } from "@orb/ui/select/items";
import type { ReactElement } from "react";

// The theme editor's font picker shape: each option label is painted in the face it names.
const ITEMS: SelectItems = ["Lora", "Georgia"].map((face) => ({ value: face, label: face, labelStyle: { fontFamily: face } }));

export function FontPreviewSelectStory(): ReactElement {
  return (
    <CtIsolation subject="Select" isolates="The font preview declaration on each option label, without the theme editor around it">
      <Select aria-label="Body font" defaultValue="Lora" items={ITEMS} />
    </CtIsolation>
  );
}
