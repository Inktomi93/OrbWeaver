// The params deck's ONE capability note (preset-surface-redesign.md §4) — what stands where SAMPLING,
// REASONING and OUTPUT would be when no capability descriptor resolves.
//
// A knob the model does not list is ABSENT, never a disabled slider — and with NO model resolved at all,
// those three clusters are absent together. An empty state that only says "connect a model" reads as "this
// feature doesn't exist" (owner dogfood), so the note NAMES the knobs it is hiding.
//
// ONE NOTE, NOT THREE (side-eye F-02): the gate used to render per-cluster, so a modelless deck printed the
// same "Pick one under Settings → Connections → Model roles" line three times and the honors sentence twice.
// The three clusters share one cause, so they share one note; the knob names stay, joined.
//
// isError ≠ no-model (side-eye F-02, the P1): the capability read FAILING (the review's receipt: `400
// incoherent routing (agent-sdk × local-light)`) rendered as "connect a chat model" to a user who had one
// connected — a swallowed server error dressed up as an empty state. The two branches are different
// problems with different fixes, so they read differently and the server's own message is shown verbatim.

import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** The knobs each hidden cluster owns — named so the absence reads as gated, not as missing. */
const GATED_KNOBS = [
  "Temperature, top-p, top-k, the penalties and seed",
  "the reasoning switch, effort level and thinking budget",
  "max output tokens, max context tokens and verbosity",
] as const;

export interface CapabilityGateProps {
  /** The capability read's own failure message — `null` when the read simply resolved no model. */
  readonly error: string | null;
}

export function CapabilityGate({ error }: CapabilityGateProps): ReactElement {
  if (error !== null) {
    return (
      <Section kicker="Sampling · reasoning · output">
        <Row align="start" className="rounded-base border border-warning bg-warning/10 text-warning" gap="field" padding="row">
          <Icon icon={AlertTriangle} size="sm" />
          <Stack gap="tight">
            <Text prose={true} voice="label">
              Your chat model couldn't be resolved, so these knobs can't be shown at your model's real caps.
            </Text>
            <Text prose={true} voice="gloss">
              {error}
            </Text>
            <Text prose={true} voice="gloss">
              This is a routing problem, not a missing connection — fix it under Settings → Connections → Model roles.
            </Text>
          </Stack>
        </Row>
      </Section>
    );
  }
  return (
    <Section kicker="Sampling · reasoning · output">
      {/* `prose`: this is three sentences of teaching, not a status line — at the kicker's own micro step
          with tight leading it was a wall (side-eye F-31). */}
      <Text prose={true} voice="gloss">
        {GATED_KNOBS.join(", ")} appear here once a chat model is connected — the deck shows only the knobs your model honors, at your model's real caps. Pick
        one under Settings → Connections → Model roles.
      </Text>
    </Section>
  );
}
