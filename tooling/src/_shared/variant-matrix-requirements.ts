// Private semantic-requirement accounting for the shared matrix planner. Rows and twins must survive
// minimization by meaning, not by a frozen cell identity; keeping that proof here gives the planning
// engine headroom without exposing a second public matrix door.

import type { VariantAssignment, VariantCell, VariantRequiredRow, VariantRequiredTwin } from "./variant-matrix-contract.ts";

export interface MatrixRequirements {
  readonly rows: readonly VariantRequiredRow[];
  readonly twins: readonly VariantRequiredTwin[];
}

function assignmentIncludes(assignment: VariantAssignment, required: VariantAssignment): boolean {
  return Object.entries(required).every(([axis, value]) => assignment[axis] === value);
}

export function requirementObligations(requirements: MatrixRequirements, assignment: VariantAssignment): string[] {
  const obligations: string[] = [];
  for (const row of requirements.rows) {
    if (assignmentIncludes(assignment, row.assignment)) {
      obligations.push(`required-row:${row.id}`);
    }
  }
  for (const twin of requirements.twins) {
    if (!assignmentIncludes(assignment, twin.where)) {
      continue;
    }
    if (assignment[twin.axis] === twin.left) {
      obligations.push(`required-twin:${twin.id}:left`);
    }
    if (assignment[twin.axis] === twin.right) {
      obligations.push(`required-twin:${twin.id}:right`);
    }
  }
  return obligations;
}

export function requirementKeys(requirements: MatrixRequirements): string[] {
  return [
    ...requirements.rows.map((row) => `required-row:${row.id}`),
    ...requirements.twins.flatMap((twin) => [`required-twin:${twin.id}:left`, `required-twin:${twin.id}:right`]),
  ];
}

export function requirementReceipts(
  cells: readonly VariantCell[],
  requirements: MatrixRequirements,
): {
  readonly rows: readonly { id: string; cellId: string }[];
  readonly twins: readonly { id: string; leftCellId: string; rightCellId: string }[];
} {
  const rows = requirements.rows.map((row) => {
    const cell = cells.find((candidate) => assignmentIncludes(candidate.assignment, row.assignment));
    if (cell === undefined) {
      throw new Error(`INSTRUMENT ERROR: required row disappeared (${row.id})`);
    }
    return { id: row.id, cellId: cell.id };
  });
  const twins = requirements.twins.map((twin) => {
    const matching = cells.filter((candidate) => assignmentIncludes(candidate.assignment, twin.where));
    const left = matching.find((candidate) => candidate.assignment[twin.axis] === twin.left);
    const right = matching.find((candidate) => candidate.assignment[twin.axis] === twin.right);
    if (left === undefined || right === undefined) {
      throw new Error(`INSTRUMENT ERROR: required twin disappeared (${twin.id})`);
    }
    return { id: twin.id, leftCellId: left.id, rightCellId: right.id };
  });
  return { rows, twins };
}
