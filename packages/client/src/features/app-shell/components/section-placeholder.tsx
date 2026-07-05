// SectionPlaceholder — the honest "not built yet" filler the shell renders for any rail section or
// modal whose real feature surface hasn't landed (UI-Arch §4.1: unwired ≠ fabricated). A thin wrap
// of @orb/ui's teaching EmptyState so every unbuilt slot reads consistently. Replaced, slot by slot,
// as each feature's front door is wired into `home-page.tsx`'s `sections` map.

import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the composer.tsx precedent).
import { Icon, Sparkles } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";

export interface SectionPlaceholderProps {
  readonly title: string;
  readonly description?: ReactNode;
}

export function SectionPlaceholder({
  title,
  description = "This surface isn't wired yet — it lands with its feature.",
}: SectionPlaceholderProps): ReactElement {
  return (
    <EmptyState icon={<Icon icon={Sparkles} size="lg" />} title={title} description={description} />
  );
}
