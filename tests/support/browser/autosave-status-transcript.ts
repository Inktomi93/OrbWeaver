// A SETTLED proof for a TRANSIENT status lie (issue #81 P0). The defect — "Saved" rendered over text that
// is still sitting in the autosave debounce window — is a WINDOW, not a resting state: by the time the
// debounced write lands, every editor legitimately reads "Saved" again. A polled `expect` cannot pin it
// (on the defective tree the poll races a ~500ms window and reads the same word at both ends), and
// asserting a state that only exists mid-flight is exactly the CT flake class this repo has already paid
// for twice.
//
// So the browser records the transition itself. A MutationObserver on the document writes every DISTINCT
// value of the one `[data-slot="autosave-status"]` readout into a sink; the test starts the recorder,
// performs the edit, barriers on the SETTLED post-save render, and only then reads the transcript. The
// assertion is made against a finished array — no timing, no timeout, no flake — and it says the thing the
// finding said: what did the status read between the keystroke and the save.

import type { Page } from "@playwright/test";

/** The shared affordance's one slot (`packages/client/src/forms/editor/autosave-status.tsx`) — every arm of it
 *  carries this, so the recorder follows the readout through a state change that swaps the element. */
const STATUS_SELECTOR = '[data-slot="autosave-status"]';

/** The sink the recorder writes and the reader reads. It is a `<script type="application/json">` in
 *  `document.HEAD`, not a page global: a global needs an `as unknown as` double-cast to reach (which
 *  `no-test-fabrication` correctly reds), and the head is provably OUTSIDE the observed `document.body`
 *  subtree, so writing the transcript can never re-trigger the observer that produces it. */
const SINK_ID = "orb-autosave-status-transcript";

/**
 * Start recording the autosave status readout. Call it AFTER the surface has settled on its clean mount
 * and IMMEDIATELY BEFORE the dirtying interaction — the transcript is read as "what the status said from
 * here on", so anything recorded before the edit is noise the assertion would have to excuse.
 */
export async function beginAutosaveStatusTranscript(page: Page): Promise<void> {
  await page.evaluate(
    ({ selector, sinkId }: { selector: string; sinkId: string }): void => {
      const sink = document.createElement("script");
      sink.type = "application/json";
      sink.id = sinkId;
      sink.textContent = "[]";
      document.head.append(sink);
      const record = (): void => {
        const next = document.querySelector(selector)?.textContent?.trim() ?? "";
        const log = JSON.parse(sink.textContent ?? "[]") as string[];
        // Consecutive duplicates are the same render observed through several mutations, not a transition.
        if (next.length > 0 && next !== log.at(-1)) {
          log.push(next);
          sink.textContent = JSON.stringify(log);
        }
      };
      // Document-wide, because the readout's element IDENTITY changes between arms (a `<Text>` for
      // Saving…/Saved, a `<Row>` for Not-saved/Save-failed) — observing the node would stop at the swap.
      new MutationObserver(record).observe(document.body, { subtree: true, childList: true, characterData: true });
    },
    { selector: STATUS_SELECTOR, sinkId: SINK_ID },
  );
}

/** The distinct readouts the status went through, in order, since the recorder started. */
export function readAutosaveStatusTranscript(page: Page): Promise<readonly string[]> {
  return page.evaluate((sinkId: string): readonly string[] => JSON.parse(document.getElementById(sinkId)?.textContent ?? "[]") as string[], SINK_ID);
}
