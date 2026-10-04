// The APPLY outcome (the apply-and-selection mock, frames 2-3): the per-entry itemization the granular
// verb exists for — applied rows (Replaced / Cleared / kind words) + every drop with its typed English
// (`DROP_REASON_COPY`). FORK H: the full panel renders when anything DROPPED; a clean apply confirms
// inline (the caller decides — this component renders whichever it is handed). FORK I: the zero-write
// arm reads as a REFUSAL (warning tone), never an error — nothing broke, and the reasons are actionable.
// The snapshot line points at the character's History tab; the zero-write arm states plainly that
// nothing was written (the apply is all-or-nothing).

import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { testId } from "#lib";
import { DROP_REASON_COPY } from "../lib/reason-copy.ts";
import { RefineryChip } from "./refinery-chip.tsx";

type ApplyWire = inferOutput<Trpc["refinery"]["applyFields"]>;

export interface ApplyOutcomeProps {
  readonly applied: ApplyWire["applied"];
  readonly dropped: ApplyWire["dropped"];
  /** A pre-apply snapshot was taken (the rollback point the History tab offers). */
  readonly snapshotTaken: boolean;
  /** The branch-off arm's outcome names the COPY instead of the live card. */
  readonly copyName?: string | undefined;
  /** FORK H/I's two real exits on the zero-write arm. */
  readonly onEditScope: () => void;
  readonly onRerunRewrite: () => void;
  readonly onDone: () => void;
  /** The recovery from an atomic refusal: discard the refused entries and run the same act on the rest.
   *  Null when nothing would remain to apply. */
  readonly recovery: {
    readonly remaining: number;
    readonly refused: number;
    /** The act that was refused — the recovery re-runs THAT act, so its label names it. */
    readonly verb: "apply" | "copy";
    /** A terminal act is in flight (this recovery or the foot row's) — the press would be a second write. */
    readonly pending: boolean;
    readonly onPress: () => void;
  } | null;
}

/** The itemized row's target words. An APPEND names the act, not a slot — the new greeting's position is
 *  whatever the tail was at write time, so printing a number would be a fact we do not have. */
function targetOf(ref: { field: string; greetingIndex?: number | undefined; appendIndex?: number | undefined }): string {
  if (ref.appendIndex !== undefined) {
    return `${ref.field} [new]`;
  }
  return ref.greetingIndex === undefined ? ref.field : `${ref.field} [${ref.greetingIndex}]`;
}

/** A row's React key — the itemization can carry several entries for one field (two appends, or an append
 *  beside a replacement), so the key must include whichever address the entry actually used. */
function refKeyOf(ref: { field: string; greetingIndex?: number | undefined; appendIndex?: number | undefined }): string {
  return `${ref.field}-${ref.greetingIndex ?? "f"}-${ref.appendIndex === undefined ? "n" : `a${ref.appendIndex}`}`;
}

export function ApplyOutcome({ applied, dropped, snapshotTaken, copyName, onEditScope, onRerunRewrite, onDone, recovery }: ApplyOutcomeProps): ReactElement {
  const zeroWrite = applied.length === 0;
  return (
    <Stack data-testid={testId("refineryApplyOutcome")} gap="row">
      <Card>
        <Row align="center" gap="row" padding="block">
          {zeroWrite ? (
            <Stack gap="tight">
              <Text voice="label">{copyName === undefined ? "The card was not touched." : "No copy was made."}</Text>
              <Text voice="gloss">Nothing was written — a kept change failed a check, so none were applied. Each reason is below.</Text>
            </Stack>
          ) : (
            <Stack gap="tight">
              <Text voice="label">
                {applied.length} field{applied.length === 1 ? "" : "s"} written{copyName === undefined ? "" : ` to the copy "${copyName}"`}.
              </Text>
              {copyName !== undefined ? <Text voice="gloss">The live card is untouched — no snapshot was needed, nothing existing was written.</Text> : null}
              {copyName === undefined && snapshotTaken ? <Text voice="gloss">Saved a snapshot first — undo it from the character's History tab.</Text> : null}
            </Stack>
          )}
        </Row>
      </Card>
      <Stack gap="tight">
        {applied.map((ref) => (
          <Row align="center" gap="row" key={refKeyOf(ref)}>
            <RefineryChip tone="good">{ref.kind}</RefineryChip>
            <Text voice="label">{targetOf(ref)}</Text>
          </Row>
        ))}
        {dropped.map((drop) => {
          const copy = DROP_REASON_COPY[drop.reason];
          return (
            <Stack gap="tight" key={`${refKeyOf(drop)}-${drop.reason}`}>
              <Row align="center" gap="row">
                <RefineryChip tone={copy.tone}>{copy.chip}</RefineryChip>
                <Text voice="label">{targetOf(drop)}</Text>
              </Row>
              <Text voice="gloss">{copy.why}</Text>
            </Stack>
          );
        })}
      </Stack>
      <OutcomeActions onDone={onDone} onEditScope={onEditScope} onRerunRewrite={onRerunRewrite} recovery={recovery} zeroWrite={zeroWrite} />
    </Stack>
  );
}

/** The panel's exits: Done after a write; after an atomic refusal, the explicit-discard recovery (when
 *  something would remain), Edit scope and Re-run rewrite. */
function OutcomeActions({
  zeroWrite,
  recovery,
  onEditScope,
  onRerunRewrite,
  onDone,
}: Pick<ApplyOutcomeProps, "recovery" | "onEditScope" | "onRerunRewrite" | "onDone"> & { readonly zeroWrite: boolean }): ReactElement {
  if (!zeroWrite) {
    return (
      <Row gap="row" justify="end">
        <Button onClick={onDone} size="sm">
          Done
        </Button>
      </Row>
    );
  }
  return (
    <Row className="flex-wrap" gap="row" justify="end">
      {recovery === null ? null : (
        <Button disabled={recovery.pending} intent="secondary" onClick={recovery.onPress} size="sm">
          Discard the refused {recovery.refused === 1 ? "field" : "fields"} and{" "}
          {recovery.verb === "copy" ? `save the other ${recovery.remaining} as a copy` : `apply the other ${recovery.remaining}`}
        </Button>
      )}
      <Button intent="secondary" onClick={onEditScope} size="sm">
        Edit scope
      </Button>
      <Button onClick={onRerunRewrite} size="sm">
        Re-run rewrite
      </Button>
    </Row>
  );
}
