// The workbench's card identity, session state and pinned-original credit.
// Unnamed sessions defer visible card identity to the shell's narrow title; the accessible heading remains.
// Scope stays beside its sole editing door, shared by the workbench's preflight remedies.

import type { RefinerySelection } from "@orb/contracts/refinery";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId, timeLib } from "#lib";
import { selectCharacter, setActiveSection } from "#state";
import { scopeChipLabelOf } from "../lib/render-plan.ts";
import { RefineryChip } from "./refinery-chip.tsx";

export interface SessionMastheadProps {
  /** The card the session is about — the "Open card" door's target (see the door's note below). */
  readonly characterId: CharacterId;
  readonly cardName: string;
  /** An unnamed session uses the card identity in the shell's narrow title. */
  readonly unnamedSession: boolean;
  readonly status: string;
  /** The apply landed — §20b's draft line flips to written. */
  readonly applied: boolean;
  /** When the session pinned the card (its `createdAt`) — the anchor the credit line states. */
  readonly anchoredAt: number;
  readonly round: number;
  readonly selection: RefinerySelection;
  readonly onEditScope: () => void;
}

export function SessionMasthead({
  characterId,
  cardName,
  unnamedSession,
  status,
  applied,
  anchoredAt,
  round,
  selection,
  onEditScope,
}: SessionMastheadProps): ReactElement {
  return (
    <Stack data-testid={testId("refineryMasthead")} gap="field">
      <Text voice="kicker">Refinery · workbench</Text>
      <Row align="baseline" className="flex-wrap" gap="row">
        {/* The shell's container-budget marker hides paint, not the accessible document outline. */}
        <Heading className="sr-only" level={2}>
          {cardName}
        </Heading>
        <Text aria-hidden="true" as="span" className="min-inline-0" data-shell-identity={unnamedSession ? "defer" : undefined} voice="masthead">
          {cardName}
        </Text>
        {/* THE CHIPS ARE ONE CLUSTER, NOT LOOSE TEXT (side-eye 2026-08-19 P3). Read out of visual context
            they ran together into a single string — "active draft — the live card is untouched anchored 2
            hours ago · … · round 3" — with nothing saying where one fact ended and the next began. A named
            group is the smallest true statement about them: they are the state this whole canvas is
            qualified by, and they belong to each other. */}
        {/* WRAPS: grouping the two chips makes them one flex child of the masthead row, and the draft chip
            is a whole sentence — a non-wrapping group would paint outside the pane at the phone width the
            row above was already wrapping to survive. */}
        <Row align="baseline" aria-label="Session state" className="flex-wrap" gap="field" role="group">
          <RefineryChip tone={status === "active" ? "accent" : "neutral"}>{status}</RefineryChip>
          <RefineryChip tone="neutral">{applied ? "applied · snapshot taken" : "draft — the live card is untouched"}</RefineryChip>
        </Row>
        {/* NO MODEL HERE: each stage can run on a different model, so the model is credited on each lane's
            own result (`RunModelCredit`), never once for the whole session. */}
        <Text as="span" voice="credit">
          anchored {timeLib.formatRelativeAgo(anchoredAt)} · round {round}
        </Text>
        <Row className="flex-1" gap="field" justify="end">
          {/* THE DOOR BACK TO THE CARD (side-eye 2026-08-19 P3: "no door from the workbench to the card
              it's about — the utility question, fails"). The whole surface is about one character and
              there was no way to reach it; the session's own credit line names it and stops there.
              `selectCharacter` + `setActiveSection` is the same pair every launcher in the app uses
              (`use-open-refinery.ts` in the other direction, `agent-nav` for the bridge) — never a
              parallel navigation path.

              IT IS A CONTROL BESIDE THE NAME, NOT THE NAME ITSELF. The review's phrasing was "the
              masthead name becomes a door": making the h2's text a button either nests an interactive
              element inside the heading (and loses the display step to the Button's own type) or drops
              the heading, and the masthead IS this surface's one opening statement at the display step
              (this file's own header). A named button carries the same act without spending the ramp. */}
          <Button
            aria-label={`Open card ${cardName} in the Characters section`}
            intent="ghost"
            onClick={(): void => {
              selectCharacter(characterId);
              setActiveSection("characters");
            }}
            size="sm"
          >
            Open card
          </Button>
          <Button intent="secondary" onClick={onEditScope} size="sm">
            Edit scope
          </Button>
        </Row>
      </Row>
      <Text className="max-inline-(--reading-measure-prose)" voice="gloss">
        Score, rewrite and analyze in one view. Every analyze compares against the card as it was pinned, never the previous rewrite.
      </Text>
      {/* The scope chips are ONE cluster too, and their kicker is its name — `aria-label` rather than an
          `aria-labelledby` at the visible "Scope" text, because the group's name must survive the row
          wrapping the kicker onto its own line at a narrow pane. */}
      <Row align="center" aria-label="Scope" className="flex-wrap" gap="field" role="group">
        <Text voice="kicker">Scope</Text>
        {selection.fields.map((field) => (
          <RefineryChip key={field} tone="neutral">
            {scopeChipLabelOf(field, selection.greetingIndexes)}
          </RefineryChip>
        ))}
      </Row>
    </Stack>
  );
}
