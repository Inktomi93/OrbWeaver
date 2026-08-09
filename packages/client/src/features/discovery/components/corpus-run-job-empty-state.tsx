// A discovery empty state whose next step is a BACKGROUND JOB, with the live door to run one.
//
// WHY IT EXISTS (side-eye 2026-08-08 P1-2): on a library that has never been analysed, the Corpus home
// rendered seven muted "No … computed yet." notes down the pane and the browse list said "No characters
// match" — every one of them true, none of them saying what to DO or offering anywhere to do it. A wall of
// truthful nothing reads as a broken screen.
//
// THE DOOR IS THE REAL ONE, not a re-implementation: Settings → Jobs is where "Run a job…" lives, and
// `openSettingsTo` is the shell's deep-link seam. Features never import each other, so mounting the run
// dialog here is unspellable by design — and it would be a second home for the same verb anyway.
//
// CALLERS NAME THE JOBS BY THEIR RENDERED LABELS (`WORKLOAD_KIND_LABELS`: "Distill characters",
// "Compute themes") so the instruction and the picker the door opens agree word for word.
//
// Distinct from `CorpusDistillEmptyState`, which routes to the REFINERY: that one is about rewriting a
// character's own text, this one is about running the library-wide analysis passes.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Sparkles } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import { openSettingsTo } from "#state";

export interface CorpusRunJobEmptyStateProps {
  readonly title: ReactNode;
  /** Names the exact job(s) that fill this surface — the picker labels, verbatim. */
  readonly description: ReactNode;
}

export function CorpusRunJobEmptyState({ title, description }: CorpusRunJobEmptyStateProps): ReactElement {
  return (
    <EmptyState
      icon={<Icon icon={Sparkles} size="lg" />}
      title={title}
      description={description}
      action={
        <Button intent="primary" size="sm" onClick={(): void => openSettingsTo("workloads", "jobs")}>
          <Icon icon={Sparkles} size="sm" />
          Run a job…
        </Button>
      }
    />
  );
}
