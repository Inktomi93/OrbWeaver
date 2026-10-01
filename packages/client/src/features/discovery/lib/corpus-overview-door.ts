import { runAfterViewTransition } from "#lib";
import { revealCorpusOverview } from "#state";

/** Reveal the overview from a finder or evidence sheet whose control leaves the visible frame. */
export function openCorpusOverview(): void {
  revealCorpusOverview();
  runAfterViewTransition(() => {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-section="corpus"] main.shell-content')?.focus());
  });
}
