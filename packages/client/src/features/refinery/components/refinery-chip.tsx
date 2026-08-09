// RefineryChip — the word-primary state/tone chip the refinery surfaces share (verdict rosters, enum
// values, block states). The WORD is the signal; the tone tint is secondary (the colourblind law), and
// the tone vocabulary is the render-hint contract's (`good/warn/bad/info/neutral`) mapped to intent
// tokens — never inferred from spellings. A feature-tier composition over `Text` (not an @orb/ui mint:
// refinery-only today; StatusChip is the async-status species, a different anatomy — R1 of the row law).

import type { RenderHintTone } from "@orb/contracts/refinery";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

const TONE_CLASSES: Record<RenderHintTone, string> = {
  good: "bg-success text-success-foreground",
  warn: "bg-warning text-warning-foreground",
  bad: "bg-destructive text-destructive-foreground",
  info: "bg-info text-info-foreground",
  neutral: "bg-muted text-muted-foreground",
};

export interface RefineryChipProps {
  readonly tone?: RenderHintTone;
  readonly children: ReactNode;
}

export function RefineryChip({ tone = "neutral", children }: RefineryChipProps): ReactElement {
  // voice="kicker" carries the micro-caps grammar (§2.3 — never the raw type axes); the tone classes
  // override its muted color pair (cn merges caller-last).
  return (
    <Text as="span" className={`inline-flex items-center rounded-full px-field ${TONE_CLASSES[tone]}`} data-tone={tone} voice="kicker">
      {children}
    </Text>
  );
}
