// The workbench's card identity, session state and pinned-original credit.
// Unnamed sessions defer visible card identity to the shell's narrow title; the accessible heading remains.
// Scope stays beside its sole editing door, shared by the workbench's preflight remedies.

import type { RefinerySelection } from "@orb/contracts/refinery";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { DetailHeader } from "#components";
import { testId, timeLib } from "#lib";
import { selectCharacter, setActiveSection } from "#state";
import { REFINERY_SESSION_STATE_NAME } from "../lib/refinery-names.ts";
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
      <DetailHeader
        actions={
          <>
            {/* The door back to the card is a control beside the name, not the name itself: the heading keeps
                saying what the surface is about, and `selectCharacter` with `setActiveSection` is the pair every
                launcher uses. */}
            <Button
              aria-label={`Open card ${cardName} in the Characters section`}
              variant="ghost"
              onClick={(): void => {
                selectCharacter(characterId);
                setActiveSection("characters");
              }}
              size="sm"
            >
              Open card
            </Button>
            <Button variant="outline" onClick={onEditScope} size="sm">
              Edit scope
            </Button>
          </>
        }
        deferToShell={unnamedSession}
        kicker="Refinery · workbench"
        meta={
          <>
            {/* The chips are one named cluster: read out of context they ran together into one string. They wrap,
                because the draft chip is a whole sentence. */}
            <Row align="baseline" aria-label={REFINERY_SESSION_STATE_NAME} className="flex-wrap min-inline-0" cap="fit" gap="field" role="group">
              <RefineryChip tone={status === "active" ? "accent" : "neutral"}>{status}</RefineryChip>
              <RefineryChip tone="neutral" wrap={true}>
                {applied ? "Applied · snapshot taken" : "Draft — the live card is untouched"}
              </RefineryChip>
            </Row>
            {/* No model here: each stage can run on a different model, so each lane credits its own result. */}
            <Text as="span" voice="credit">
              anchored {timeLib.formatRelativeAgo(anchoredAt)} · round {round}
            </Text>
          </>
        }
        step="masthead"
        title={cardName}
      />
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
