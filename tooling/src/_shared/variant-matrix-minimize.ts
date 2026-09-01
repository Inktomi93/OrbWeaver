// Coverage-preserving compaction for planned cells. Obligations are indexed once so pair/triple
// replacement evaluates integer sets instead of rebuilding full matrix receipts inside nested walks.

import type { VariantAssignment, VariantCell } from "./variant-matrix-contract.ts";

interface MinimizeArgs {
  readonly cells: readonly VariantCell[];
  readonly protectedCellIds: ReadonlySet<string>;
  readonly candidates: readonly VariantAssignment[];
  readonly obligations: readonly string[];
  readonly obligationsFor: (assignment: VariantAssignment) => readonly string[];
  readonly identity: (assignment: VariantAssignment) => string;
}

interface CandidateCoverage {
  readonly id: string;
  readonly assignment: VariantAssignment;
  readonly coverage: ReadonlySet<number>;
}

type PlannedCoverage = VariantCell & { readonly coverage: ReadonlySet<number> };

const TRIPLE_SIZE = 3;

function indexedCoverage(
  assignment: VariantAssignment,
  obligationIndex: ReadonlyMap<string, number>,
  obligationsFor: MinimizeArgs["obligationsFor"],
): ReadonlySet<number> {
  const coverage = new Set<number>();
  for (const obligation of obligationsFor(assignment)) {
    const index = obligationIndex.get(obligation);
    if (index !== undefined) {
      coverage.add(index);
    }
  }
  return coverage;
}

function coverageCounts(cells: readonly CandidateCoverage[], obligations: number): Uint16Array {
  const counts = new Uint16Array(obligations);
  for (const cell of cells) {
    for (const index of cell.coverage) {
      counts[index] = (counts[index] as number) + 1;
    }
  }
  return counts;
}

function removable(counts: Uint16Array, coverage: ReadonlySet<number>): boolean {
  for (const index of coverage) {
    if (counts[index] === 1) {
      return false;
    }
  }
  return true;
}

function missingAfter(counts: Uint16Array, removed: readonly CandidateCoverage[]): number[] {
  const missing: number[] = [];
  for (let index = 0; index < counts.length; index += 1) {
    const initial = counts[index];
    if (initial === undefined) {
      throw new Error(`INSTRUMENT ERROR: missing obligation count ${String(index)}`);
    }
    const remaining = removed.reduce<number>((count, cell) => count - Number(cell.coverage.has(index)), initial);
    if (remaining === 0) {
      missing.push(index);
    }
  }
  return missing;
}

function covers(coverage: ReadonlySet<number>, obligations: readonly number[]): boolean {
  return obligations.every((index) => coverage.has(index));
}

function candidateIndexByObligation(candidates: readonly CandidateCoverage[], obligations: number): readonly number[][] {
  return Array.from({ length: obligations }, (_, obligation) => candidates.flatMap((candidate, index) => (candidate.coverage.has(obligation) ? [index] : [])));
}

function leastCommonObligation(obligations: readonly number[], byObligation: readonly number[][]): number | undefined {
  return [...obligations].sort((left, right) => (byObligation[left]?.length ?? 0) - (byObligation[right]?.length ?? 0))[0];
}

function secondReplacement(
  candidates: readonly CandidateCoverage[],
  byObligation: readonly number[][],
  first: CandidateCoverage,
  remaining: readonly number[],
): CandidateCoverage | null {
  const pivot = leastCommonObligation(remaining, byObligation);
  for (const index of pivot === undefined ? [] : (byObligation[pivot] ?? [])) {
    const candidate = candidates[index];
    if (candidate !== undefined && candidate.id !== first.id && covers(candidate.coverage, remaining)) {
      return candidate;
    }
  }
  return null;
}

function replacementPair(
  candidates: readonly CandidateCoverage[],
  byObligation: readonly number[][],
  missing: readonly number[],
): readonly CandidateCoverage[] | null {
  if (missing.length === 0) {
    return [];
  }
  const pivot = leastCommonObligation(missing, byObligation);
  for (const index of pivot === undefined ? [] : (byObligation[pivot] ?? [])) {
    const first = candidates[index];
    if (first === undefined) {
      continue;
    }
    const remaining = missing.filter((obligation) => !first.coverage.has(obligation));
    if (remaining.length === 0) {
      return [first];
    }
    const second = secondReplacement(candidates, byObligation, first, remaining);
    if (second !== null) {
      return [first, second];
    }
  }
  return null;
}

function removableIndices(cells: readonly PlannedCoverage[], protectedCellIds: ReadonlySet<string>): number[] {
  return cells.flatMap((cell, index) => (protectedCellIds.has(cell.id) ? [] : [index]));
}

function pairs(indices: readonly number[]): readonly (readonly [number, number])[] {
  const result: Array<readonly [number, number]> = [];
  for (let left = indices.length - 1; left >= 0; left -= 1) {
    for (let right = left - 1; right >= 0; right -= 1) {
      result.push([indices[left] as number, indices[right] as number]);
    }
  }
  return result;
}

function triples(indices: readonly number[]): readonly (readonly [number, number, number])[] {
  const result: Array<readonly [number, number, number]> = [];
  for (let first = indices.length - 1; first >= 0; first -= 1) {
    for (let second = first - 1; second >= 0; second -= 1) {
      for (let third = second - 1; third >= 0; third -= 1) {
        result.push([indices[first] as number, indices[second] as number, indices[third] as number]);
      }
    }
  }
  return result;
}

function applyReplacement(cells: PlannedCoverage[], removed: readonly number[], replacements: readonly CandidateCoverage[]): void {
  for (const index of removed) {
    cells.splice(index, 1);
  }
  cells.push(...replacements.map((replacement) => ({ ...replacement })));
}

function removeRedundantCells(cells: PlannedCoverage[], args: MinimizeArgs): void {
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const candidate = cells[index];
    if (candidate !== undefined && !args.protectedCellIds.has(candidate.id) && removable(coverageCounts(cells, args.obligations.length), candidate.coverage)) {
      cells.splice(index, 1);
    }
  }
}

function replaceCellPairs(cells: PlannedCoverage[], args: MinimizeArgs, candidates: readonly CandidateCoverage[]): void {
  let replaced = true;
  while (replaced) {
    replaced = false;
    const counts = coverageCounts(cells, args.obligations.length);
    for (const [left, right] of pairs(removableIndices(cells, args.protectedCellIds))) {
      const removed = [cells[left], cells[right]].filter((cell): cell is PlannedCoverage => cell !== undefined);
      const missing = missingAfter(counts, removed);
      const replacement = candidates.find((candidate) => covers(candidate.coverage, missing));
      if (replacement !== undefined) {
        applyReplacement(cells, [left, right], [replacement]);
        replaced = true;
        break;
      }
    }
  }
}

function replaceCellTriples(cells: PlannedCoverage[], args: MinimizeArgs, candidates: readonly CandidateCoverage[]): void {
  const byObligation = candidateIndexByObligation(candidates, args.obligations.length);
  let replaced = true;
  while (replaced) {
    replaced = false;
    const counts = coverageCounts(cells, args.obligations.length);
    for (const triple of triples(removableIndices(cells, args.protectedCellIds))) {
      const removed = triple.map((index) => cells[index]).filter((cell): cell is PlannedCoverage => cell !== undefined);
      const replacements = replacementPair(candidates, byObligation, missingAfter(counts, removed));
      if (replacements !== null && replacements.length < TRIPLE_SIZE) {
        applyReplacement(cells, triple, replacements);
        replaced = true;
        break;
      }
    }
  }
}

export function minimizeVariantCells(args: MinimizeArgs): VariantCell[] {
  const obligationIndex = new Map(args.obligations.map((obligation, index) => [obligation, index]));
  const candidates = args.candidates.map((assignment) => ({
    id: args.identity(assignment),
    assignment,
    coverage: indexedCoverage(assignment, obligationIndex, args.obligationsFor),
  }));
  const cells: PlannedCoverage[] = args.cells.map((cell) => ({
    ...cell,
    coverage: indexedCoverage(cell.assignment, obligationIndex, args.obligationsFor),
  }));

  removeRedundantCells(cells, args);
  replaceCellPairs(cells, args, candidates);
  replaceCellTriples(cells, args, candidates);
  return cells.map(({ id, assignment }) => ({ id, assignment }));
}
