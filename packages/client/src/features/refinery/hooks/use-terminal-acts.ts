// The two terminal acts (Apply onto the live card, Save as copy) as ONE hook instance per workbench, shared
// by the foot row's buttons and the refused-apply recovery: one pending flag disables every terminal control,
// and `run` refuses re-entry, so a double press can never send two writes (a copy has no server fence).

import type { RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import { useRef } from "react";
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
  // Set synchronously on the press: `isPending` only flips on the next render, so two clicks in one frame
  // would both see it false. Touched only in handlers and mutation callbacks, never during render.
  const inFlight = useRef(false);
  const run = (verb: TerminalVerb, accepts: readonly KeptAccept[]): void => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    const release = (): void => {
      inFlight.current = false;
    };
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
        onSettled: release,
      });
      return;
    }
    apply.mutate(input, {
      onSuccess: (result): void => settle({ verb, applied: result.applied, dropped: result.dropped, snapshotTaken: result.snapshotId !== null }),
      onSettled: release,
    });
  };
  return { run, pending: apply.isPending || applyAsCopy.isPending };
}
