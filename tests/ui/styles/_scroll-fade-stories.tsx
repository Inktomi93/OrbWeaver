import { CtIsolation } from "@orb/testkit/browser";
import { SCROLL_FADE_X_CLASS, SCROLL_FADE_Y_CLASS } from "@orb/ui/lib";
import type { ReactElement } from "react";

/** Both scroll fades on overflowing boxes, with no driver attached: only the stylesheet answers to scrolling. */
export function ScrollFadeStory(): ReactElement {
  return (
    <CtIsolation subject="Scroll fades" isolates="The scroll-timeline arm of the fade recipe, without the data-attribute drivers">
      <section aria-label="vertical" className={`${SCROLL_FADE_Y_CLASS} overflow-y-auto`} style={{ height: 120 }}>
        <div style={{ height: 600 }}>tall</div>
      </section>
      <section aria-label="horizontal" className={`${SCROLL_FADE_X_CLASS} overflow-x-auto`} style={{ width: 200 }}>
        <div style={{ width: 800 }}>wide</div>
      </section>
    </CtIsolation>
  );
}
