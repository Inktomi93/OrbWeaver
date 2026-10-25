import { CtIsolation } from "@orb/testkit/browser";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";

const OPENING = "one\ntwo\nthree";

export function AutosizeTextareaStory(): ReactElement {
  return (
    <CtIsolation subject="Textarea" isolates="Autosize between its row bounds is the primitive's own measurement, independent of application data.">
      <div style={{ inlineSize: "24rem" }}>
        <Textarea aria-label="Notes" defaultValue={OPENING} maxRows={5} rows={2} />
      </div>
    </CtIsolation>
  );
}

const SIX_LINES = "a\nb\nc\nd\ne\nf";

export function FixedInlineHeightStory(): ReactElement {
  return (
    <CtIsolation subject="Textarea" isolates="A caller-fixed inline height stops autosize without application composition.">
      <Textarea aria-label="Fixed inline" defaultValue={SIX_LINES} style={{ height: "40px" }} />
    </CtIsolation>
  );
}

export function FixedClassHeightStory(): ReactElement {
  return (
    <CtIsolation subject="Textarea" isolates="A caller-fixed class height stops autosize without application composition.">
      <Textarea aria-label="Fixed class" className="block-(--size-control-lg)" defaultValue={SIX_LINES} />
    </CtIsolation>
  );
}

export function ClassFixedLaterStory(): ReactElement {
  const [fixed, setFixed] = useState(false);
  return (
    <CtIsolation subject="Textarea" isolates="A height fixed after mount hands the box back from autosize, independent of application data.">
      <div>
        <button onClick={(): void => setFixed(!fixed)} type="button">
          Toggle fixed height
        </button>
        <Textarea aria-label="Fixed later" className={fixed ? "block-(--size-control-lg)" : ""} defaultValue={SIX_LINES} />
      </div>
    </CtIsolation>
  );
}
