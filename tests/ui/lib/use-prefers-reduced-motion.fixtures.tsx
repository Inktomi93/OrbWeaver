// Probe wrapper for use-prefers-reduced-motion CT (CT mounts from a non-test module). Renders the
// hook's live boolean as text so a mounted-component assertion can read it directly.
import { usePrefersReducedMotion } from "@orb/ui/lib";
import type { ReactElement } from "react";

export function ReducedMotionProbe(): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  return <span data-slot="reduced-motion-probe">{String(reducedMotion)}</span>;
}
