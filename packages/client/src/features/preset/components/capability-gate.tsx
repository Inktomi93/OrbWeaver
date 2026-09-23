// The params deck's ONE capability note — what stands where SAMPLING and
// REASONING would be when the chat-role capability descriptor is not in hand.
//
// A knob the model does not list is ABSENT, never a disabled slider — and with NO descriptor at all, those
// clusters are absent together. ONE NOTE, NOT THREE (side-eye F-02): the gate used to render per-cluster, so a
// descriptor-less deck printed the same line three times; the clusters share one cause, so they share one note.
//
// isError ≠ no-model (side-eye F-02, the P1): the capability read FAILING (the review's receipt: `400
// incoherent routing (agent-sdk × local-light)`) rendered as "connect a chat model" to a user who had one
// connected — a swallowed server error dressed up as an empty state, so the server's own message is shown
// verbatim.
//
// WHICH CAUSE THE FAILURE NAMES IS DERIVED, NOT ASSERTED (2026-08-08 — the same second-defect the readout's
// `EffectiveProfile` took). The F-02 fix printed an UNCONDITIONAL "this is a routing problem, not a missing
// connection" over whatever the read threw — so a `NOT_FOUND`, a 500 or a dropped socket all got told they
// had a routing fault, and the "not a missing connection" clause is literally INVERTED over any failure that
// IS a missing precondition. The verdict is now kept VERBATIM only for the `BAD_REQUEST` that earns it and
// WITHHELD otherwise, discriminated through the shared classifier (`lib/resolve-failure.ts`, which owns the
// `error.data.code` map and states the fork). The gate keeps its own deck-context WORDS — its failure is
// that these knobs can't be shown at the model's real caps, not that the assembled turn can't be shown — so
// it consumes the `failureCause`/`resolveFailureMessage` SEAM, never `resolveFailureCopy`'s preset-turn copy.
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
import type { ReadFailure } from "../lib/resolve-failure.ts";
import { failureCause, resolveFailureMessage } from "../lib/resolve-failure.ts";

/** One placeholder bar per model-fed cluster the settled read will fill (SAMPLING, REASONING and the seed
 *  row) — enough to hold the column's height so the deck does not jump when the descriptor lands. */
const PENDING_ROWS = 3;

export interface CapabilityGateProps {
  /** The capability read's THROWN error — `null` while the read is still PENDING. Those two states are
   *  exhaustive here (see the header): a settled-successful read carries a descriptor, so the deck renders
   *  its real clusters and never mounts this gate.
   *
   *  It is the error OBJECT, not a pre-extracted message: the band discriminates on the structured
   *  `error.data.code` tRPC puts there (via `failureCause`) to decide whether it has EARNED the routing
   *  verdict. A caller that flattened it to `.message` first would take that choice away.
   *
   *  TYPED `ReadFailure | null`, never `unknown` (graduation verifier, 2026-08-08): the FAILED arm is
   *  selected by `error !== null`, so a widened prop let an `undefined` — the shape a query that has not
   *  landed hands up — select a permanent failure band under a read that never failed. (Not `Error`
   *  either: `useQuery().error` is a `TRPCClientErrorLike`, an interface with no `name`, so `tsc` refuses
   *  it — see `ReadFailure`'s own note.) */
  readonly error: ReadFailure | null;
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
  // ONLY a `BAD_REQUEST` (the routing refusal `assertCoherent` throws) earns a CAUSE here; every other code
  // — a `NOT_FOUND`, a missing precondition, a 500, a dropped socket — withholds it. BOTH LINES SWING
  // TOGETHER (graduation verifier, 2026-08-08): the first cut discriminated only the guidance, so the
  // HEADLINE still asserted "your chat model couldn't be resolved" over a data-less transport failure, which
  // is the very class this module was minted to kill — a confident cause over an error that names none. The
  // unearned arm states the READ and stops, exactly as the classifier's own `unknown` copy does.
  const routing = failureCause(error) === "routing";
  const message = resolveFailureMessage(error);
  return (
    <Section kicker="Sampling · reasoning · output">
      <Row align="start" className="rounded-base border border-warning bg-warning/10 text-warning" gap="field" padding="row">
        <Icon icon={AlertTriangle} size="sm" />
        <Stack gap="tight">
          <Text prose={true} voice="label">
            {routing
              ? "Your chat model couldn't be resolved, so these knobs can't be shown at your model's real caps."
              : "Your model's capabilities couldn't be read, so these knobs can't be shown at their real caps."}
          </Text>
          {message === null ? null : (
            <Text prose={true} voice="gloss">
              {message}
            </Text>
          )}
          <Text prose={true} voice="gloss">
            {routing
              ? "This is a routing problem, not a missing connection — fix it under Settings → Connections → Model roles."
              : "Check your model roles under Settings → Connections → Model roles, then retry."}
          </Text>
        </Stack>
      </Row>
    </Section>
  );
}
