// The structured-output SHAPE labels + Select options (D126). One label map, two consumers: the Select's
// items and the row's "Using the deployment default: …" floor sentence — so the picked option and the named
// floor can never read as two different things. The list DERIVES from the `STRUCTURED_OUTPUT_SHAPES` tuple
// rather than mirroring it (the LOG_LEVEL_ITEMS precedent).

import type { StructuredOutputShape } from "@orb/contracts/settings";
import { STRUCTURED_OUTPUT_SHAPES } from "@orb/contracts/settings";
import type { SelectItems } from "@orb/ui/select";

/** SHORT by measurement, not by taste: the `Select` primitive's trigger is a fixed 200px, and a descriptive
 *  label ("As projected — optional fields stay optional") renders ELLIPSED there — the selected value becomes
 *  unreadable, which is the one thing the control must show. What each shape MEANS is always-visible copy in
 *  the section body, which names them by exactly these two words. */
export const STRUCTURED_OUTPUT_SHAPE_LABELS: Record<StructuredOutputShape, string> = {
  "as-projected": "As projected",
  "strict-compatible": "Strict-compatible",
};

export const STRUCTURED_OUTPUT_SHAPE_ITEMS: SelectItems<string> = STRUCTURED_OUTPUT_SHAPES.map((value) => ({
  value,
  label: STRUCTURED_OUTPUT_SHAPE_LABELS[value],
}));
