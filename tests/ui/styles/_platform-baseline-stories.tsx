import { CtIsolation } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** Raw elements with no utility classes: only the base layer answers for them. */
export function PlatformBaselineStory(): ReactElement {
  return (
    <CtIsolation subject="Platform baseline" isolates="The element defaults the browser's own rendering honours">
      <h2>A short heading that should break into even lines</h2>
      <button type="button">Press</button>
      <a href="#target">Read the release notes</a>
      <input aria-label="native box" type="checkbox" />
      <button className="touch-none" type="button">
        Pan surface
      </button>
    </CtIsolation>
  );
}
