import { CtIsolation } from "@orb/testkit/browser";
import { RevealGate } from "@orb/ui/reveal-gate";
import type { ReactElement } from "react";
import { useState } from "react";

/** Counts every toggle the gate reports, so a case reads the callback through the rendered page. */
function ToggleCount({ count }: { readonly count: number }): ReactElement {
  return <output aria-label="Reported toggles">{count}</output>;
}

export function UncontrolledGateStory({
  secret,
  hideable,
  disabled,
}: {
  readonly secret: string;
  readonly hideable: boolean;
  readonly disabled: boolean;
}): ReactElement {
  const [toggles, setToggles] = useState(0);
  return (
    <CtIsolation subject="RevealGate" isolates="Mounting content only after an explicit reveal, and moving focus with it, is the primitive's own behavior.">
      <RevealGate disabled={disabled} hideable={hideable} onReveal={(): void => setToggles(toggles + 1)} subject="Passphrase">
        <p>{secret}</p>
      </RevealGate>
      <ToggleCount count={toggles} />
    </CtIsolation>
  );
}

/** A parent that ignores the request: a controlled gate must not reveal itself. */
export function PinnedHiddenGateStory({ secret }: { readonly secret: string }): ReactElement {
  const [requests, setRequests] = useState(0);
  return (
    <CtIsolation subject="RevealGate" isolates="A controlled gate follows its caller's state, which no feature surface can pin from outside.">
      <RevealGate onReveal={(): void => setRequests(requests + 1)} revealed={false} subject="Passphrase">
        <p>{secret}</p>
      </RevealGate>
      <ToggleCount count={requests} />
    </CtIsolation>
  );
}

/** The reveal comes from a control outside the gate, so focus starts on a node the gate does not own. */
export function ExternallyRevealedGateStory({ secret }: { readonly secret: string }): ReactElement {
  const [revealed, setRevealed] = useState(false);
  return (
    <CtIsolation subject="RevealGate" isolates="Focus following a controlled reveal is the primitive's own effect, not a click on its trigger.">
      <button onClick={(): void => setRevealed(true)} type="button">
        Reveal from outside
      </button>
      <RevealGate revealed={revealed} subject="Passphrase">
        <p>{secret}</p>
      </RevealGate>
    </CtIsolation>
  );
}
