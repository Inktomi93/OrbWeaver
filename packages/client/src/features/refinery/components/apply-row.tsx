// The apply/save-as-copy verb row (extracted from the content surface under the component-size cap) —
// the TERMINAL acts: apply is the ONE live-card write (snapshot-first, belt 13), save-as-copy is its
// branch-off twin (no snapshot by construction). Owns its two mutations; the parent only receives the
// OUTCOME (which flips §20b's draft line to written).

import type { RefinerySessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { setRefineryArmedRewrite } from "#state";
import { useApplyRefineryAsCopy, useApplyRefineryFields } from "../hooks/use-refinery-mutations.ts";
import { RefineryChip } from "./refinery-chip.tsx";

// Re-derived locally from the wire (§7.4 — never an exported alias).
type ApplyWire = inferOutput<Trpc["refinery"]["applyFields"]>;
type KeptAccept = inferInput<Trpc["refinery"]["applyFields"]>["accepts"][number];
type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];

/** The apply outcome the parent renders (§20a's itemized panel feed). */
export interface OutcomeState {
  readonly applied: ApplyWire["applied"];
  readonly dropped: ApplyWire["dropped"];
  /** The apply took its pre-write snapshot (false on a copy and on the refused arm). */
  readonly snapshotTaken: boolean;
  readonly copyName?: string;
}

export interface ApplyRowProps {
  readonly sessionId: RefinerySessionId;
  readonly keptAccepts: readonly KeptAccept[];
  readonly armedRewrite: RunView | null;
  readonly armedRewriteId: string | null;
  /** The session's rewrite already landed — both terminal verbs are disabled until a stage run re-opens it. */
  readonly completed: boolean;
  readonly onOutcome: (outcome: OutcomeState) => void;
}

export function ApplyRow({ sessionId, keptAccepts, armedRewrite, armedRewriteId, completed, onOutcome }: ApplyRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const deps = { trpc, invalidation };
  const apply = useApplyRefineryFields(deps);
  const applyAsCopy = useApplyRefineryAsCopy(deps);
  const appliedNoteId = useId();
  const blocked = completed || apply.isPending || applyAsCopy.isPending || keptAccepts.length === 0;
  return (
    <Row align="center" className="flex-wrap" gap="row" justify="end">
      {completed ? (
        <Text id={appliedNoteId} voice="gloss">
          Applied. Run a stage to start another round.
        </Text>
      ) : null}
      {armedRewrite !== null ? <RefineryChip tone="good">applying round {armedRewrite.iteration}'s rewrite</RefineryChip> : null}
      <Button
        {...(completed ? { "aria-describedby": appliedNoteId } : {})}
        disabled={blocked}
        intent="secondary"
        onClick={(): void =>
          applyAsCopy.mutate(
            { sessionId, accepts: [...keptAccepts], ...(armedRewriteId === null ? {} : { rewriteRunId: castId(armedRewriteId) }) },
            {
              onSuccess: (result): void => {
                onOutcome({
                  applied: result.applied,
                  dropped: result.dropped,
                  snapshotTaken: false,
                  ...(result.character === null ? {} : { copyName: result.character.name }),
                });
                setRefineryArmedRewrite(null);
              },
            },
          )
        }
        size="sm"
      >
        Save as copy
      </Button>
      <Button
        {...(completed ? { "aria-describedby": appliedNoteId } : {})}
        disabled={blocked}
        onClick={(): void =>
          apply.mutate(
            { sessionId, accepts: [...keptAccepts], ...(armedRewriteId === null ? {} : { rewriteRunId: castId(armedRewriteId) }) },
            {
              onSuccess: (result): void => {
                onOutcome({
                  applied: result.applied,
                  dropped: result.dropped,
                  snapshotTaken: result.snapshotId !== null,
                });
                setRefineryArmedRewrite(null);
              },
            },
          )
        }
        size="sm"
      >
        Apply {keptAccepts.length} kept
      </Button>
    </Row>
  );
}
