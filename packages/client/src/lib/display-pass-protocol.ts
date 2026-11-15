// The display-pass Worker's wire: what the main thread sends (`display-pass-runner.ts`) and what the Worker
// answers (`display-pass.worker.ts`). It imports no React module, because the Worker imports it and a React
// module in dev carries the refresh preamble that reads `window`.

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { ProcessMacroOptions } from "@orb/kit/macro";
import type { DisplayCall } from "./message-render.ts";

/** How long one script may run on one row. The main thread measures it from the moment it receives that
 *  script's start notice, so Worker start-up and queue wait never count, and main-thread jank can only
 *  lengthen it. A real panel script takes a few milliseconds on a 20 KB reply. */
export const DISPLAY_SCRIPT_DEADLINE_MS = 250;

/** How long one row's whole script set may run. A large HUD preset's 218 display scripts took 285 ms
 *  together on a 20 KB reply on a desktop; this allows a phone eight times slower. When a row spends it,
 *  the row keeps what has run and the scripts that took longest on it are stopped. */
export const DISPLAY_ROW_BUDGET_MS = 2500;

/** The longest text the pass may hand to the renderer. A HUD preset grew a 20 KB reply to 243 KB; a script
 *  that produces more than this would freeze the main thread in the renderer instead of the Worker. */
export const DISPLAY_OUTPUT_MAX_CHARS = 1_048_576;

/** Main thread to Worker: run these scripts, in order, over `text`. */
export interface DisplayPassRun {
  readonly kind: "run";
  readonly jobId: number;
  readonly text: string;
  readonly scripts: readonly RegexScriptRow[];
  readonly macroCtx: ProcessMacroOptions;
  /** The executor's display call; `scripts` already passed its gate, and the executor reads it again. */
  readonly call: DisplayCall;
  /** What is left of the row's budget; a rerun after a stop gets less than a first run. */
  readonly budgetMs: number;
}

/** Worker to main thread. `start` arrives before each script; `done` ends the job. */
export type DisplayPassReply =
  | { readonly kind: "start"; readonly jobId: number; readonly index: number }
  | {
      readonly kind: "done";
      readonly jobId: number;
      readonly text: string;
      /** Whether a script that ran drew markup with its own template (`display-styled.ts`). */
      readonly styled: boolean;
      /** Milliseconds each script that ran took, by its index in the job's scripts. */
      readonly timings: readonly number[];
      /** Why the Worker stopped before the last script: the row budget ran out, or the script at the last
       *  timing's index produced more than {@link DISPLAY_OUTPUT_MAX_CHARS} (its output was dropped). */
      readonly cut: "budget" | "oversize" | null;
    };
