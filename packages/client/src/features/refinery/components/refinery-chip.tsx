// RefineryChip — the word-primary state/tone chip the refinery surfaces share (verdict lists, block
// states; never an authored enum member, which reads as content). The WORD is the signal; the tone tint is secondary (the colourblind law), and
// the tone vocabulary is the render-hint contract's (`good/warn/bad/info/neutral`) mapped to Badge intents
// — never inferred from spellings.

import type { RenderHintTone } from "@orb/contracts/refinery";
import { Badge, STATUS_PILL_VARIANT } from "@orb/ui/badge";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { testId } from "#lib";

/** The chip's tones: the render-hint vocabulary plus `accent`, the active session in the session chrome. */
type RefineryChipTone = RenderHintTone | "accent";

type ChipBadge = Required<Pick<ComponentProps<typeof Badge>, "tone" | "variant">>;

/** A verdict is a status pill; the active session takes the primary tint, the colour that marks the current selection
 *  elsewhere in the app, so it stays apart from a neutral chip without filling like a verdict. */
const CHIP_BADGE: Record<RefineryChipTone, ChipBadge> = {
  good: { tone: "success", variant: STATUS_PILL_VARIANT.success },
  warn: { tone: "warning", variant: STATUS_PILL_VARIANT.warning },
  bad: { tone: "destructive", variant: STATUS_PILL_VARIANT.destructive },
  info: { tone: "info", variant: STATUS_PILL_VARIANT.info },
  neutral: { tone: "neutral", variant: STATUS_PILL_VARIANT.neutral },
  accent: { tone: "primary", variant: "soft" },
};

// The word carries its render-hint on `data-hint-tone`, never `data-tone`: `@orb/ui` is the one writer of `data-tone`
// (the recipe arm it resolved), and the ui-audit walker reads that attribute as an authored recipe arm.

export interface RefineryChipProps {
  readonly tone?: RefineryChipTone;
  readonly children: ReactNode;
}

function ChipFrame({ tone, sentence, children }: { readonly tone: RefineryChipTone; readonly sentence: boolean; readonly children: ReactNode }): ReactElement {
  return (
    <Badge
      cap={sentence ? "fit" : undefined}
      whitespace={sentence ? "normal" : undefined}
      data-testid={testId("refineryChip")}
      tone={CHIP_BADGE[tone].tone}
      variant={CHIP_BADGE[tone].variant}
      size="compact"
    >
      {children}
    </Badge>
  );
}

/** A chip that says one word or a short label, in the kicker voice (micro-caps). `ink="inherit"` takes the badge's own ink. */
export function RefineryChip({ tone = "neutral", children }: RefineryChipProps): ReactElement {
  return (
    <ChipFrame sentence={false} tone={tone}>
      <Text as="span" data-hint-tone={tone} ink="inherit" voice="kicker">
        {children}
      </Text>
    </ChipFrame>
  );
}

/** A chip that says a whole sentence: caps is a label voice and prose never borrows it, so it sets in sentence case and wraps at word boundaries inside its row. */
export function RefinerySentenceChip({ tone = "neutral", children }: RefineryChipProps): ReactElement {
  return (
    <ChipFrame sentence={true} tone={tone}>
      <Text as="span" data-hint-tone={tone} ink="inherit" voice="label">
        {children}
      </Text>
    </ChipFrame>
  );
}
