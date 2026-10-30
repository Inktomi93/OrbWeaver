// RefineryChip — the word-primary state/tone chip the refinery surfaces share (verdict lists, enum
// values, block states). The WORD is the signal; the tone tint is secondary (the colourblind law), and
// the tone vocabulary is the render-hint contract's (`good/warn/bad/info/neutral`) mapped to Badge intents
// — never inferred from spellings.

import type { RenderHintTone } from "@orb/contracts/refinery";
import { Badge } from "@orb/ui/badge";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { testId } from "#lib";

/** The chip's tones: the render-hint vocabulary plus `accent`, the palette's own primary for session chrome
 *  (a status, not a payload verdict — so it never borrows a semantic hue such as `info`). */
type RefineryChipTone = RenderHintTone | "accent";

const CHIP_BADGE_TONE: Record<RefineryChipTone, NonNullable<ComponentProps<typeof Badge>["tone"]>> = {
  good: "success",
  warn: "warning",
  bad: "destructive",
  info: "info",
  neutral: "neutral",
  accent: "primary",
};

// The word carries its render-hint on `data-hint-tone`, never `data-tone`: `@orb/ui` is the one writer of `data-tone`
// (the recipe arm it resolved), and the ui-audit walker reads that attribute as an authored recipe arm.

export interface RefineryChipProps {
  readonly tone?: RefineryChipTone;
  /** Keep a full status sentence inside its row by wrapping at word boundaries. */
  readonly wrap?: boolean;
  readonly children: ReactNode;
}

export function RefineryChip({ tone = "neutral", wrap = false, children }: RefineryChipProps): ReactElement {
  // The kicker voice carries the micro-caps grammar; `ink="inherit"` takes the badge's own ink.
  return (
    <Badge className={wrap ? "whitespace-normal max-inline-full" : undefined} data-testid={testId("refineryChip")} tone={CHIP_BADGE_TONE[tone]} size="compact">
      <Text as="span" data-hint-tone={tone} ink="inherit" voice="kicker">
        {children}
      </Text>
    </Badge>
  );
}
