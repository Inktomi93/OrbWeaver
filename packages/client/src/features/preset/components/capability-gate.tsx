// The params deck's connect-a-model note (preset-surface-redesign.md §4) — the capability GATE's copy, one
// home for the three model-fed clusters that share it (SAMPLING · REASONING · OUTPUT, split across
// params-deck.tsx and params-limits.tsx; its own file so neither imports the other).
//
// A knob the model does not list is ABSENT, never a disabled slider — and with NO model resolved at all,
// the whole cluster is absent. An empty state that only says "connect a model" reads as "this feature
// doesn't exist" (owner dogfood), so each arm NAMES the knobs it is hiding.

import { Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

const CAPABILITY_GATE_COPY = {
  sampling: { kicker: "Sampling", knobs: "Temperature, top-p, top-k, the penalties and seed" },
  reasoning: { kicker: "Reasoning", knobs: "The reasoning switch, effort level and thinking budget" },
  output: { kicker: "Output", knobs: "Max output tokens, max context tokens and verbosity" },
} as const satisfies Record<string, { readonly kicker: string; readonly knobs: string }>;

export interface CapabilityGateProps {
  readonly arm: keyof typeof CAPABILITY_GATE_COPY;
}

export function CapabilityGate({ arm }: CapabilityGateProps): ReactElement {
  const copy = CAPABILITY_GATE_COPY[arm];
  return (
    <Section kicker={copy.kicker}>
      <Text voice="gloss">
        {copy.knobs} appear here once a chat model is connected — the deck shows only the knobs your model honors, at your model's real caps.
      </Text>
      <Text voice="gloss">Pick one under Settings → Connections → Model roles.</Text>
    </Section>
  );
}
