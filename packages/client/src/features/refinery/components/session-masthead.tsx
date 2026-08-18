// The WORKBENCH masthead (program #102, mockup variant C): the surface's ONE opening statement — the card
// being refined, at the display step — plus the state the whole canvas is qualified by.
//
// WHY THE CARD NAME IS THE MASTHEAD AND NOT A LABEL. The pane's header row used to set the card's name at
// `voice="label"` (13px), the same step as every field name in the payload beneath it, on a surface whose
// entire job is "iterate THIS card". The #102 ramp assigns the display step to a surface's one opening
// statement and this is it; `masthead` rather than `hero` because a NAME is a sentence, not a figure that
// counts up (hero's mono/tabular face reads as a serial — density-pass-spec.md §2.3).
//
// THE STATE LINE IS §20b's ONE PLACE draft flips to written, unchanged: the git-terms model rides the copy,
// never the words. The CREDIT line beside it ("anchored … · model · round N") is the film-credit register
// the #102 review minted for exactly this — who/what is in the thing and how long ago — and it carries the
// PIN, which is the invariant a user has to hold while reading three lanes at once: every analyze compares
// against the card as it was when the session started, never the previous rewrite.
//
// THE SCOPE STRIP STAYS, and the mockup does not draw it. That is a drawing, not a ruling: the strip is the
// only place the session's selection is legible, and the Edit-scope door beside it is the §8 preflight
// warn's own remedy. It WRAPS (side-eye 2026-08-09 P2) — a non-wrapping row clipped the tail chips off the
// pane at the 3-pane / mobile container width.

import type { RefinerySelection } from "@orb/contracts/refinery";
import { modelDisplayName } from "@orb/kit/model-name";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId, timeLib } from "#lib";
import { scopeChipLabelOf } from "../lib/render-plan.ts";
import { RefineryChip } from "./refinery-chip.tsx";

export interface SessionMastheadProps {
  readonly cardName: string;
  readonly status: string;
  /** The apply landed — §20b's draft line flips to written. */
  readonly applied: boolean;
  /** When the session pinned the card (its `createdAt`) — the anchor the credit line states. */
  readonly anchoredAt: number;
  /** The model the latest run used, or null before anything has run. */
  readonly model: string | null;
  readonly round: number;
  readonly selection: RefinerySelection;
  readonly onEditScope: () => void;
}

/** The full model identifier, when the readable derivation changed it — `null` when a hosted id derives to
 *  itself, so the credit line's `title` never repeats what is already on screen (#115's stutter rule). */
function modelTitleOf(model: string | null): string | null {
  return model === null || modelDisplayName(model) === model ? null : model;
}

export function SessionMasthead({ cardName, status, applied, anchoredAt, model, round, selection, onEditScope }: SessionMastheadProps): ReactElement {
  const modelTitle = modelTitleOf(model);
  return (
    <Stack data-testid={testId("refineryMasthead")} gap="field">
      <Text voice="kicker">Refinery · workbench</Text>
      <Row align="baseline" className="flex-wrap" gap="row">
        <Heading className="min-w-0" level={2} voice="masthead">
          {cardName}
        </Heading>
        <RefineryChip tone={status === "active" ? "info" : "neutral"}>{status}</RefineryChip>
        <RefineryChip tone="neutral">{applied ? "applied · snapshot taken" : "draft — the live card is untouched"}</RefineryChip>
        {/* THE CREDIT LINE NAMES THE MODEL, IT DOES NOT PRINT ITS PATH (side-eye 2026-08-17, finding b).
            A local connection's `model` is an absolute weights path — the 106-character shape
            `@orb/kit/model-name` exists for (#115) — and inlining it raw wrapped this line onto a second
            row under the card's name, in caps mono, as the loudest thing on the masthead after the title.
            The full identifier is not lost: it rides the line's `title`, and only when the derivation
            actually shortened it (the #115 stutter rule the context tab's economics line already uses). */}
        <Text as="span" voice="credit" {...(modelTitle === null ? {} : { title: modelTitle })}>
          anchored {timeLib.formatRelativeAgo(anchoredAt)}
          {model === null ? "" : ` · ${modelDisplayName(model)}`} · round {round}
        </Text>
        <Row className="flex-1 justify-end">
          <Button intent="secondary" onClick={onEditScope} size="sm">
            Edit scope
          </Button>
        </Row>
      </Row>
      <Text className="max-w-(--reading-measure)" voice="gloss">
        Score, rewrite and analyze in one view — every analyze compares against the card as it was pinned, never the previous rewrite.
      </Text>
      <Row align="center" className="flex-wrap" gap="field">
        <Text voice="kicker">Scope</Text>
        {selection.fields.map((field) => (
          <RefineryChip key={field} tone="info">
            {scopeChipLabelOf(field, selection.greetingIndexes)}
          </RefineryChip>
        ))}
      </Row>
    </Stack>
  );
}
