// Story wrapper for reveal-gate CT (CT mounts from a non-test module). Reproduces the real
// controlled-consumer shape: the parent owns `revealed` and re-renders in response to `onReveal`,
// while the component itself never flips state on its own.
import { RevealGate } from "@orb/ui/reveal-gate";
import type { ReactElement } from "react";
import { useState } from "react";

export function ControlledHarness(): ReactElement {
  const [revealed, setRevealed] = useState(false);
  const [callCount, setCallCount] = useState(0);
  return (
    <div>
      <span data-testid="call-count">{callCount}</span>
      <RevealGate
        onReveal={(next): void => {
          setCallCount((c) => c + 1);
          setRevealed(next);
        }}
        revealed={revealed}
      >
        sk-secret-token-12345
      </RevealGate>
    </div>
  );
}
