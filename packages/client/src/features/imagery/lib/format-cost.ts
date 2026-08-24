// The imagery COST VOICE — one home for how a spend is written, because more than one imagery surface now
// shows the user what something cost: the lightbox's provenance strip (the durable per-image cost, from
// `imagery.readProvenance`) and the imagine modal's preview receipt (the extraction call's cost, from
// `imagery.extractPrompt`). Four decimals is not telemetry precision, it is honesty: one image is fractions
// of a cent to a few cents, and a money surface that rounds a real charge to `$0.00` is lying about it.

/** The decimals a dollar spend is written at — the smallest real charge here is ~$0.0002. */
const COST_DECIMALS = 4;

/** A spend in dollars — `$0.0012`. */
export function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(COST_DECIMALS)}`;
}
