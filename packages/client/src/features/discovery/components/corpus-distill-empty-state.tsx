// A distillation-gated empty state — discovery data (dossiers, the map, archetypes) only exists once
// the Refinery has distilled + indexed the library, so the empty state routes the user there instead
// of dead-ending. Mirrors Analytics' "Go to Chats" empty-state affordance (same EmptyState primitive +
// a primary Button that drives the shell's section nav via `setActiveSection`).

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the corpus-browse-view.tsx precedent).
import { Icon, Sparkles } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { setActiveSection } from "#state";

export interface CorpusDistillEmptyStateProps {
  readonly title: ReactNode;
  readonly description: ReactNode;
  /** Optional trailing action rendered before "Go to Refinery" (e.g. a Back button in the dossier). */
  readonly secondaryAction?: ReactNode;
}

/** Empty state for the distillation-gated discovery surfaces, with a "Go to Refinery" primary CTA. */
export function CorpusDistillEmptyState({
  title,
  description,
  secondaryAction,
}: CorpusDistillEmptyStateProps): ReactElement {
  return (
    <EmptyState
      icon={<Icon icon={Sparkles} size="lg" />}
      title={title}
      description={description}
      action={
        <Row align="center" gap="field">
          {secondaryAction}
          <Button intent="primary" size="sm" onClick={(): void => setActiveSection("refinery")}>
            Go to Refinery
          </Button>
        </Row>
      }
    />
  );
}
