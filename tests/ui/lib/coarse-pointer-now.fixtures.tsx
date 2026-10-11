// Probe wrapper for use-coarse-pointer CT (CT mounts from a non-test module). Renders the hook's live boolean as text.
import { useCoarsePointer } from "@orb/ui/lib";
import type { ReactElement } from "react";

export function CoarsePointerProbe(): ReactElement {
  return <span data-slot="coarse-pointer-probe">{String(useCoarsePointer())}</span>;
}
