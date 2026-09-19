// The DriveFailure recording (#1344), moved out of drive.ts to hold the 450-line cap: WHAT a failed
// drive action says, in the operator's own argv — the flag each queued action was typed as, the failure
// row minted for it, and the one-line label a retry/print uses to name the step.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DriveFailure, NavAction, Step } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** `--wait`'s own failure row (#1344). It is index -1 because it runs BEFORE the argv queue exists: it is
 *  the readiness precondition, not a queued action, and a reader who sees `step 0` beside it should not
 *  believe the queue ran at all. */
export function waitDriveFailure(selector: string, message: string): DriveFailure {
  return { index: -1, kind: "wait", flag: "--wait", subject: selector, reason: failureReason(message) };
}

/** The FLAG each queued action was typed as (#1344). A failure row names the argv the operator must
 *  correct, not the internal kind — `--wait-for`, not `waitfor`. Mapped-Record, so a new step kind cannot
 *  ship without its spelling. */
const STEP_FLAG: Record<Step["kind"], string> = {
  click: "--click",
  tap: "--tap",
  "motion-click": "--motion",
  jsclick: "--dom-click",
  press: "--force-click",
  hover: "--hover",
  fill: "--fill",
  key: "--key",
  keyboard: "--key",
  waitfor: "--wait-for",
  pause: "--pause",
  wheel: "--wheel",
  wheelburst: "--wheel-burst",
  upload: "--upload",
  "drop-files": "--drop-files",
};

const NAV_METHOD_FLAG: Record<NavAction["kind"], string> = {
  goto: "--goto",
  "open-chat": "--open-chat",
  "open-character": "--open-character",
  "context-tab": "--context-tab",
  panel: "--panel",
  focus: "--focus",
};

const FAILURE_REASON_MAX = 220;

/** One line, bounded: a Playwright timeout's own message is a multi-paragraph call log, and a FINDING row
 *  that wraps six times is the noise this row exists to replace. The full text stays in the inline
 *  `STEP FAILED` line and in the run's trace. */
function failureReason(message: string): string {
  const collapsed = message.replace(/\s+/gu, " ").trim();
  return collapsed.length > FAILURE_REASON_MAX ? `${collapsed.slice(0, FAILURE_REASON_MAX)}…` : collapsed;
}

function stepSubject(step: Step): string | null {
  if (step.kind === "keyboard") {
    return step.key;
  }
  if (step.kind === "pause") {
    return null;
  }
  return step.selector;
}

export function stepDriveFailure(index: number, step: Step, message: string): DriveFailure {
  return { index, kind: "step", flag: STEP_FLAG[step.kind], subject: stepSubject(step), reason: failureReason(message) };
}

export function navDriveFailure(index: number, action: NavAction, message: string): DriveFailure {
  return { index, kind: "nav", flag: NAV_METHOD_FLAG[action.kind], subject: action.target, reason: failureReason(message) };
}

// What a step failure names: every arm but the bare-key one is addressed by a selector.
export function stepLabel(step: Step): string {
  if (step.kind === "keyboard") {
    return `keyboard ${step.key}`;
  }
  if (step.kind === "pause") {
    return `pause ${String(step.ms)}ms`;
  }
  return `${step.kind} ${step.selector ?? "(entry window)"}`;
}
