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

let openLedger: { readonly marks: PhaseMark[]; readonly now: () => number } | null = null;

/** Record that the call in flight entered `phase`; it lasts until the next mark. */
export function markCallPhase(phase: CallPhase, detail: Arm | null = null): void {
  openLedger?.marks.push({ phase, detail, at: openLedger.now() });
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

/** Open the ledger for one call. Disposing it closes the ledger, so a later mark from the same work is dropped.
 *  Marks read `now`, the clock `startedAt` and `describe` are read on. */
export function openCallPhaseLedger(startedAt: number, now: () => number = Date.now): CallPhaseLedger {
  const marks: PhaseMark[] = [];
  const ledger = { marks, now };
  openLedger = ledger;
  return {
    describe: (at) => describeMarks(ledger.marks, startedAt, at),
    [Symbol.dispose]: (): void => {
      if (openLedger === ledger) {
        openLedger = null;
      }
    },
  };
}
