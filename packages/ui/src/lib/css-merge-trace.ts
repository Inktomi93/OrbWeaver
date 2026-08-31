// Dev/test-only class-merge evidence. Winner recovery replays the injected configured merger; this file
// never classifies Tailwind syntax or imports tailwind-merge internals.
import { setCssMergeObserver } from "./class-merge.ts";

export const CSS_MERGE_TRACE_INPUT_LIMIT = 128;
const CSS_MERGE_TRACE_RECEIPT_LIMIT = 128;
const INSTRUMENT_ERROR = "INSTRUMENT ERROR";

interface CssClassOccurrence {
  readonly index: number;
  readonly className: string;
}

export interface CssMergeConflict {
  readonly axis: string;
  readonly loser: CssClassOccurrence;
  readonly winner: CssClassOccurrence;
}

export interface CssMergeReceipt {
  readonly input: readonly CssClassOccurrence[];
  readonly conflicts: readonly CssMergeConflict[];
  readonly output: string;
}

interface CssMergeTraceState {
  readonly enabled: boolean;
  readonly calls: number;
  readonly conflictCalls: number;
  readonly deduplicatedConflictCalls: number;
  readonly receipts: readonly CssMergeReceipt[];
}

export type CssMergeTraceSnapshot =
  | (CssMergeTraceState & { readonly status: "ok" })
  | (CssMergeTraceState & { readonly status: "instrument-error"; readonly error: string });

type MergeClassList = (classList: string) => string;
type ClassifyConflict = (loser: string, winner: string) => string;

let enabled = false;
let calls = 0;
let conflictCalls = 0;
let deduplicatedConflictCalls = 0;
const receiptsBySignature = new Map<string, CssMergeReceipt>();
const instrumentErrors = new Set<string>();

function occurrences(classList: string): CssClassOccurrence[] {
  const trimmed = classList.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed.split(/\s+/u).map((className, index) => ({ index, className }));
}

function survivorIndices(input: readonly CssClassOccurrence[], output: string): ReadonlySet<number> {
  const survivors = new Set<number>();
  const outputClasses = occurrences(output);
  let inputCursor = input.length - 1;
  for (let outputCursor = outputClasses.length - 1; outputCursor >= 0; outputCursor -= 1) {
    const wanted = outputClasses[outputCursor]?.className;
    while (inputCursor >= 0 && input[inputCursor]?.className !== wanted) {
      inputCursor -= 1;
    }
    if (inputCursor >= 0) {
      survivors.add(inputCursor);
      inputCursor -= 1;
    }
  }
  return survivors;
}

function firstEvictor(input: readonly CssClassOccurrence[], loserIndex: number, merge: MergeClassList): number | undefined {
  const loser = input[loserIndex];
  if (loser === undefined) {
    return;
  }
  let evictor: number | undefined;
  for (const candidate of input.slice(loserIndex + 1)) {
    const pair = [
      { index: 0, className: loser.className },
      { index: 1, className: candidate.className },
    ];
    if (!survivorIndices(pair, merge(`${loser.className} ${candidate.className}`)).has(0)) {
      evictor = candidate.index;
      break;
    }
  }
  return evictor;
}

function finalWinner(input: readonly CssClassOccurrence[], loserIndex: number, survivors: ReadonlySet<number>, merge: MergeClassList): number | undefined {
  let current = loserIndex;
  while (!survivors.has(current)) {
    const evictor = firstEvictor(input, current, merge);
    if (evictor === undefined) {
      return;
    }
    current = evictor;
  }
  return current;
}

function replayConflicts(input: readonly CssClassOccurrence[], output: string, merge: MergeClassList, classify: ClassifyConflict): CssMergeConflict[] {
  const survivors = survivorIndices(input, output);
  const conflicts: CssMergeConflict[] = [];
  for (const loser of input) {
    if (survivors.has(loser.index)) {
      continue;
    }
    const winnerIndex = finalWinner(input, loser.index, survivors, merge);
    const winner = winnerIndex === undefined ? undefined : input[winnerIndex];
    if (winner === undefined) {
      instrumentErrors.add(`${INSTRUMENT_ERROR}: configured merger dropped occurrence ${loser.index} without a replayable later winner`);
      continue;
    }
    conflicts.push({ axis: classify(loser.className, winner.className), loser, winner });
  }
  return conflicts;
}

function receiptSignature(receipt: CssMergeReceipt): string {
  return JSON.stringify([receipt.input.map((item) => item.className), receipt.output]);
}

function retainReceipt(receipt: CssMergeReceipt): void {
  const signature = receiptSignature(receipt);
  if (receiptsBySignature.has(signature)) {
    deduplicatedConflictCalls += 1;
    return;
  }
  if (receiptsBySignature.size >= CSS_MERGE_TRACE_RECEIPT_LIMIT) {
    const oldest = receiptsBySignature.keys().next().value;
    if (typeof oldest === "string") {
      receiptsBySignature.delete(oldest);
    }
  }
  receiptsBySignature.set(signature, receipt);
}

function recordCssMerge(classList: string, output: string, merge: MergeClassList, classify: ClassifyConflict): void {
  if (!enabled) {
    return;
  }
  calls += 1;
  const input = occurrences(classList);
  if (input.length > CSS_MERGE_TRACE_INPUT_LIMIT) {
    instrumentErrors.add(`${INSTRUMENT_ERROR}: merge input has ${input.length} occurrences; replay limit is ${CSS_MERGE_TRACE_INPUT_LIMIT}`);
    return;
  }
  const conflicts = replayConflicts(input, output, merge, classify);
  if (conflicts.length === 0) {
    return;
  }
  conflictCalls += 1;
  retainReceipt({ input, conflicts, output });
}

function traceState(): CssMergeTraceState {
  return {
    enabled,
    calls,
    conflictCalls,
    deduplicatedConflictCalls,
    receipts: [...receiptsBySignature.values()],
  };
}

function readCssMergeTrace(): CssMergeTraceSnapshot {
  const state = traceState();
  if (!enabled) {
    return { ...state, status: "instrument-error", error: `${INSTRUMENT_ERROR}: CSS merge trace is not enabled` };
  }
  if (calls === 0) {
    return { ...state, status: "instrument-error", error: `${INSTRUMENT_ERROR}: CSS merge trace observed zero merge calls` };
  }
  if (instrumentErrors.size > 0) {
    return { ...state, status: "instrument-error", error: [...instrumentErrors].join("; ") };
  }
  return { ...state, status: "ok" };
}

function resetCssMergeTrace(): void {
  calls = 0;
  conflictCalls = 0;
  deduplicatedConflictCalls = 0;
  receiptsBySignature.clear();
  instrumentErrors.clear();
}

function enableCssMergeTrace(): void {
  enabled = true;
  resetCssMergeTrace();
  setCssMergeObserver(recordCssMerge);
}

export const cssMergeTrace = {
  enable: enableCssMergeTrace,
  read: readCssMergeTrace,
  reset: resetCssMergeTrace,
} as const;
