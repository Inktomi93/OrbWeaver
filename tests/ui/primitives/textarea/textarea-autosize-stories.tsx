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

const SIX_LINES = "a\nb\nc\nd\ne\nf";

export function FixedInlineHeightStory(): ReactElement {
  return <Textarea aria-label="Fixed inline" defaultValue={SIX_LINES} style={{ height: "40px" }} />;
}

export function FixedClassHeightStory(): ReactElement {
  return <Textarea aria-label="Fixed class" className="block-(--size-control-lg)" defaultValue={SIX_LINES} />;
}
