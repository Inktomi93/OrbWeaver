import { Button } from "@orb/ui/button";
import { Button as Plain } from "@orb/ui/copy-button";
import type { ReactElement } from "react";

declare const look: { readonly variant: "ghost" };
declare const step: "glyph-sm" | "glyph-lg";

// A computed matched value, a spread, an aliased import, another door and a scale step all stay for tsc or a hand edit.
export function Sample(): ReactElement {
  return (
    <div>
      <Button aria-label="Computed" variant="ghost" size={step} />
      <Button aria-label="Spread" {...look} size="glyph-lg" />
      <Plain aria-label="Other door" size="glyph-lg" />
      <Button size="sm">Scale step</Button>
    </div>
  );
}
