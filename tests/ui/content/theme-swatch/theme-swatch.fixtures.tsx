// theme-swatch CT fixtures (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The theme
// INPUT tokens live here, not in the .ct file: §13.7 bans color literals in a primitive's CT because an
// ASSERTED color must come from TOKENS — these are not assertions, they are the theme-under-test's own
// stored values (the same bytes a `themes` row carries), and the CT asserts only cross-mount EQUALITY of
// the derived paints, never a literal.

import { ThemeSwatchCard, ThemeSwatchStrip } from "@orb/ui/theme-swatch";
import type { ReactElement } from "react";

const TOKENS = { background: "oklch(0.2 0.02 300)", accent: "oklch(0.7 0.1 300)" };

/** The SAME tokens mounted in both shapes — the cross-mount stripe-parity subject. */
export function SwatchPairStory(): ReactElement {
  return (
    <div>
      <div data-testid="as-strip">
        <ThemeSwatchStrip tokens={TOKENS} />
      </div>
      <div data-testid="as-card">
        <ThemeSwatchCard name="Weft" tokens={TOKENS} />
      </div>
    </div>
  );
}

/** Two cards, one applied — the aria-pressed / onSelect subject. */
export function SwatchCardsStory({ onPick }: { readonly onPick: () => void }): ReactElement {
  return (
    <div>
      <ThemeSwatchCard name="Weft" onSelect={onPick} tokens={TOKENS} />
      <ThemeSwatchCard meta="current" name="Mocha" selected={true} tokens={TOKENS} />
    </div>
  );
}
