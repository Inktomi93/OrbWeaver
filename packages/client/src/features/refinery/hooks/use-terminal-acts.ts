// The two terminal acts (Apply onto the live card, Save as copy) as one hook, shared by the foot row's
// buttons and the refused-apply recovery in the outcome panel, so both send the same request and report the
// same outcome.

import type { RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { setRefineryArmedRewrite } from "#state";
import { useApplyRefineryAsCopy, useApplyRefineryFields } from "./use-refinery-mutations.ts";

// Re-derived locally from the wire (§7.4).
type ApplyWire = inferOutput<Trpc["refinery"]["applyFields"]>;
type KeptAccept = inferInput<Trpc["refinery"]["applyFields"]>["accepts"][number];

/** Which terminal act produced an outcome — the recovery re-runs the same one. */
type TerminalVerb = "apply" | "copy";

/** The apply outcome the surface renders (§20a's itemized panel feed). */
export interface OutcomeState {
  readonly verb: TerminalVerb;
  readonly applied: ApplyWire["applied"];
  readonly dropped: ApplyWire["dropped"];
  /** The apply took its pre-write snapshot (false on a copy and on the refused arm). */
  readonly snapshotTaken: boolean;
  readonly copyName?: string;
}

export interface TerminalActs {
  readonly run: (verb: TerminalVerb, accepts: readonly KeptAccept[]) => void;
  readonly pending: boolean;
}

export function useTerminalActs(args: {
  readonly sessionId: RefinerySessionId;
  readonly armedRewriteId: string | null;
  readonly onOutcome: (outcome: OutcomeState) => void;
}): TerminalActs {
  const { sessionId, armedRewriteId, onOutcome } = args;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const apply = useApplyRefineryFields({ trpc, invalidation });
  const applyAsCopy = useApplyRefineryAsCopy({ trpc, invalidation });
  const run = (verb: TerminalVerb, accepts: readonly KeptAccept[]): void => {
    const input = { sessionId, accepts: [...accepts], ...(armedRewriteId === null ? {} : { rewriteRunId: castId(armedRewriteId) }) };
    // The armed (older) rewrite stays armed through a refusal: the recovery re-applies THAT rewrite.
    const settle = (outcome: OutcomeState): void => {
      onOutcome(outcome);
      if (outcome.applied.length > 0) {
        setRefineryArmedRewrite(null);
      }
    };
    if (verb === "copy") {
      applyAsCopy.mutate(input, {
        onSuccess: (result): void =>
          settle({
            verb,
            applied: result.applied,
            dropped: result.dropped,
            snapshotTaken: false,
            ...(result.character === null ? {} : { copyName: result.character.name }),
          }),
      });
      return;
    }
    apply.mutate(input, {
      onSuccess: (result): void => settle({ verb, applied: result.applied, dropped: result.dropped, snapshotTaken: result.snapshotId !== null }),
    });
  };
  return { run, pending: apply.isPending || applyAsCopy.isPending };
}
