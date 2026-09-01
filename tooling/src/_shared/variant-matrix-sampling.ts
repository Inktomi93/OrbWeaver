// Deterministic bounded assignment sampling for the private matrix engine. This is the cohesive seam
// extracted before variant-matrix-engine.ts crossed the tooling-size cap; it does not own coverage,
// minimization, or tool policy.

import type { VariantAssignment, VariantAxis, VariantMatrixSpec } from "./variant-matrix-contract.ts";

function instrumentError(message: string): never {
  throw new Error(`INSTRUMENT ERROR: ${message}`);
}

export function assignmentForPair(pair: string): VariantAssignment {
  const [left, right] = pair.split("|");
  const leftSplit = left?.indexOf("=") ?? -1;
  const rightSplit = right?.indexOf("=") ?? -1;
  if (left === undefined || right === undefined || leftSplit < 1 || rightSplit < 1) {
    instrumentError(`invalid reachable pair ${pair}`);
  }
  return {
    [left.slice(0, leftSplit)]: left.slice(leftSplit + 1),
    [right.slice(0, rightSplit)]: right.slice(rightSplit + 1),
  };
}

const SAMPLE_MULTIPLIER = 48_271;
const SAMPLE_MODULUS = 2_147_483_647;

function nextSampleState(current: number): number {
  return (current * SAMPLE_MULTIPLIER) % SAMPLE_MODULUS;
}

export function sampledAssignments(spec: VariantMatrixSpec, count: number): VariantAssignment[] {
  const samples: VariantAssignment[] = [];
  for (let sample = 1; sample <= count; sample += 1) {
    let state = sample;
    const assignment: Record<string, string> = {};
    for (const axis of spec.axes) {
      state = nextSampleState(state);
      assignment[axis.id] = (axis.values[state % axis.values.length] as VariantAxis["values"][number]).id;
    }
    if (spec.isLegal(assignment)) {
      samples.push(assignment);
    }
  }
  return samples;
}
