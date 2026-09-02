// RefineryChip — the word-primary state/tone chip the refinery surfaces share (verdict lists, enum
// values, block states). The WORD is the signal; the tone tint is secondary (the colourblind law), and
// the tone vocabulary is the render-hint contract's (`good/warn/bad/info/neutral`) mapped to intent
// tokens — never inferred from spellings. A feature-tier composition over `Text` (not an @orb/ui mint:
// refinery-only today; StatusChip is the async-status species, a different anatomy — R1 of the row law).

import type { RenderHintTone } from "@orb/contracts/refinery";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { testId } from "#lib";

const TONE_CLASSES: Record<RenderHintTone, string> = {
  good: "bg-success text-success-foreground",
  warn: "bg-warning text-warning-foreground",
  bad: "bg-destructive text-destructive-foreground",
  info: "bg-info text-info-foreground",
  neutral: "bg-muted text-muted-foreground",
};

// THE RENDER-HINT TONE HAS ITS OWN ATTRIBUTE NAME (#1097). This chip used to write `data-tone={tone}` —
// a FEATURE word (`good`/`warn`/…) in the attribute `@orb/ui` now owns: `<Text>` stamps its resolved
// recipe `tone` arm there through the variant-axis seam (packages/ui/src/lib/variant-attrs.ts), which is
// the ONE writer of `data-tone`, and the ui-audit walker reads that attribute as an AUTHORED RECIPE ARM
// (tooling/src/ui-audit/ops/walker/target-identity.ts). Two disjoint vocabularies under one name made the
// two unreadable apart. Handing the recipe arm instead (`good` → `tone="success"`) is not available: the
// `density-tier` gate's A3 arm reds a FEATURE spelling any of the four @orb/ui-internal type axes
// (size/weight/tone/transform) — a voice is the only feature-legal spelling, and `voice="kicker"` is
// already the one this chip wants. So the render-hint word keeps its DOM channel under a name @orb/ui
// does not own.

export interface RefineryChipProps {
  readonly tone?: RenderHintTone;
  readonly children: ReactNode;
}

export function RefineryChip({ tone = "neutral", children }: RefineryChipProps): ReactElement {
  // voice="kicker" carries the micro-caps grammar (§2.3 — never the raw type axes); the tone classes
  // override its muted color pair (cn merges caller-last).
  return (
    <Text
      as="span"
      className={`inline-flex items-center rounded-full px-field ${TONE_CLASSES[tone]}`}
      data-hint-tone={tone}
      data-testid={testId("refineryChip")}
      voice="kicker"
    >
      {children}
    </Text>
  );
}
