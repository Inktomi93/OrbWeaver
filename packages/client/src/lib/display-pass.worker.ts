// display-pass.worker — runs the viewer's display regex scripts off the main thread, one row at a time, so a
// catastrophic pattern freezes this thread and never the tab. The main thread (`display-pass-runner.ts`)
// holds the per-script deadline and terminates this Worker when a script overruns it; this side holds the
// row budget and the output bound, which need no kill because the Worker checks them between scripts.
//
// It imports only kit-backed modules and the wire leaf, never the `#lib` barrel or a `.tsx` module: in dev a
// React module carries the refresh preamble that reads `window`, which a Worker does not have (depcruise
// `display-pass-worker-no-react`).

import type { DisplayPassReply, DisplayPassRun } from "./display-pass-protocol.ts";
import { DISPLAY_OUTPUT_MAX_CHARS } from "./display-pass-protocol.ts";
import { applyDisplayScript } from "./message-render.ts";

// The main thread installs the platform polyfills before it loads the app, but a Worker is its own global, and
// the kit macro engine reads Temporal, which Safari 18 lacks. A failed install still runs the job: a script
// whose macro needs a missing builtin throws inside the executor, which skips that one script.
const polyfilled = import("./platform-polyfills.ts").catch(() => undefined);

function reply(message: DisplayPassReply): void {
  globalThis.postMessage(message);
}

async function run(job: DisplayPassRun): Promise<void> {
  await polyfilled;
  const timings: number[] = [];
  let text = job.text;
  let spent = 0;
  let cut: "budget" | "oversize" | null = null;
  for (const [index, script] of job.scripts.entries()) {
    if (spent >= job.budgetMs) {
      cut = "budget";
      break;
    }
    reply({ kind: "start", jobId: job.jobId, index });
    const started = performance.now();
    const next = applyDisplayScript(text, script, job.macroCtx, job.call);
    const took = performance.now() - started;
    timings.push(took);
    spent += took;
    if (next.length > DISPLAY_OUTPUT_MAX_CHARS) {
      cut = "oversize";
      break;
    }
    text = next;
  }
  reply({ kind: "done", jobId: job.jobId, text, timings, cut });
}

// A throw here is this module's own defect, never a script's (the executor catches those). Reported, it reaches
// the main thread as the Worker's error event, which renders every waiting row without its scripts.
globalThis.addEventListener("message", (event: MessageEvent<DisplayPassRun>): void => {
  run(event.data).catch(globalThis.reportError);
});
