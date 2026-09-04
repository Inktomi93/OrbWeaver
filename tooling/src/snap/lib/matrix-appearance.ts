// Pure aggregate and reconciliation for the rated matrix's appearance evidence population.
import type { AppearanceInvariantResult } from "../contract/appearance-invariants.ts";

export interface AppearanceAggregate {
  readonly receipts: number;
  readonly subjects: number;
  readonly declared: number;
  readonly candidates: number;
  readonly reached: number;
  readonly sampled: number;
  readonly skipped: number;
  readonly occluded: number;
  readonly offViewport: number;
  readonly pixels: number;
  readonly pixelSamples: number;
  readonly cascades: number;
}

export function aggregateAppearance(results: readonly AppearanceInvariantResult[]): AppearanceAggregate {
  return {
    receipts: results.length,
    subjects: results.reduce((sum, result) => sum + result.receipt.subjects.length, 0),
    declared: results.reduce((sum, result) => sum + result.evaluation.accounting.declared, 0),
    candidates: results.reduce((sum, result) => sum + result.evaluation.accounting.candidates, 0),
    reached: results.reduce((sum, result) => sum + result.evaluation.accounting.reached, 0),
    sampled: results.reduce((sum, result) => sum + result.evaluation.accounting.sampled, 0),
    skipped: results.reduce((sum, result) => sum + result.evaluation.accounting.skipped.reduce((count, row) => count + row.count, 0), 0),
    occluded: results.reduce((sum, result) => sum + result.evaluation.accounting.occluded, 0),
    offViewport: results.reduce((sum, result) => sum + result.evaluation.accounting.offViewport, 0),
    pixels: results.reduce((sum, result) => sum + result.receipt.pixels.length, 0),
    pixelSamples: results.reduce((sum, result) => sum + result.receipt.pixels.reduce((count, pixel) => count + pixel.sampled, 0), 0),
    cascades: results.reduce((sum, result) => sum + result.receipt.cascade.length, 0),
  };
}

function instrumentError(message: string): never {
  throw new Error(`INSTRUMENT ERROR: ${message}`);
}

export function reconcileAppearanceAggregate(aggregate: AppearanceAggregate): void {
  if (
    aggregate.receipts <= 0 ||
    aggregate.subjects <= 0 ||
    aggregate.declared <= 0 ||
    aggregate.reached <= 0 ||
    aggregate.sampled <= 0 ||
    aggregate.pixels <= 0 ||
    aggregate.cascades <= 0
  ) {
    instrumentError(`matrix appearance aggregate has a blind denominator: ${JSON.stringify(aggregate)}`);
  }
  if (aggregate.subjects !== aggregate.declared) {
    instrumentError(`matrix appearance subjects=${aggregate.subjects} != declared=${aggregate.declared}`);
  }
  if (aggregate.candidates !== aggregate.reached + aggregate.skipped) {
    instrumentError(`matrix appearance candidates=${aggregate.candidates} != reached=${aggregate.reached} + skipped=${aggregate.skipped}`);
  }
  if (aggregate.reached !== aggregate.sampled + aggregate.occluded + aggregate.offViewport) {
    instrumentError(
      `matrix appearance reached=${aggregate.reached} != sampled=${aggregate.sampled} + occluded=${aggregate.occluded} + offViewport=${aggregate.offViewport}`,
    );
  }
  if (aggregate.pixelSamples !== aggregate.pixels) {
    instrumentError(`matrix appearance pixel samples=${aggregate.pixelSamples} != declared pixels=${aggregate.pixels}`);
  }
}
