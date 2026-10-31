import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import { InlineAction } from "@orb/ui/inline-action";
import type { ReactElement } from "react";

export function Sample(): ReactElement {
  return (
    <div>
      <Button aria-label="Remove" variant="ghost" size="glyph-xs" onClick={(): void => undefined}>
        <Icon icon={X} size="xs" />
      </Button>
      <Button
        aria-label="Next"
        variant="ghost"
        ink="muted"
        size="glyph-lg"
        shape="pill"
      />
      <Button variant="ghost" size="inline" reserveEdge={true} className="px-field">
        <Button aria-label="Nested" variant="ghost" size="glyph-sm" />
      </Button>
      <Button variant="link" size="inline-body">
        Try again
      </Button>
      <InlineAction step="label">Already moved</InlineAction>
      <Button variant="bare" size="media" className="absolute inset-0">
        art
      </Button>
      <Button variant="ghost" size="media" shape="pill">
        portrait
      </Button>
      <Button aria-label="Send" size="glyph-lg" />
      <Button size="sm">Stays a Button</Button>
    </div>
  );
}
