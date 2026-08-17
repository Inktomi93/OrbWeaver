// Lane 2 of the WORKBENCH — the REWRITE island (program #102, mockup variant C). It is the surface's ONE
// focal element (CD3): the widest lane, the only box carrying the `--color-speaker` stripe and the rationed
// `--shadow-glow`, because the accept work is the decision the user came to make. Score and analyze recede
// to kickers and hairlines on either side of it.
//
// THE FOCAL IS CARRIED BY STRIPE + GLOW, NOT ACCENT FILL — the hearth-room precedent (home's #102 leg) and
// the same reason: `design-audit-checks.ts` classifies a chromatic glow on an element's OWN box-shadow as
// the generated-UI tell, so the ::before layer is the sanctioned carrier, and it rides the island's edge at
// -1px where it never sits behind reading text. Every colour is a per-theme token: `--color-speaker`
// resolves differently under each built-in theme and to the scope's own primary under an imported one.
//
// THE RADIUS IS THE TIER'S, NOT `--radius-card`. The workbench is an INSTRUMENT surface, so the island
// resolves `--radius-base` from `tiers.css`; `--radius-card` is the ELEVATED/floating step (D6) and this
// island does not float. The glow halo therefore tracks `--radius-base` — a halo drawn at a radius its host
// does not have is a visible double edge.
//
// THE LANE STATES ITS OWN LIFE: not-run-yet says WHY (the stage-order rule the server enforces), a call in
// flight replaces that with what is happening, a walked-back run says superseded and offers the way home,
// and a rewrite the pipeline has moved past says so rather than sitting fresh-looking beside a newer score.

import { Card } from "@orb/ui/card";
import type { CompareDecision } from "@orb/ui/compare-blocks";
import { Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { Trpc } from "#data";
import { testId } from "#lib";
import type { ReviewEntry } from "../lib/review-entries.ts";
import { AcceptReview } from "./accept-review.tsx";
import { LaneBand, LaneNotes } from "./lane-band.tsx";
import { RefineryChip } from "./refinery-chip.tsx";

// Re-derived locally from the wire (§7.4 — never a hand-picked exported alias).
type RunView = inferOutput<Trpc["refinery"]["listRuns"]>[number];
/** EXACTLY what the lane reads off a run — its round, its stage, and the provenance the band prints. The
 *  reviewable ENTRIES arrive separately (the surface joins the payload against the live card and the
 *  session pin, which is not this component's job), so taking the whole row here would be asking callers
 *  for a payload the lane never opens. Derived from the wire, never re-spelled. */
type RewriteRunView = Pick<RunView, "iteration" | "payloadConfig" | "stage">;

/** The speaker stripe — the same three declarations the immersive chat rows and home's hearth paint
 *  (message-row-variants `STRIPE_LEFT`), inline because a border WIDTH from a non-spacing token has no
 *  utility. */
const STRIPE: CSSProperties = {
  borderInlineStartWidth: "var(--immersive-stripe-width)",
  borderInlineStartStyle: "solid",
  borderInlineStartColor: "var(--color-speaker)",
};

/** The rationed accent glow on the sanctioned ::before carrier, at the INSTRUMENT island radius (header). */
const GLOW =
  "relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-(--radius-base) before:opacity-40 before:shadow-glow before:content-['']";

export interface RewriteLaneProps {
  readonly run: RewriteRunView | null;
  readonly entries: readonly ReviewEntry[];
  readonly decided: readonly CompareDecision[];
  readonly onDecide: (index: number, decision: CompareDecision) => void;
  /** A rewrite call is in flight (a bare `runStage`, or the rewrite half of an `iterate` round). */
  readonly running: boolean;
  /** The lane is showing a run the CONTEXT ledger pinned (§16.1). */
  readonly viewingBack: boolean;
  /** Why this rewrite no longer answers the pipeline beside it, or null. */
  readonly behind: string | null;
  readonly onBackToLatest: () => void;
  /** The lane's own run control (fit line · Re-run rewrite · the §8 warn) — composed by the surface. */
  readonly runControl: ReactNode;
}

/** The provenance word on the lane's band: the F4 mode a model ran under, or the hand-authored arm. */
function provenanceOf(run: RewriteRunView | null): string | null {
  if (run === null) {
    return null;
  }
  const config = run.payloadConfig;
  if ("mode" in config) {
    return config.mode;
  }
  return config.kind === "manual" ? "hand-authored" : "custom";
}

/** The lane's body, in its three arms. A total dispatch in one function rather than nested ternaries in the
 *  JSX: the not-run arm states WHY (the stage-order rule the server enforces) instead of a bare empty box,
 *  and the in-flight arm replaces that copy with what is happening — there is no payload to shape a
 *  skeleton from on a first run, so this is the honest minimum. */
function RewriteBody({
  settled,
  running,
  entries,
  decided,
  onDecide,
}: {
  settled: boolean;
  running: boolean;
  entries: readonly ReviewEntry[];
  decided: readonly CompareDecision[];
  onDecide: (index: number, decision: CompareDecision) => void;
}): ReactElement {
  if (settled) {
    return <AcceptReview decided={decided} entries={entries} onDecide={onDecide} />;
  }
  if (running) {
    return (
      <Stack aria-busy={true} gap="row">
        <Text voice="label">Running rewrite…</Text>
        <Skeleton className="h-control-lg w-full" />
        <Skeleton className="h-control-md w-full" />
        <Skeleton className="h-control-md w-2/3" />
      </Stack>
    );
  }
  return (
    <Stack gap="tight">
      <Text voice="label">Nothing settled for rewrite yet</Text>
      <Text voice="gloss">Run the rewrite (or hand-edit) once a score exists — only the scoped fields are touched.</Text>
    </Stack>
  );
}

export function RewriteLane({ run, entries, decided, onDecide, running, viewingBack, behind, onBackToLatest, runControl }: RewriteLaneProps): ReactElement {
  const kept = decided.filter((d) => d === true).length;
  const discarded = decided.filter((d) => d === false).length;
  const undecided = entries.length - kept - discarded;
  const provenance = provenanceOf(run);
  const settled = run !== null && run.stage === "rewrite";
  return (
    <Card className={GLOW} data-testid={testId("refineryRewriteLane")} style={STRIPE}>
      <Stack gap="row">
        <LaneBand kicker={provenance === null ? "2 · Rewrite" : `2 · Rewrite · ${provenance}`}>
          {settled ? (
            <>
              <RefineryChip tone="good">{kept} kept</RefineryChip>
              <RefineryChip tone="bad">{discarded} discarded</RefineryChip>
              <RefineryChip tone="warn">{undecided} undecided</RefineryChip>
            </>
          ) : null}
        </LaneBand>
        {runControl}
        <LaneNotes behind={behind} iteration={run?.iteration ?? null} onBackToLatest={onBackToLatest} viewingBack={viewingBack} />
        <RewriteBody decided={decided} entries={entries} onDecide={onDecide} running={running} settled={settled} />
      </Stack>
    </Card>
  );
}
