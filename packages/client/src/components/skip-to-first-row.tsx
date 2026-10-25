// The pane-scoped skip link of a list surface: it lands directly on the pane's first row, past the search, sort and
// filter chrome that stands in front of it. The shell's own "Skip to content" moves focus to `<main>`, which is past
// the whole pane, so a keyboard user who came for the list had no shortcut at all.
//
// Revealed with `not-focus-visible:sr-only`, never `sr-only focus-visible:not-sr-only`: `not-sr-only` is a reset whose
// `padding:0; height:auto` beats the Button's own box and renders the revealed control under the WCAG 2.5.8 floor.
// It must be the FIRST focusable inside the surface, or it is a second tab stop rather than a skip.

import { Button } from "@orb/ui/button";
import type { ReactElement, ReactNode, RefObject } from "react";

const FIRST_ROW = '[data-slot="list-row-body"]';

export function SkipToFirstRow({
  containerRef,
  children,
}: {
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Button
      className="not-focus-visible:sr-only focus-visible:self-start"
      intent="secondary"
      onClick={(): void => containerRef.current?.querySelector<HTMLElement>(FIRST_ROW)?.focus()}
      size="sm"
      type="button"
    >
      {children}
    </Button>
  );
}
