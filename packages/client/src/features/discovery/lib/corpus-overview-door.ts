import { runAfterViewTransition } from "#lib";
import { requestShellContentFocus, revealCorpusOverview } from "#state";

/** Reveal the overview from a finder or evidence sheet whose control leaves the visible frame. */
export function openCorpusOverview(): void {
  revealCorpusOverview();
  runAfterViewTransition(() => {
    requestAnimationFrame(() => requestShellContentFocus("corpus"));
  });
}
