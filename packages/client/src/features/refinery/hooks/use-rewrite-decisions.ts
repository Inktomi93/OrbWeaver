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

export interface RewriteDecisions {
  /** One decision per review entry, in review order. */
  readonly decided: readonly CompareDecision[];
  readonly decide: (index: number, decision: CompareDecision) => void;
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
  const decide = (index: number, decision: CompareDecision): void => {
    const entry = entries[index];
    if (rewriteRunId === null || entry === undefined) {
      return;
    }
    const next = Array.from({ length: Math.max(sheet.length, entry.payloadIndex + 1) }, (_, i): CompareDecision => sheet[i] ?? null);
    next[entry.payloadIndex] = decision;
    setPressedByRun((prev) => ({ ...prev, [rewriteRunId]: next }));
    // The WHOLE sheet rides every press, so the last write to land is always complete.
    save.mutate({ sessionId, rewriteRunId, decisions: next });
  };
  return { decided, decide };
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
