// The review's Keep/Discard sheet: persisted on the session per rewrite run (`decideRewrite`), so leaving and
// re-entering the workbench reopens the same decisions. The local overlay answers a press immediately; the
// server copy seeds every fresh mount. Sheets are indexed by PAYLOAD position (`ReviewEntry.payloadIndex`).

import type { RefineryRewriteDecisions } from "@orb/contracts/refinery";
import { isAppendedRewrite } from "@orb/contracts/refinery";
import type { RefineryRunId, RefinerySessionId } from "@orb/kit/ids";
import type { CompareDecision } from "@orb/ui/compare-blocks";
import type { inferInput } from "@trpc/tanstack-react-query";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import type { ReviewEntry } from "../lib/review-entries.ts";
import { useDecideRefineryRewrite } from "./use-refinery-mutations.ts";

// Re-derived locally from the wire (§7.4).
type KeptAccept = inferInput<Trpc["refinery"]["applyFields"]>["accepts"][number];
type SheetWrite = inferInput<Trpc["refinery"]["decideRewrite"]>;

export interface RewriteDecisions {
  /** One decision per review entry, in review order. */
  readonly decided: readonly CompareDecision[];
  readonly decide: (index: number, decision: CompareDecision) => void;
  /** Several entries at once, in ONE sheet write (a loop of `decide` would each start from the same stale sheet). */
  readonly decideEach: (indexes: readonly number[], decision: CompareDecision) => void;
}

/** One run's write queue: whether a write is out, and the newest sheet waiting behind it. */
interface SheetQueue {
  writing: boolean;
  waiting: SheetWrite | null;
}

// MODULE-LEVEL, NOT COMPONENT STATE: a press made while a write is out must still be sent if the user leaves
// the workbench before that write returns, and a component's callbacks die with it on unmount. Keyed per
// session + run, because a sheet only ever replaces its own run's sheet.
const sheetQueues = new Map<string, SheetQueue>();

/** ONE WRITE IN FLIGHT, LATEST SHEET WINS: the whole sheet rides every press, and a press made while a write
 *  is out waits, replacing any earlier waiting one — so writes land in press order and the last is complete.
 *  Drained off the write's own promise, which settles whether or not the pressing component is still mounted. */
function enqueueSheetWrite(sheetWrite: SheetWrite, write: (vars: SheetWrite) => Promise<unknown>, onRefused: () => void): void {
  const key = `${sheetWrite.sessionId}:${sheetWrite.rewriteRunId}`;
  const queue = sheetQueues.get(key) ?? { writing: false, waiting: null };
  sheetQueues.set(key, queue);
  if (queue.writing) {
    queue.waiting = sheetWrite;
    return;
  }
  queue.writing = true;
  // @orb-waive caught-failure-ownership(write): useDecideRefineryRewrite's own errorToast surfaces the failure,
  // and onRefused reverts the overlay to the server's copy. Ends if that mutation drops its errorToast.
  write(sheetWrite).then(
    (): void => {
      queue.writing = false;
      const next = queue.waiting;
      queue.waiting = null;
      if (next === null) {
        sheetQueues.delete(key);
        return;
      }
      enqueueSheetWrite(next, write, onRefused);
    },
    (): void => {
      sheetQueues.delete(key);
      onRefused();
    },
  );
}

export function useRewriteDecisions(args: {
  readonly sessionId: RefinerySessionId;
  readonly rewriteRunId: RefineryRunId | null;
  readonly entries: readonly ReviewEntry[];
  readonly persisted: RefineryRewriteDecisions;
}): RewriteDecisions {
  const { sessionId, rewriteRunId, entries, persisted } = args;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const save = useDecideRefineryRewrite({ trpc, invalidation });
  const [pressedByRun, setPressedByRun] = useState<Readonly<Record<string, readonly CompareDecision[]>>>({});
  const sheet: readonly CompareDecision[] = rewriteRunId === null ? [] : (pressedByRun[rewriteRunId] ?? persisted[rewriteRunId] ?? []);
  const decided = entries.map((entry) => sheet[entry.payloadIndex] ?? null);
  const decideEach = (indexes: readonly number[], decision: CompareDecision): void => {
    const targets = indexes.flatMap((i) => (entries[i] === undefined ? [] : [entries[i].payloadIndex]));
    if (rewriteRunId === null || targets.length === 0) {
      return;
    }
    const next = Array.from({ length: Math.max(sheet.length, ...targets.map((t) => t + 1)) }, (_, i): CompareDecision => sheet[i] ?? null);
    for (const target of targets) {
      next[target] = decision;
    }
    setPressedByRun((prev) => ({ ...prev, [rewriteRunId]: next }));
    send({ sessionId, rewriteRunId, decisions: next });
  };
  const send = (sheetWrite: SheetWrite): void =>
    enqueueSheetWrite(sheetWrite, save.mutateAsync, (): void =>
      // A refused write drops the overlay back to the server's copy, so no phantom decision shows.
      setPressedByRun((prev) => Object.fromEntries(Object.entries(prev).filter(([runId]) => runId !== sheetWrite.rewriteRunId))),
    );
  return { decided, decide: (index, decision): void => decideEach([index], decision), decideEach };
}

/** The kept accepts the terminal verbs send: each Keep press's target, with `confirmDiverged` riding
 *  exactly the diverged entries (the §21 informed re-confirmation — never a blanket flag). */
export function keptAcceptsOf(entries: readonly ReviewEntry[], decided: readonly CompareDecision[]): KeptAccept[] {
  return entries.flatMap((entry, i): KeptAccept[] => {
    if (decided[i] !== true) {
      return [];
    }
    // An APPEND is addressed by its ordinal and NOTHING else: it has no slot to name and no history to have
    // diverged from, so sending either key would be a malformed address the verb refuses.
    if (entry.appendIndex !== undefined) {
      return [{ field: entry.entry.field, appendIndex: entry.appendIndex }];
    }
    // A slot index is an address only on `greetings`. A model can put one on any field (older run rows
    // still carry it); forwarding it would be refused by the verb and refuse the whole apply.
    const greetingIndex = entry.entry.field === "greetings" && !isAppendedRewrite(entry.entry) ? entry.entry.greetingIndex : undefined;
    return [
      {
        field: entry.entry.field,
        ...(greetingIndex === undefined ? {} : { greetingIndex }),
        ...(entry.diverged ? { confirmDiverged: true as const } : {}),
      },
    ];
  });
}

/** Where an itemized refusal pointed (the apply result's `dropped` rows). */
interface RefusedRef {
  readonly field: string;
  readonly greetingIndex?: number | undefined;
  readonly appendIndex?: number | undefined;
}

/** The review indexes of the entries an apply refused — the same address the accept carried: an append by its
 *  ordinal, a greeting by its slot, any other field by name. */
export function refusedIndexesOf(entries: readonly ReviewEntry[], refused: readonly RefusedRef[]): number[] {
  return entries.flatMap((entry, i): number[] => {
    const hit = refused.some((ref) => {
      if (ref.field !== entry.entry.field) {
        return false;
      }
      if (entry.appendIndex !== undefined || ref.appendIndex !== undefined) {
        return ref.appendIndex === entry.appendIndex;
      }
      return entry.entry.field !== "greetings" || (!isAppendedRewrite(entry.entry) && ref.greetingIndex === entry.entry.greetingIndex);
    });
    return hit ? [i] : [];
  });
}
