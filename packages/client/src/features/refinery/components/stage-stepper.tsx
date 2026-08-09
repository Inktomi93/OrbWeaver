// The Score → Rewrite → Analyze stepper (the mocks' Frame-1 anatomy): three stage cells with a
// per-stage status line, the ACTIVE stage's cell highlighted, the RUNNING stage carrying its spinner +
// in-cell Abort-free running note (runs are one bounded call — the surface never goes blank between
// stages, the previous settled payload stays under it). A pending stage states WHY it cannot run yet
// (the stage-order rule the server enforces) instead of a bare disabled cell.
//
// ── THE ACTIVE CELL IS TINTED, NOT FILLED (side-eye 2026-08-09 P1-1 + P1-11) ─────────────────────────
// It used to be `intent="primary"`, which cost two separate defects at once:
//   1. CONTRAST. The cell's `<Text voice="label">`/`voice="gloss"` re-spell their own colors
//      (`text-foreground` / `text-muted-foreground`), so on the solid `bg-primary` fill they measured
//      1.14:1 and 2.30:1. Fixed at the ROOT — `<Text ink="inherit">` (the axis added to @orb/ui for
//      exactly this, see text/variants.ts) hands the ink back to the cell — AND by dropping the fill.
//   2. HIERARCHY. A filled primary cell made the stepper the loudest thing in the pane, louder than the
//      Run CTA, and the same verb rendered at two different weights in two regions. One primary per
//      region, and in this pane it is the CTA — so the stepper's active treatment is a TINT + a RING +
//      a filled circular step badge (the mock's own drawing), which reads as "you are here" without
//      competing for the press.
// The treatment CROSSFADES between cells rather than sliding (motion guide §2 state-transition, on the
// Button base's own `transition-[color,background-color,box-shadow,scale]`): a shared indicator that
// physically slides needs a measured/absolutely-positioned element, which a feature cannot express
// under the tokens-only rule — it belongs in @orb/ui beside `Tabs.Indicator` and is NOT built here.

import type { RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_STAGES } from "@orb/contracts/refinery";
import { Button } from "@orb/ui/button";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";

export interface StageCell {
  readonly stage: RefineryStage;
  /** The one-line status ("overall 6.8 · full" / "not run yet" / "needs a score first"). */
  readonly status: string;
  readonly done: boolean;
  readonly running: boolean;
}

export interface StageStepperProps {
  readonly cells: readonly StageCell[];
  readonly active: RefineryStage;
  readonly onSelect: (stage: RefineryStage) => void;
}

const STAGE_LABEL: Record<RefineryStage, string> = { score: "Score", rewrite: "Rewrite", analyze: "Analyze" };

// The active cell's treatment: tint + ring, no fill (see the header). Held as one literal so Tailwind's
// scanner sees every class — it never assembles names.
const ACTIVE_CELL = "bg-primary/10 ring-1 ring-primary/40";
// A SETTLED cell's badge is filled (this stage has a result); a pending one is an outline. The filled
// badge is the only place `bg-primary` survives in the stepper, and it carries no text-voice inside it
// that the fill could break — the numeral takes the badge's own ink.
const BADGE_BASE = "flex size-glyph-md shrink-0 items-center justify-center rounded-full transition-colors duration-(--motion-fast) ease-out-expo";
const BADGE_DONE = "bg-primary text-primary-foreground";
const BADGE_PENDING = "border border-border text-muted-foreground";

/** The running cell's indeterminate hairline (polish item 1) — a bottom-edge sweep that says "this
 *  stage is working" without the pane going blank under it. Compositor-only (`translate`), and it
 *  carries its own reduced-motion opt-out through the shared `orb-indeterminate-hairline` class
 *  (ui/src/styles/globals.css), which removes the animation outright per guide §3.9 rather than
 *  shortening it. `aria-hidden` because it is pure ornament: the cell's status line already reads
 *  "running…" as real text, so the state is announced once, in words, rather than twice. (That status
 *  line replaced the previous in-cell `<Spinner>`, whose "Running" label was the ONLY accessible
 *  carrier of the state and sat where the step numeral belongs — the badge is now always present, so
 *  the cells stop reflowing between idle and running.) */
function RunningHairline(): ReactElement {
  return (
    <Container
      aria-hidden={true}
      className="orb-indeterminate-hairline pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden rounded-full bg-primary/30"
      data-testid={testId("refineryStepHairline")}
      name="refinery-step-hairline"
    />
  );
}

/** The cell's status line. A RUNNING cell says so in words — the hairline beside it is decorative
 *  (`aria-hidden`), so this string is the only carrier of the running state that reaches assistive
 *  tech. An absent cell falls back to the stage's resting copy rather than a blank line: the stepper
 *  always renders all three stages, whether or not a status was computed for each. */
function statusTextOf(cell: StageCell | undefined, running: boolean): string {
  if (running) {
    return "running…";
  }
  return cell === undefined ? "not run yet" : cell.status;
}

/** One stage cell. The numeral badge, the stage name, and the status line — all three take the cell's
 *  ink (`ink="inherit"`) so the treatment can change without re-auditing contrast per voice. */
function StageCellButton({ cell, index, stage, isActive, onSelect }: StageCellProps): ReactElement {
  const running = cell?.running === true;
  const cellStatus = statusTextOf(cell, running);
  return (
    <Button
      aria-current={isActive ? "step" : undefined}
      // `@max-lg:flex-none` releases the horizontal `flex-1` when the stepper stacks (see `StageStepper`):
      // a `flex-1` child in a flex-COLUMN grows on the vertical axis, which would stretch every cell to the
      // tallest one's height. `flex-none` gives each stacked cell its natural height; `items-stretch` on the
      // column parent takes them to full width.
      className={`relative flex-1 justify-start @max-lg:flex-none ${isActive ? ACTIVE_CELL : ""}`}
      data-active={isActive}
      data-running={running}
      data-stage={stage}
      data-testid={testId("refineryStep")}
      intent="secondary"
      onClick={(): void => onSelect(stage)}
      size="lg"
    >
      <Row align="center" gap="row">
        <Container className={`${BADGE_BASE} ${cell?.done === true ? BADGE_DONE : BADGE_PENDING}`} name="refinery-step-badge">
          <Text as="span" ink="inherit" voice="datum">
            {index + 1}
          </Text>
        </Container>
        <Stack align="start" gap="tight">
          <Text as="span" ink="inherit" voice="label">
            {STAGE_LABEL[stage]}
          </Text>
          <Text as="span" ink="inherit" voice="gloss">
            {cellStatus}
          </Text>
        </Stack>
      </Row>
      {running ? <RunningHairline /> : null}
    </Button>
  );
}

interface StageCellProps {
  readonly cell: StageCell | undefined;
  readonly index: number;
  readonly stage: RefineryStage;
  readonly isActive: boolean;
  readonly onSelect: (stage: RefineryStage) => void;
}

export function StageStepper({ cells, active, onSelect }: StageStepperProps): ReactElement {
  // STACKS VERTICALLY IN A NARROW CONTAINER (side-eye 2026-08-09 P2). Three rich cells (badge · name ·
  // status line) need ~500px to sit side by side; below that the third cell (Analyze) fell off the pane's
  // edge at the 430px mobile CONTENT width. `@max-lg:flex-col` reflows them into a one-column list when the
  // enclosing `@container` (the refinery-content surface) is under 32rem, so every cell keeps its full
  // status line instead of clipping — the container-model fix, not a viewport breakpoint. Wider panes keep
  // the horizontal flow. (Mounted bare in a CT it has no `@container` ancestor, so it stays horizontal.)
  return (
    <Row className="@max-lg:flex-col @max-lg:items-stretch" data-testid={testId("refineryStepper")} gap="tight">
      {REFINERY_STAGES.map((stage, i) => (
        <StageCellButton cell={cells.find((c) => c.stage === stage)} index={i} isActive={active === stage} key={stage} onSelect={onSelect} stage={stage} />
      ))}
    </Row>
  );
}
