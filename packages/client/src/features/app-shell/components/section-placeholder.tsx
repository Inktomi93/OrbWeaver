// SectionPlaceholder — the honest "not built yet" filler the shell renders for any rail section or
// modal whose real feature surface hasn't landed. A thin wrap of @orb/ui's teaching EmptyState.
//
// The `weave` opt-in swaps the muted Sparkles chrome for the brand Weave glyph — at most one Weave per
// screen, so it rides the content placeholder only; LIST/CONTEXT fallbacks keep the muted sparkle.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Sparkles } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import { WeaveGlyph } from "#lib";

export interface SectionPlaceholderProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Swap the muted sparkle for the brand Weave glyph. At most one Weave per screen; opt-in per placeholder. */
  readonly weave?: boolean;
}

export function SectionPlaceholder({
  title,
  description = "This surface isn't wired yet — it lands with its feature.",
  weave = false,
}: SectionPlaceholderProps): ReactElement {
  if (weave) {
    // @orb-waive empty-state-has-action(EmptyState): the generic unbuilt-section placeholder (the SectionPlaceholder sibling of modal-body-not-placeholder) — it has no section-specific next step to offer, and the flag belongs on the eventual real section body. This is the WEAVE arm. Ends when the placeholder is deleted with the last unbuilt section.
    return <EmptyState decoration={<WeaveGlyph size={48} />} title={title} description={description} />;
  }
  // @orb-waive empty-state-has-action(EmptyState): the same generic unbuilt-section placeholder, ICON arm — same reasoning: no section-specific next step exists here, and the flag belongs on the eventual real section body. Ends when the placeholder is deleted with the last unbuilt section.
  return <EmptyState icon={<Icon icon={Sparkles} size="lg" />} title={title} description={description} />;
}
