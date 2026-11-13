// Where a session call's time went, so a watchdog kill names the phase it stopped in instead of only the call.
// The ledger is process-scoped like the output sink: the session daemon serves one call at a time, and the
// capture path marks phases without knowing whether a daemon is timing it. With no ledger open (a one-shot
// run), a mark is dropped.
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { Arm } from "../contract/arm-vocabulary.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

/** The phases of one call, in the order the call path enters them. */
const CALL_PHASES = [
  "call-setup",
  "matrix",
  "arms-prepare",
  "navigate",
  "theme-stamp",
  "after-navigation",
  "checkpoint",
  "drive",
  "settle",
  "trailing-evals",
  "after-settle",
  "page-arm",
  "reassert-device",
  "console-diagnostics",
  "run-arms",
  "report",
] as const;
export type CallPhase = (typeof CALL_PHASES)[number];

interface PhaseMark {
  readonly phase: CallPhase;
  /** The arm a `page-arm` phase runs. */
  readonly detail: Arm | null;
  readonly at: number;
}

let openMarks: PhaseMark[] | null = null;

/** Record that the call in flight entered `phase`; it lasts until the next mark. */
export function markCallPhase(phase: CallPhase, detail: Arm | null = null): void {
  openMarks?.push({ phase, detail, at: Date.now() });
}

export interface CallPhaseLedger extends Disposable {
  /** The phase in flight and how long it has run, then each earlier phase with its time. */
  readonly describe: (now: number) => string;
}

function labelOf(mark: PhaseMark): string {
  return mark.detail === null ? mark.phase : `${mark.phase} ${mark.detail}`;
}

function describeMarks(marks: readonly PhaseMark[], startedAt: number, now: number): string {
  const spans = marks.map((mark, index) => `${labelOf(mark)} ${String((marks[index + 1]?.at ?? now) - mark.at)}ms`);
  const inFlight = spans.pop();
  if (inFlight === undefined) {
    return `no phase entered in ${String(now - startedAt)}ms`;
  }
  const earlier = spans.length === 0 ? "" : `; before it: ${spans.join(", ")}`;
  return `in flight: ${inFlight}${earlier}`;
}

/** Open the ledger for one call. Disposing it closes the ledger, so a later mark from the same work is dropped. */
export function openCallPhaseLedger(startedAt: number): CallPhaseLedger {
  const marks: PhaseMark[] = [];
  openMarks = marks;
  return {
    describe: (now) => describeMarks(marks, startedAt, now),
    [Symbol.dispose]: (): void => {
      if (openMarks === marks) {
        openMarks = null;
      }
    },
  };
}
