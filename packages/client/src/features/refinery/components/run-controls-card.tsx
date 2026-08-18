// The WORKBENCH's FOOT RUN BAR (program #102, mockup variant C — the island spanning the canvas below the
// three lanes): the session-wide guidance (blur-commit), the hand-edit door, the iterate round, and the
// terminal apply cluster the caller supplies.
//
// WHAT LEFT, AND WHY. This card used to also carry the §8 fit line, the preflight WARN and a single
// context-dependent "Run <stage>" verb — all three PER-STAGE facts, addressed through an `effectiveStage`
// the (now deleted) stage stepper supplied. On a canvas where score, rewrite and analyze are all visible,
// there is no such pointer, so those three moved into each lane's own `LaneRunControl` and this bar keeps
// exactly the acts that are about the SESSION rather than about one stage.
//
// TWO ROWS, NOT ONE (side-eye 2026-08-09 P1-2) — kept, because the geometry that produced it has not
// changed: an input and its action cluster cannot share one line's slack, and the verbs are min-content and
// `shrink-0`, so at a real narrow pane the Field (the only flexible child) was squeezed to 26px.

import type { RefinerySessionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Field } from "@orb/ui/field";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { clearRefineryWorkbenchDoor, useRefineryRequestedDoor } from "#state";
import { useUpdateRefinerySession } from "../hooks/use-refinery-mutations.ts";

export interface RunControlsCardProps {
  readonly sessionId: RefinerySessionId;
  readonly guidance: string | null;
  /** Any stage's call is in flight — the session-wide verbs stand down while one is working. */
  readonly running: boolean;
  /** An analyze has settled, so a refinement round has something to refine against. */
  readonly canIterate: boolean;
  readonly onManualOpen: () => void;
  readonly onIterate: () => void;
  /** The TERMINAL cluster (save-as-copy · apply N kept) — rendered here so the mockup's one foot island
   *  carries every session-wide act, but owned by the caller: apply is a live-card write and its mutations
   *  belong beside the decision sheet that feeds them, not inside a guidance card. */
  readonly apply?: ReactNode;
}

export function RunControlsCard({ sessionId, guidance, running, canIterate, onManualOpen, onIterate, apply }: RunControlsCardProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateSession = useUpdateRefinerySession({ trpc, invalidation });
  const [guidanceDraft, setGuidanceDraft] = useState<string | null>(null);
  // THE `guidance` WORKBENCH DOOR (#171). Guidance has exactly one editing home — this textarea — and the
  // CONTEXT pane's Setup row reads it. The row's "Edit" raises a request; the OWNER (here) answers it by
  // scrolling itself into view and taking focus, then spends the request. Nothing about the one-home
  // ruling moves: the second home the Setup row used to describe in prose still does not exist.
  const guidanceRef = useRef<HTMLTextAreaElement>(null);
  const requestedDoor = useRefineryRequestedDoor();
  useEffect(() => {
    if (requestedDoor !== "guidance") {
      return;
    }
    clearRefineryWorkbenchDoor();
    const field = guidanceRef.current;
    if (field === null) {
      return;
    }
    field.scrollIntoView({ block: "nearest" });
    field.focus();
  }, [requestedDoor]);
  return (
    <Card data-testid={testId("refineryRunBar")}>
      <Stack gap="row">
        <Field label="Guidance · every stage">
          <Textarea
            ref={guidanceRef}
            onBlur={(): void => {
              if (guidanceDraft !== null && guidanceDraft !== (guidance ?? "")) {
                updateSession.mutate({ sessionId, patch: { guidance: guidanceDraft.length === 0 ? null : guidanceDraft } });
              }
            }}
            onChange={(e): void => setGuidanceDraft(e.target.value)}
            placeholder="Guidance for every stage — e.g. keep her mean"
            rows={2}
            value={guidanceDraft ?? guidance ?? ""}
          />
        </Field>
        <Row align="center" className="flex-wrap" gap="row" justify="end">
          <Button disabled={running} intent="ghost" onClick={onManualOpen} size="sm">
            Hand-edit
          </Button>
          {/* Iterate is a SECONDARY here. The bar's one primary is the terminal apply the caller supplies —
              two filled buttons in one cluster is the inverted-hierarchy defect P1-11 named, and applying
              is the act that ends the session. */}
          <Button aria-busy={running} disabled={running || !canIterate} intent="secondary" onClick={onIterate} size="sm">
            Iterate
          </Button>
          {apply}
        </Row>
        {/* A GATE WITH NO REASON IS HALF THE DEFECT (#158 item 4's law, applied to the bar's own gated
            verb). Iterate has always been correctly disabled before an analyze exists — `iterate.ts`
            refuses it — but it said so nowhere, so the button read as arbitrarily dead. Same sentence
            register as the lanes' `blocked` line, and it is a STATE, never a reserved row. */}
        {canIterate || running ? null : <Text voice="gloss">Iterate refines against the latest analysis — run analyze first.</Text>}
      </Stack>
    </Card>
  );
}
