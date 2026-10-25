import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";

const OPENING = "one\ntwo\nthree";

export function AutosizeTextareaStory(): ReactElement {
  return (
    <div style={{ inlineSize: "24rem" }}>
      <Textarea aria-label="Notes" defaultValue={OPENING} maxRows={5} rows={2} />
    </div>
  );
}
