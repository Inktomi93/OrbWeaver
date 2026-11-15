// The params deck's ONE capability note — what stands where SAMPLING and
// REASONING would be when the chat-role capability descriptor is not in hand.
//
// A knob the model does not list is ABSENT, never a disabled slider — and with NO descriptor at all, those
// clusters are absent together. ONE NOTE, NOT THREE (side-eye F-02): the gate used to render per-cluster, so a
// descriptor-less deck printed the same line three times; the clusters share one cause, so they share one note.
// The clusters that need no descriptor (Quality, Context, Advanced) render beside it either way.
//
// isError ≠ no-model (side-eye F-02, the P1): the capability read FAILING (the review's receipt: `400
// incoherent routing (agent-sdk × local-light)`) rendered as "connect a chat model" to a user who had one
// connected — a swallowed server error dressed up as an empty state, so the server's own message is shown
// verbatim for every failure but one.
//
// WHICH CAUSE THE FAILURE NAMES IS DERIVED, NOT ASSERTED. The verdict is read off the structured `error.data`
// through the shared classifier (`lib/resolve-failure.ts`, which owns the code and reason map), never off message
// text. The gate keeps its own deck-context WORDS — its failure is that these knobs can't be shown at the model's
// real caps, not that the assembled turn can't be shown — so it consumes the `failureCause`/`resolveFailureMessage`
// SEAM, never `resolveFailureCopy`'s preset-turn copy.
//
// NO MODEL FOR CHAT IS A REAL STATE, NOT A FAILURE. An account that has added no connection, or whose chat role is
// unbound, has nothing for `connection.resolveChatCapability` to read: the runtime finds no binding
// (`packages/inference/src/resolve/resolve-task.ts` `connectionFor`) and the connection verb answers with its coded
// `roleModelUnset` refusal. The gate says so plainly, with one door to Connections and no server text. An earlier
// ruling deleted this state on the premise that it could not settle; a new user reaches it on first open, so the
// premise was false and the state is back, keyed on the code rather than on a pending window.
//
// PENDING IS NOT AN EMPTY STATE (lane FLK / F-02's class): the in-flight read holds a shape-matched skeleton that
// asserts nothing, so no state flashes at a user who has a model.
//
// The deck mounts `CapabilityGate` as the error render of its model-fed clusters' QueryBoundary, and
// `CapabilityGatePending` as that boundary's fallback, so each arm is the boundary's own state.

import { Button } from "@orb/ui/button";
import { Section } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { Notice } from "#components";
import { SkeletonRows } from "#data";
import { CONNECTIONS_LIST_ADDRESS, DIALOG_VERBS, MODEL_ROLES_PATH_TEXT } from "#lib";
import { openConfigTo } from "#state";
import { PRESET_NO_CHAT_MODEL_DETAIL, PRESET_NO_CHAT_MODEL_TITLE, PRESET_OPEN_CONNECTIONS_NAME } from "../lib/preset-names.ts";
import { failureCause, resolveFailureMessage } from "../lib/resolve-failure.ts";

/** One placeholder bar per model-fed cluster the settled read will fill (SAMPLING, REASONING and the seed
 *  row) — enough to hold the column's height so the deck does not jump when the descriptor lands. */
const PENDING_ROWS = 3;

const GATE_KICKER = "Sampling · reasoning · output";

/** The PENDING arm: a shape-matched skeleton that asserts nothing. */
export function CapabilityGatePending(): ReactElement {
  return (
    <Section kicker={GATE_KICKER}>
      {/* The ONE placeholder-row home (`SkeletonRows`, rollup-audit C2) — never a hand-assembled stack of
          `Skeleton`s, and never a spinner flash (UIP-309). It carries its own `aria-busy`. */}
      <SkeletonRows count={PENDING_ROWS} />
    </Section>
  );
}

export interface CapabilityGateProps {
  /** The capability read's THROWN error, as the boundary hands it. It is the error OBJECT, not a pre-extracted
   *  message: the band discriminates on the structured `error.data` tRPC puts there (via `failureCause`). */
  readonly error: unknown;
  /** Resets the boundary, so the read is made again. */
  readonly onRetry: () => void;
}

/** The FAILED arm, and the no-model state the same read ends in. */
export function CapabilityGate({ error, onRetry }: CapabilityGateProps): ReactElement {
  const cause = failureCause(error);
  if (cause === "no-model") {
    return (
      <Section kicker={GATE_KICKER}>
        <Notice
          action={
            <Button variant="outline" onClick={(): void => openConfigTo(CONNECTIONS_LIST_ADDRESS.group, CONNECTIONS_LIST_ADDRESS.sub)} size="sm" type="button">
              {PRESET_OPEN_CONNECTIONS_NAME}
            </Button>
          }
          detail={[PRESET_NO_CHAT_MODEL_DETAIL]}
          title={PRESET_NO_CHAT_MODEL_TITLE}
          tone="neutral"
        />
      </Section>
    );
  }
  // ONLY a `BAD_REQUEST` routing refusal earns a CAUSE here; every other code — a `NOT_FOUND`, a 500, a dropped
  // socket — withholds it. BOTH LINES SWING TOGETHER: an unearned arm states the READ and stops, exactly as the
  // classifier's own `unknown` copy does.
  const routing = cause === "routing";
  const message = resolveFailureMessage(error);
  const guidance = routing
    ? `This is a routing problem, not a missing connection: fix it under ${MODEL_ROLES_PATH_TEXT}.`
    : `Check your model roles under ${MODEL_ROLES_PATH_TEXT}, then retry.`;
  return (
    <Section kicker={GATE_KICKER}>
      <Notice
        action={
          <Button variant="outline" onClick={onRetry} size="sm" type="button">
            {DIALOG_VERBS.retry}
          </Button>
        }
        detail={message === null ? [guidance] : [message, guidance]}
        title={
          routing
            ? "Your chat model couldn't be resolved, so these knobs can't be shown at your model's real caps."
            : "Your model's capabilities couldn't be read, so these knobs can't be shown at their real caps."
        }
        tone="warning"
      />
    </Section>
  );
}
