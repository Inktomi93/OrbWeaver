// The WORKBENCH masthead (program #102, mockup variant C): the surface's ONE opening statement — the card
// being refined, at the display step — plus the state the whole canvas is qualified by.
//
// WHY THE CARD NAME IS THE MASTHEAD AND NOT A LABEL. The pane's header row used to set the card's name at
// `voice="label"` (13px), the same step as every field name in the payload beneath it, on a surface whose
// entire job is "iterate THIS card". The #102 ramp assigns the display step to a surface's one opening
// statement and this is it; `masthead` rather than `hero` because a NAME is a sentence, not a figure that
// counts up (hero's mono/tabular face reads as a serial — UI-Density-Law.md §2.3).
//
// THE STATE LINE IS §20b's ONE PLACE draft flips to written, unchanged: the git-terms model rides the copy,
// never the words. The CREDIT line beside it ("anchored … · round N") is the film-credit register
// the #102 review minted for exactly this — who/what is in the thing and how long ago — and it carries the
// PIN, which is the invariant a user has to hold while reading three lanes at once: every analyze compares
// against the card as it was when the session started, never the previous rewrite.
//
// THE SCOPE STRIP STAYS, and the mockup does not draw it. That is a drawing, not a ruling: the strip is the
// only place the session's selection is legible, and the Edit-scope door beside it is the §8 preflight
// warn's own remedy. It WRAPS (side-eye 2026-08-09 P2) — a non-wrapping row clipped the tail chips off the
// pane at the 3-pane / mobile container width.
//
// ── THIS IS SCOPE'S ONE EDITING HOME (#158 item 1, owner-ruled 2026-08-17) ───────────────────────────
// The CONTEXT panel's Setup tab used to render the same selection with its own "Change" button and its own
// `ScopeEditorDialog`, inches away: two independently-editable homes for one concept on one screen. The
// ruling is one home, and it landed HERE rather than in Setup — the reverse of the shape #158's own
// parenthetical suggested — on three pieces of evidence. (1) The paragraph above is a RECORDED ruling that
// this strip and its door belong together. (2) The §8 remedy it exists for ("Narrow the selection", in
// `lane-run-control.tsx`) fires in the CONTENT pane; moving the editor to CONTEXT would make that remedy a
// cross-panel jump the shell has no verb for. (3) Setup mounted the editor with `score={null}` while this
// call site passes the real score payload, so Setup's was the DEGRADED copy — keeping it and deleting the
// rich one is the wrong direction. Setup now carries a READOUT that names this door, the same shape its
// Guidance row already used for the run bar's textarea.

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
  readonly status: string;
  /** The apply landed — §20b's draft line flips to written. */
  readonly applied: boolean;
  /** When the session pinned the card (its `createdAt`) — the anchor the credit line states. */
  readonly anchoredAt: number;
  readonly round: number;
  readonly selection: RefinerySelection;
  readonly onEditScope: () => void;
}

export function SessionMasthead({ characterId, cardName, status, applied, anchoredAt, round, selection, onEditScope }: SessionMastheadProps): ReactElement {
  return (
    <Stack data-testid={testId("refineryMasthead")} gap="field">
      <Text voice="kicker">Refinery · workbench</Text>
      <Row align="baseline" className="flex-wrap" gap="row">
        <Heading className="min-w-0" level={2} voice="masthead">
          {cardName}
        </Heading>
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
      <Text className="max-w-(--reading-measure-prose)" voice="gloss">
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
