// SectionPlaceholder — the honest "not built yet" filler the shell renders for any rail section or
// modal whose real feature surface hasn't landed (UI-Arch §4.1: unwired ≠ fabricated). A thin wrap
// of @orb/ui's teaching EmptyState so every unbuilt slot reads consistently. Replaced, slot by slot,
// as each feature's front door is wired into `home-page.tsx`'s `sections` map.
//
// The `weave` opt-in swaps the muted Sparkles chrome for the brand Weave glyph in EmptyState's
// `decoration` slot (D62 UIP-204 / §6 — the sanctioned Weave "teaching moment"). It rides the CONTENT
// placeholder ONLY — at most ONE Weave per screen (DESIGN.md restraint; F10): the LIST and CONTEXT
// "Details" fallbacks keep the muted sparkle so an unbuilt hub with side panels open never paints a
// second glyph. The per-section placeholder DISTINCTIVENESS (each hub its own glyph + copy) is punchlist
// §5 / ux-flow-revamp J10 (L5) — this stays the shared sparkle for those until then.

import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the composer.tsx precedent).
import { Icon, Sparkles } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import { WeaveGlyph } from "#lib";

export interface SectionPlaceholderProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Swap the muted sparkle for the brand Weave glyph (EmptyState `decoration` slot) — the §6 teaching
   *  moment. At most ONE Weave per screen (DESIGN.md restraint); opt-in per placeholder. */
  readonly weave?: boolean;
}

export function SectionPlaceholder({
  title,
  description = "This surface isn't wired yet — it lands with its feature.",
  weave = false,
}: SectionPlaceholderProps): ReactElement {
  if (weave) {
    return (
      <EmptyState decoration={<WeaveGlyph size={48} />} title={title} description={description} />
    );
  }
  return (
    <EmptyState icon={<Icon icon={Sparkles} size="lg" />} title={title} description={description} />
  );
}
