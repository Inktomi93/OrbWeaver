// The structured-output SHAPE labels + Select options (D126). One label map, two consumers: the Select's
// items and the row's "Using the deployment default: …" floor sentence — so the picked option and the named
// floor can never read as two different things. The list DERIVES from the `STRUCTURED_OUTPUT_SHAPES` tuple
// rather than mirroring it (the LOG_LEVEL_ITEMS precedent).

import type { StructuredOutputVehicle } from "@orb/contracts/role-clients";
import { STRUCTURED_OUTPUT_VEHICLES } from "@orb/contracts/role-clients";
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

/** The VEHICLE labels (task #36) — the second, COMPOSING axis: the shape above says how we spell an optional
 *  field, this says which endpoint feature carries the schema at all. Same two-consumer rule, same
 *  short-by-measurement rule (the 200px trigger ellipses anything longer). */
export const STRUCTURED_OUTPUT_VEHICLE_LABELS: Record<StructuredOutputVehicle, string> = {
  auto: "Automatic",
  "response-format": "Enforced schema",
  "forced-tool": "Forced tool call",
};

export const STRUCTURED_OUTPUT_VEHICLE_ITEMS: SelectItems<string> = STRUCTURED_OUTPUT_VEHICLES.map((value) => ({
  value,
  label: STRUCTURED_OUTPUT_VEHICLE_LABELS[value],
}));
