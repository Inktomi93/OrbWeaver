import { Button } from "@orb/ui/button";
import { GlyphButton } from "@orb/ui/glyph-button";
import { PictureButton } from "@orb/ui/picture-button";
import { Icon, X } from "@orb/ui/icons";
import { InlineAction } from "@orb/ui/inline-action";
import type { ReactElement } from "react";

export function Sample(): ReactElement {
  return (
    <div>
      <GlyphButton aria-label="Remove" variant="ghost" glyph="xs" onClick={(): void => undefined}>
        <Icon icon={X} size="xs" />
      </GlyphButton>
      <GlyphButton
        aria-label="Next"
        variant="ghost"
        ink="muted"
        glyph="lg"
        shape="pill"
      />
      <InlineAction variant="ghost" step="label" reserveEdge={true} className="px-field">
        <GlyphButton aria-label="Nested" variant="ghost" glyph="sm" />
      </InlineAction>
      <InlineAction variant="link" step="body">
        Try again
      </InlineAction>
      <InlineAction step="label">Already moved</InlineAction>
      <PictureButton className="absolute inset-0">
        art
      </PictureButton>
      <PictureButton variant="ghost" shape="pill">
        portrait
      </PictureButton>
      <GlyphButton aria-label="Send" glyph="lg" />
      <Button size="sm">Stays a Button</Button>
    </div>
  );
}
