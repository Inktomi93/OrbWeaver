import { CtIsolation } from "@orb/testkit/browser";
import { Input } from "@orb/ui/input";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";

/** The text fields a thumb focuses: iOS zooms the page into any field set below 16px. */
export function FieldFloorStory(): ReactElement {
  return (
    <CtIsolation subject="Field floor" isolates="The shipped text fields at a coarse pointer">
      <Input aria-label="single line" />
      <Textarea aria-label="multi line" />
    </CtIsolation>
  );
}

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
