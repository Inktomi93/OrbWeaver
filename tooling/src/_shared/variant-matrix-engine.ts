// Private deterministic planning engine. The public contract stays in `variant-matrix.ts`; this file
// owns validation, completion, coverage, and minimization so the shared door remains readable and both
// files stay below the tooling-size law without weakening it.

import { instrumentRefusal } from "./page-validate.ts";
import type {
  VariantAssignment,
  VariantAxis,
  VariantCell,
  VariantMatrixPlan,
  VariantMatrixSpec,
  VariantRequiredRow,
  VariantRequiredTwin,
} from "./variant-matrix-contract.ts";
import { coverReachablePairCandidates } from "./variant-matrix-cover.ts";
import { minimizeVariantCells } from "./variant-matrix-minimize.ts";
import type { MatrixRequirements } from "./variant-matrix-requirements.ts";
import { requirementKeys, requirementObligations, requirementReceipts } from "./variant-matrix-requirements.ts";
import { assignmentForPair, sampledAssignments } from "./variant-matrix-sampling.ts";

function own(object: VariantAssignment, key: string): boolean {
  return Object.hasOwn(object, key);
}

function validateAxis(axis: VariantAxis, axes: ReadonlyMap<string, VariantAxis>): void {
  if (axis.id.trim() === "") {
    instrumentRefusal("variant matrix has an empty axis id");
  }
  if (axes.has(axis.id)) {
    instrumentRefusal(`duplicate axis ${axis.id}`);
  }
  if (axis.values.length === 0) {
    instrumentRefusal(`axis ${axis.id} has no values`);
  }
  const values = new Set<string>();
  for (const value of axis.values) {
    if (value.id.trim() === "") {
      instrumentRefusal(`axis ${axis.id} has an empty value id`);
    }
    if (values.has(value.id)) {
      instrumentRefusal(`duplicate value ${axis.id}=${value.id}`);
    }
    values.add(value.id);
  }
}

function validateSpec(spec: VariantMatrixSpec): Map<string, VariantAxis> {
  if (spec.axes.length === 0) {
    instrumentRefusal("variant matrix has no axes");
  }
  const axes = new Map<string, VariantAxis>();
  for (const axis of spec.axes) {
    validateAxis(axis, axes);
    axes.set(axis.id, axis);
  }
  return axes;
}

function validateAssignment(axes: ReadonlyMap<string, VariantAxis>, assignment: VariantAssignment, owner: string): void {
  for (const [axisId, valueId] of Object.entries(assignment)) {
    const axis = axes.get(axisId);
    if (axis === undefined) {
      instrumentRefusal(`${owner} names unknown axis ${axisId}`);
    }
    if (!axis.values.some((value) => value.id === valueId)) {
      instrumentRefusal(`${owner} names unknown value ${axisId}=${valueId}`);
    }
  }
}

export function variantCellId(axes: readonly VariantAxis[], assignment: VariantAssignment): string {
  return axes
    .map((axis) => {
      const value = assignment[axis.id];
      if (value === undefined) {
        instrumentRefusal(`cell identity is missing axis ${axis.id}`);
      }
      return `${axis.id}=${value}`;
    })
    .join("__");
}

function pairKey(leftAxis: VariantAxis, leftValue: string, rightAxis: VariantAxis, rightValue: string): string {
  return `${leftAxis.id}=${leftValue}|${rightAxis.id}=${rightValue}`;
}
function valueKey(axis: VariantAxis, value: string): string {
  return `${axis.id}=${value}`;
}

function declarationOffset(axis: VariantAxis, salt: string): number {
  let total = 0;
  for (const character of `${salt}:${axis.id}`) {
    total += character.codePointAt(0) ?? 0;
  }
  return total % axis.values.length;
}

function findCompletion(spec: VariantMatrixSpec, assignment: VariantAssignment, uncoveredPairs: ReadonlySet<string>, salt = ""): VariantAssignment | null {
  if (!spec.isLegal(assignment)) {
    return null;
  }
  const nextAxis = spec.axes.find((axis) => !own(assignment, axis.id));
  if (nextAxis === undefined) {
    return assignment;
  }
  const offset = declarationOffset(nextAxis, salt);
  const candidates = nextAxis.values
    .map((value, index) => {
      const next = { ...assignment, [nextAxis.id]: value.id };
      if (!spec.isLegal(next)) {
        return null;
      }
      let score = 0;
      for (const priorAxis of spec.axes) {
        const priorValue = next[priorAxis.id];
        if (priorAxis.id === nextAxis.id || priorValue === undefined) {
          continue;
        }
        const leftIndex = spec.axes.indexOf(priorAxis);
        const rightIndex = spec.axes.indexOf(nextAxis);
        const key = leftIndex < rightIndex ? pairKey(priorAxis, priorValue, nextAxis, value.id) : pairKey(nextAxis, value.id, priorAxis, priorValue);
        if (uncoveredPairs.has(key)) {
          score += 1;
        }
      }
      return { index, next, score, tieRank: (index - offset + nextAxis.values.length) % nextAxis.values.length };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => right.score - left.score || left.tieRank - right.tieRank || left.index - right.index);

  for (const candidate of candidates) {
    const completed = findCompletion(spec, candidate.next, uncoveredPairs, salt);
    if (completed !== null) {
      return completed;
    }
  }
  return null;
}

function findTwinCompletion(
  spec: VariantMatrixSpec,
  twin: VariantRequiredTwin,
  assignment: VariantAssignment,
): { readonly left: VariantAssignment; readonly right: VariantAssignment } | null {
  const left = { ...assignment, [twin.axis]: twin.left };
  const right = { ...assignment, [twin.axis]: twin.right };
  if (!(spec.isLegal(left) && spec.isLegal(right))) {
    return null;
  }
  const nextAxis = spec.axes.find((axis) => axis.id !== twin.axis && !own(assignment, axis.id));
  if (nextAxis === undefined) {
    return { left, right };
  }
  const offset = declarationOffset(nextAxis, twin.id);
  const values = [...nextAxis.values].sort(
    (leftValue, rightValue) =>
      ((nextAxis.values.indexOf(leftValue) - offset + nextAxis.values.length) % nextAxis.values.length) -
      ((nextAxis.values.indexOf(rightValue) - offset + nextAxis.values.length) % nextAxis.values.length),
  );
  for (const value of values) {
    const completed = findTwinCompletion(spec, twin, { ...assignment, [nextAxis.id]: value.id });
    if (completed !== null) {
      return completed;
    }
  }
  return null;
}

function cellPairs(axes: readonly VariantAxis[], assignment: VariantAssignment): string[] {
  const pairs: string[] = [];
  for (let left = 0; left < axes.length; left += 1) {
    const leftAxis = axes[left];
    if (leftAxis === undefined) {
      continue;
    }
    for (let right = left + 1; right < axes.length; right += 1) {
      const rightAxis = axes[right];
      if (rightAxis === undefined) {
        continue;
      }
      const leftValue = assignment[leftAxis.id];
      const rightValue = assignment[rightAxis.id];
      if (leftValue !== undefined && rightValue !== undefined) {
        pairs.push(pairKey(leftAxis, leftValue, rightAxis, rightValue));
      }
    }
  }
  return pairs;
}

function cellValues(axes: readonly VariantAxis[], assignment: VariantAssignment): string[] {
  return axes.map((axis) => valueKey(axis, assignment[axis.id] ?? instrumentRefusal(`cell is missing axis ${axis.id}`)));
}

function coveredBy(cells: readonly VariantCell[], axes: readonly VariantAxis[]): { pairs: Set<string>; values: Set<string> } {
  const pairs = new Set<string>();
  const values = new Set<string>();
  for (const cell of cells) {
    for (const pair of cellPairs(axes, cell.assignment)) {
      pairs.add(pair);
    }
    for (const value of cellValues(axes, cell.assignment)) {
      values.add(value);
    }
  }
  return { pairs, values };
}

interface MatrixState {
  readonly spec: VariantMatrixSpec;
  readonly uncoveredPairs: Set<string>;
  readonly cells: Map<string, VariantCell>;
}

function validateRequirementIds(requirements: MatrixRequirements): void {
  const requirementIds = new Set<string>();
  for (const requirement of [...requirements.rows, ...requirements.twins]) {
    if (requirementIds.has(requirement.id)) {
      instrumentRefusal(`duplicate requirement ${requirement.id}`);
    }
    requirementIds.add(requirement.id);
  }
}

function validateTwin(axesById: ReadonlyMap<string, VariantAxis>, twin: VariantRequiredTwin): void {
  validateAssignment(axesById, twin.where, `required twin ${twin.id}`);
  const axis = axesById.get(twin.axis);
  if (axis === undefined) {
    instrumentRefusal(`required twin ${twin.id} names unknown axis ${twin.axis}`);
  }
  if (own(twin.where, twin.axis)) {
    instrumentRefusal(`required twin ${twin.id} repeats its varied axis ${twin.axis}`);
  }
  for (const value of [twin.left, twin.right]) {
    if (!axis.values.some((candidate) => candidate.id === value)) {
      instrumentRefusal(`required twin ${twin.id} names unknown value ${twin.axis}=${value}`);
    }
  }
  if (twin.left === twin.right) {
    instrumentRefusal(`required twin ${twin.id} does not vary ${twin.axis}`);
  }
}

function validateRequirements(spec: VariantMatrixSpec, axesById: ReadonlyMap<string, VariantAxis>): MatrixRequirements {
  const requirements = { rows: spec.requiredRows ?? [], twins: spec.requiredTwins ?? [] };
  validateRequirementIds(requirements);
  for (const row of requirements.rows) {
    validateAssignment(axesById, row.assignment, `required row ${row.id}`);
  }
  for (const twin of requirements.twins) {
    validateTwin(axesById, twin);
  }
  return requirements;
}

function reachablePairsForAxes(spec: VariantMatrixSpec, leftAxis: VariantAxis, rightAxis: VariantAxis): string[] {
  const pairs: string[] = [];
  for (const leftValue of leftAxis.values) {
    for (const rightValue of rightAxis.values) {
      const seed = { [leftAxis.id]: leftValue.id, [rightAxis.id]: rightValue.id };
      if (findCompletion(spec, seed, new Set()) !== null) {
        pairs.push(pairKey(leftAxis, leftValue.id, rightAxis, rightValue.id));
      }
    }
  }
  return pairs;
}

function reachablePairKeys(spec: VariantMatrixSpec): string[] {
  const reachablePairs: string[] = [];
  for (let left = 0; left < spec.axes.length; left += 1) {
    const leftAxis = spec.axes[left] as VariantAxis;
    for (let right = left + 1; right < spec.axes.length; right += 1) {
      const rightAxis = spec.axes[right] as VariantAxis;
      reachablePairs.push(...reachablePairsForAxes(spec, leftAxis, rightAxis));
    }
  }
  return reachablePairs;
}

function reachableValueKeys(spec: VariantMatrixSpec): Set<string> {
  const reachableValues = new Set<string>();
  for (const axis of spec.axes) {
    for (const value of axis.values) {
      if (findCompletion(spec, { [axis.id]: value.id }, new Set()) !== null) {
        reachableValues.add(valueKey(axis, value.id));
      }
    }
  }
  return reachableValues;
}

function addCell(state: MatrixState, assignment: VariantAssignment): VariantCell {
  const id = variantCellId(state.spec.axes, assignment);
  const cell = state.cells.get(id) ?? { id, assignment };
  state.cells.set(id, cell);
  for (const pair of cellPairs(state.spec.axes, assignment)) {
    state.uncoveredPairs.delete(pair);
  }
  return cell;
}

function seedRequiredRows(state: MatrixState, rows: readonly VariantRequiredRow[]): void {
  for (const row of rows) {
    const completed = findCompletion(state.spec, row.assignment, state.uncoveredPairs, row.id);
    if (completed === null) {
      instrumentRefusal(`required row impossible (${row.id})`);
    }
    addCell(state, completed);
  }
}

function seedRequiredTwins(state: MatrixState, twins: readonly VariantRequiredTwin[]): void {
  for (const twin of twins) {
    const completed = findTwinCompletion(state.spec, twin, twin.where);
    if (completed === null) {
      instrumentRefusal(`required twin impossible (${twin.id})`);
    }
    addCell(state, completed.left);
    addCell(state, completed.right);
  }
}

function coverReachablePairs(state: MatrixState): readonly VariantAssignment[] {
  return coverReachablePairCandidates({
    uncovered: state.uncoveredPairs,
    samples: sampledAssignments(state.spec, state.uncoveredPairs.size),
    complete: (pair) => findCompletion(state.spec, assignmentForPair(pair), state.uncoveredPairs, pair),
    identity: (assignment) => variantCellId(state.spec.axes, assignment),
    pairs: (assignment) => cellPairs(state.spec.axes, assignment),
    add: (assignment) => {
      addCell(state, assignment);
    },
    impossible: (pair) => instrumentRefusal(`reachable pair became impossible (${pair})`),
  });
}

function coverReachableValues(state: MatrixState, reachableValues: ReadonlySet<string>): void {
  let valueCoverage = coveredBy([...state.cells.values()], state.spec.axes).values;
  for (const axis of state.spec.axes) {
    for (const value of axis.values) {
      const key = valueKey(axis, value.id);
      if (!reachableValues.has(key) || valueCoverage.has(key)) {
        continue;
      }
      const completed = findCompletion(state.spec, { [axis.id]: value.id }, state.uncoveredPairs);
      if (completed === null) {
        instrumentRefusal(`reachable value became impossible (${key})`);
      }
      addCell(state, completed);
      valueCoverage = coveredBy([...state.cells.values()], state.spec.axes).values;
    }
  }
}

function finalCoverage(
  spec: VariantMatrixSpec,
  minimized: readonly VariantCell[],
  reachablePairs: readonly string[],
  reachableValues: ReadonlySet<string>,
): { readonly pairs: Set<string>; readonly values: Set<string> } {
  const coverage = coveredBy(minimized, spec.axes);
  const uncovered = reachablePairs.filter((pair) => !coverage.pairs.has(pair));
  if (uncovered.length > 0) {
    instrumentRefusal(`matrix left ${uncovered.length} reachable pairs uncovered`);
  }
  for (const value of reachableValues) {
    if (!coverage.values.has(value)) {
      instrumentRefusal(`matrix left reachable value uncovered (${value})`);
    }
  }
  return coverage;
}

export function planVariantMatrix(spec: VariantMatrixSpec): VariantMatrixPlan {
  const axesById = validateSpec(spec);
  const requirements = validateRequirements(spec, axesById);
  const reachablePairs = reachablePairKeys(spec);
  const reachableValues = reachableValueKeys(spec);
  if (reachableValues.size === 0) {
    instrumentRefusal("variant matrix has no legal cells");
  }
  const state: MatrixState = {
    spec,
    uncoveredPairs: new Set(reachablePairs),
    cells: new Map(),
  };
  seedRequiredRows(state, requirements.rows);
  seedRequiredTwins(state, requirements.twins);
  const candidates = coverReachablePairs(state);
  coverReachableValues(state, reachableValues);
  const requirementCoverage = requirementKeys(requirements);
  const minimized = minimizeVariantCells({
    cells: [...state.cells.values()],
    protectedCellIds: new Set(),
    candidates,
    obligations: [...reachablePairs, ...reachableValues, ...requirementCoverage],
    obligationsFor: (assignment) => [
      ...cellPairs(state.spec.axes, assignment),
      ...cellValues(state.spec.axes, assignment),
      ...requirementObligations(requirements, assignment),
    ],
    identity: (assignment) => variantCellId(state.spec.axes, assignment),
  });
  const coverage = finalCoverage(spec, minimized, reachablePairs, reachableValues);
  const receipts = requirementReceipts(minimized, requirements);

  return {
    cells: minimized,
    receipt: {
      axes: spec.axes.map((axis) => ({ id: axis.id, values: axis.values.map((value) => value.id) })),
      reachablePairs,
      coveredPairs: reachablePairs.filter((pair) => coverage.pairs.has(pair)),
      uncoveredPairs: [],
      requiredRows: receipts.rows,
      requiredTwins: receipts.twins,
      cellIds: minimized.map((cell) => cell.id),
    },
  };
}
