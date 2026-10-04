// The apply/save-as-copy verb row (extracted from the content surface under the component-size cap) —
// the TERMINAL acts: apply is the ONE live-card write (snapshot-first, belt 13), save-as-copy is its
// branch-off twin (no snapshot by construction). The acts are the workbench's ONE `useTerminalActs`
// instance, handed in, so a recovery in flight disables these buttons too.

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import type { Trpc } from "#data";
import type { TerminalActs } from "../hooks/use-terminal-acts.ts";
import { RefineryChip } from "./refinery-chip.tsx";

// Re-derived locally from the wire (§7.4 — never an exported alias).
type KeptAccept = inferInput<Trpc["refinery"]["applyFields"]>["accepts"][number];
type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];

export interface ApplyRowProps {
  readonly keptAccepts: readonly KeptAccept[];
  readonly armedRewrite: RunView | null;
  /** The workbench's shared terminal acts (one pending flag for every terminal control). */
  readonly acts: TerminalActs;
  /** The session's rewrite already landed on the live card — Apply is locked until a stage run re-opens it.
   *  Save as copy stays available: a copy is a branch, not the commit. */
  readonly completed: boolean;
}

export function ApplyRow({ keptAccepts, armedRewrite, acts, completed }: ApplyRowProps): ReactElement {
  const appliedNoteId = useId();
  const unsendable = acts.pending || keptAccepts.length === 0;
  return (
    <Row align="center" className="flex-wrap" gap="row" justify="end">
      {completed ? (
        <Text id={appliedNoteId} voice="gloss">
          Applied. Run a stage to start another round.
        </Text>
      ) : null}
      {armedRewrite !== null ? <RefineryChip tone="good">applying round {armedRewrite.iteration}'s rewrite</RefineryChip> : null}
      <Button disabled={unsendable} intent="secondary" onClick={(): void => acts.run("copy", keptAccepts)} size="sm">
        Save as copy
      </Button>
      <Button
        {...(completed ? { "aria-describedby": appliedNoteId } : {})}
        disabled={completed || unsendable}
        onClick={(): void => acts.run("apply", keptAccepts)}
        size="sm"
      >
        Apply {keptAccepts.length} kept
      </Button>
    </Row>
  );
}
