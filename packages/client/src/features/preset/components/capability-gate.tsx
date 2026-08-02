// The params deck's ONE capability note (preset-surface-redesign.md §4) — what stands where SAMPLING and
// REASONING would be when the chat-role capability descriptor is not in hand.
//
// A knob the model does not list is ABSENT, never a disabled slider — and with NO descriptor at all, those
// clusters are absent together. ONE NOTE, NOT THREE (side-eye F-02): the gate used to render per-cluster, so a
// descriptor-less deck printed the same line three times; the clusters share one cause, so they share one note.
//
// isError ≠ no-model (side-eye F-02, the P1): the capability read FAILING (the review's receipt: `400
// incoherent routing (agent-sdk × local-light)`) rendered as "connect a chat model" to a user who had one
// connected — a swallowed server error dressed up as an empty state, so the server's own message is shown
// verbatim and the fix is named as the routing problem it is.
//
// PENDING IS NOT AN EMPTY STATE (lane FLK / F-02's class, 2026-08-02). This gate's two reachable states are
// PENDING and FAILED, and nothing else — `connection.resolveChatCapability` returns a REQUIRED descriptor
// (`ResolvedChatCapability.capability`), so a SETTLED-successful read always carries one and the deck never
// reaches this component. There is therefore no settled "no model is connected" arm: the unconfigured user
// resolves to a server default or gets a thrown routing error. The connect-a-model empty state this file used
// to render was reachable ONLY during the in-flight window — every editor open flashed "connect a chat model"
// at users who had one — so it is DELETED, and its slot now holds a shape-matched skeleton that asserts
// nothing. (With it goes the knob-naming line that existed so the empty state didn't read as "this feature
// doesn't exist": the state it explained no longer renders, and the kicker still names the clusters.)
//
// The `error === null` ⇒ PENDING derivation is the read's own exhaustiveness, not a coincidence: the deck
// renders this gate only when the descriptor is absent, and an absent descriptor with no error is by
// construction a read that has not landed.

import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { SkeletonRows } from "#data";

/** One placeholder bar per model-fed cluster the settled read will fill (SAMPLING, REASONING and the seed
 *  row) — enough to hold the column's height so the deck does not jump when the descriptor lands. */
const PENDING_ROWS = 3;

export interface CapabilityGateProps {
  /** The capability read's own failure message — `null` while the read is still PENDING. Those two states
   *  are exhaustive here (see the header): a settled-successful read carries a descriptor, so the deck
   *  renders its real clusters and never mounts this gate. */
  readonly error: string | null;
}

export function CapabilityGate({ error }: CapabilityGateProps): ReactElement {
  if (error === null) {
    return (
      <Section kicker="Sampling · reasoning · output">
        {/* The ONE placeholder-row home (`SkeletonRows`, rollup-audit C2) — never a hand-assembled stack of
            `Skeleton`s, and never a spinner flash (UIP-309). It carries its own `aria-busy`. */}
        <SkeletonRows count={PENDING_ROWS} />
      </Section>
    );
  }
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
