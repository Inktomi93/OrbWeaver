// Dev/test-only class-merge evidence. Winner recovery replays the injected configured merger; this file
// never classifies Tailwind syntax or imports tailwind-merge internals.
//
// ITS SCROLL COST IS DEV-ONLY AND EXPECTED (#2438, measured 2026-09-19). A 25-tick wheel burst over the
// longest stage transcript books 22 long tasks / 1706 ms / worst 128 ms / 77 ms BLOCKING on a dev build and
// 5 / 278 ms / worst 61 ms / 11 ms on the PROD bundle of the same commit, same room, same db, same scroll
// geometry — so this tracer, `content-growth.ts`'s dev logging, jsxDEV/createElement and the HMR client are
// most of that 77 ms, and none of it ships. Do not open a transcript-scroll perf row off a dev number.
// The burst must be dy NEGATIVE: the transcript is tail-pinned, so a positive-dy burst scrolls nothing and
// records 0 long tasks / 0 blocking — an EMPTY window that reads exactly like a clean surface.

import { setCssMergeObserver } from "./class-merge.ts";
import type {
  CssClassOccurrence,
  CssMergeClassification,
  CssMergeConflict,
  CssMergeReceipt,
  CssMergeTraceSnapshot,
  CssMergeTraceState,
} from "./css-merge-contract.ts";

export type { CssMergeConflict, CssMergeReceipt, CssMergeTraceSnapshot } from "./css-merge-contract.ts";

export const CSS_MERGE_TRACE_INPUT_LIMIT = 128;
const CSS_MERGE_TRACE_RECEIPT_LIMIT = 128;
const INSTRUMENT_ERROR = "INSTRUMENT ERROR";

type MergeClassList = (classList: string) => string;
type ClassifyConflict = (loser: string, winner: string) => CssMergeClassification;

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
    // A CROSS-GROUP eviction is NEVER a receipt (#2460). The pair has a replayable winner, so the old
    // code filed it as an ordinary conflict — which is exactly how #2450's `text-field` dropped by
    // `text-foreground` read as a legitimate size override for as long as it shipped. The merger putting
    // two different class groups in one group is an INSTRUMENT fault, and the trace fails loud on it.
    const classification = classify(loser.className, winner.className);
    if (classification.kind === "cross-group") {
      instrumentErrors.add(`${INSTRUMENT_ERROR}: ${classification.detail}`);
      continue;
    }
    conflicts.push({ axis: classification.axis, loser, winner });
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
