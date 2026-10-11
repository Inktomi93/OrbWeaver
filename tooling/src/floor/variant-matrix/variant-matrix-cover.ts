// Candidate selection for the private matrix engine. Each reachable pair seeds one legal completion;
// greedy set-cover selection then chooses completions that discharge the most still-open obligations.
// This stays deterministic and bounded by the pair population, never the Cartesian product.

import type { VariantAssignment } from "./variant-matrix-contract.ts";

interface PairCoverCandidate {
  readonly id: string;
  readonly assignment: VariantAssignment;
}

interface PairCoverArgs {
  readonly uncovered: Set<string>;
  readonly samples: readonly VariantAssignment[];
  readonly complete: (pair: string) => VariantAssignment | null;
  readonly identity: (assignment: VariantAssignment) => string;
  readonly pairs: (assignment: VariantAssignment) => readonly string[];
  readonly add: (assignment: VariantAssignment) => void;
  readonly impossible: (pair: string) => never;
}

function candidatePool(args: PairCoverArgs): readonly PairCoverCandidate[] {
  const candidates = new Map<string, PairCoverCandidate>();
  for (const assignment of args.samples) {
    const id = args.identity(assignment);
    candidates.set(id, { id, assignment });
  }
  for (const pair of args.uncovered) {
    const assignment = args.complete(pair);
    if (assignment === null) {
      args.impossible(pair);
    }
    const id = args.identity(assignment);
    candidates.set(id, { id, assignment });
  }
  return [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function uncoveredScore(args: PairCoverArgs, candidate: PairCoverCandidate): number {
  let score = 0;
  for (const pair of args.pairs(candidate.assignment)) {
    score += Number(args.uncovered.has(pair));
  }
  return score;
}

export function coverReachablePairCandidates(args: PairCoverArgs): readonly VariantAssignment[] {
  const candidates = candidatePool(args);
  while (args.uncovered.size > 0) {
    let best: PairCoverCandidate | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = uncoveredScore(args, candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best === null) {
      args.impossible(args.uncovered.values().next().value as string);
    }
    args.add(best.assignment);
  }
  return candidates.map((candidate) => candidate.assignment);
}
