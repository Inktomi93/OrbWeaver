// Deterministic pairwise planning shared by verdict tools. This module is deliberately policy-neutral:
// callers own their axes, legality, mandatory risk rows, and verdicts. It never builds a Cartesian product.

export interface VariantValue {
  readonly id: string;
  readonly payload: unknown;
}

export interface VariantAxis {
  readonly id: string;
  readonly values: readonly VariantValue[];
}

export type VariantAssignment = Readonly<Record<string, string>>;

export interface VariantRequiredRow {
  readonly id: string;
  readonly assignment: VariantAssignment;
}

export interface VariantRequiredTwin {
  readonly id: string;
  readonly axis: string;
  readonly left: string;
  readonly right: string;
  readonly where: VariantAssignment;
}

export interface VariantMatrixSpec {
  readonly axes: readonly VariantAxis[];
  readonly isLegal: (assignment: VariantAssignment) => boolean;
  readonly requiredRows?: readonly VariantRequiredRow[];
  readonly requiredTwins?: readonly VariantRequiredTwin[];
}

export interface VariantCell {
  readonly id: string;
  readonly assignment: VariantAssignment;
}

export interface VariantMatrixReceipt {
  readonly axes: readonly { readonly id: string; readonly values: readonly string[] }[];
  readonly reachablePairs: readonly string[];
  readonly coveredPairs: readonly string[];
  readonly uncoveredPairs: readonly string[];
  readonly requiredRows: readonly { readonly id: string; readonly cellId: string }[];
  readonly requiredTwins: readonly {
    readonly id: string;
    readonly leftCellId: string;
    readonly rightCellId: string;
  }[];
  readonly cellIds: readonly string[];
}

export interface VariantMatrixPlan {
  readonly cells: readonly VariantCell[];
  readonly receipt: VariantMatrixReceipt;
}

function instrumentError(message: string): never {
  throw new Error(`INSTRUMENT ERROR: ${message}`);
}

function own(object: VariantAssignment, key: string): boolean {
  return Object.hasOwn(object, key);
}

function validateAxis(axis: VariantAxis, axes: ReadonlyMap<string, VariantAxis>): void {
  if (axis.id.trim() === "") {
    instrumentError("variant matrix has an empty axis id");
  }
  if (axes.has(axis.id)) {
    instrumentError(`duplicate axis ${axis.id}`);
  }
  if (axis.values.length === 0) {
    instrumentError(`axis ${axis.id} has no values`);
  }
  const values = new Set<string>();
  for (const value of axis.values) {
    if (value.id.trim() === "") {
      instrumentError(`axis ${axis.id} has an empty value id`);
    }
    if (values.has(value.id)) {
      instrumentError(`duplicate value ${axis.id}=${value.id}`);
    }
    values.add(value.id);
  }
}

function validateSpec(spec: VariantMatrixSpec): Map<string, VariantAxis> {
  if (spec.axes.length === 0) {
    instrumentError("variant matrix has no axes");
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
      instrumentError(`${owner} names unknown axis ${axisId}`);
    }
    if (!axis.values.some((value) => value.id === valueId)) {
      instrumentError(`${owner} names unknown value ${axisId}=${valueId}`);
    }
  }
}

export function variantCellId(axes: readonly VariantAxis[], assignment: VariantAssignment): string {
  return axes
    .map((axis) => {
      const value = assignment[axis.id];
      if (value === undefined) {
        instrumentError(`cell identity is missing axis ${axis.id}`);
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

function findCompletion(spec: VariantMatrixSpec, assignment: VariantAssignment, uncoveredPairs: ReadonlySet<string>): VariantAssignment | null {
  if (!spec.isLegal(assignment)) {
    return null;
  }
  const nextAxis = spec.axes.find((axis) => !own(assignment, axis.id));
  if (nextAxis === undefined) {
    return assignment;
  }
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
      return { index, next, score };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  for (const candidate of candidates) {
    const completed = findCompletion(spec, candidate.next, uncoveredPairs);
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
  for (const value of nextAxis.values) {
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
  return axes.map((axis) => valueKey(axis, assignment[axis.id] ?? instrumentError(`cell is missing axis ${axis.id}`)));
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

interface MatrixRequirements {
  readonly rows: readonly VariantRequiredRow[];
  readonly twins: readonly VariantRequiredTwin[];
}

interface MatrixState {
  readonly spec: VariantMatrixSpec;
  readonly uncoveredPairs: Set<string>;
  readonly cells: Map<string, VariantCell>;
  readonly protectedCellIds: Set<string>;
  readonly rowReceipt: { id: string; cellId: string }[];
  readonly twinReceipt: { id: string; leftCellId: string; rightCellId: string }[];
}

function validateRequirementIds(requirements: MatrixRequirements): void {
  const requirementIds = new Set<string>();
  for (const requirement of [...requirements.rows, ...requirements.twins]) {
    if (requirementIds.has(requirement.id)) {
      instrumentError(`duplicate requirement ${requirement.id}`);
    }
    requirementIds.add(requirement.id);
  }
}

function validateTwin(axesById: ReadonlyMap<string, VariantAxis>, twin: VariantRequiredTwin): void {
  validateAssignment(axesById, twin.where, `required twin ${twin.id}`);
  const axis = axesById.get(twin.axis);
  if (axis === undefined) {
    instrumentError(`required twin ${twin.id} names unknown axis ${twin.axis}`);
  }
  if (own(twin.where, twin.axis)) {
    instrumentError(`required twin ${twin.id} repeats its varied axis ${twin.axis}`);
  }
  for (const value of [twin.left, twin.right]) {
    if (!axis.values.some((candidate) => candidate.id === value)) {
      instrumentError(`required twin ${twin.id} names unknown value ${twin.axis}=${value}`);
    }
  }
  if (twin.left === twin.right) {
    instrumentError(`required twin ${twin.id} does not vary ${twin.axis}`);
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

function addCell(state: MatrixState, assignment: VariantAssignment, protect: boolean): VariantCell {
  const id = variantCellId(state.spec.axes, assignment);
  const cell = state.cells.get(id) ?? { id, assignment };
  state.cells.set(id, cell);
  for (const pair of cellPairs(state.spec.axes, assignment)) {
    state.uncoveredPairs.delete(pair);
  }
  if (protect) {
    state.protectedCellIds.add(id);
  }
  return cell;
}

function seedRequiredRows(state: MatrixState, rows: readonly VariantRequiredRow[]): void {
  for (const row of rows) {
    const completed = findCompletion(state.spec, row.assignment, state.uncoveredPairs);
    if (completed === null) {
      instrumentError(`required row impossible (${row.id})`);
    }
    const cell = addCell(state, completed, true);
    state.rowReceipt.push({ id: row.id, cellId: cell.id });
  }
}

function seedRequiredTwins(state: MatrixState, twins: readonly VariantRequiredTwin[]): void {
  for (const twin of twins) {
    const completed = findTwinCompletion(state.spec, twin, twin.where);
    if (completed === null) {
      instrumentError(`required twin impossible (${twin.id})`);
    }
    const left = addCell(state, completed.left, true);
    const right = addCell(state, completed.right, true);
    state.twinReceipt.push({ id: twin.id, leftCellId: left.id, rightCellId: right.id });
  }
}

function assignmentForPair(pair: string): VariantAssignment {
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

function coverReachablePairs(state: MatrixState): void {
  while (state.uncoveredPairs.size > 0) {
    const nextPair = state.uncoveredPairs.values().next().value as string;
    const completed = findCompletion(state.spec, assignmentForPair(nextPair), state.uncoveredPairs);
    if (completed === null) {
      instrumentError(`reachable pair became impossible (${nextPair})`);
    }
    addCell(state, completed, false);
  }
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
        instrumentError(`reachable value became impossible (${key})`);
      }
      addCell(state, completed, false);
      valueCoverage = coveredBy([...state.cells.values()], state.spec.axes).values;
    }
  }
}

function minimizeCells(state: MatrixState, reachablePairs: readonly string[], reachableValues: ReadonlySet<string>): VariantCell[] {
  const minimized = [...state.cells.values()];
  for (let index = minimized.length - 1; index >= 0; index -= 1) {
    const candidate = minimized[index];
    if (candidate === undefined || state.protectedCellIds.has(candidate.id)) {
      continue;
    }
    const remaining = minimized.filter((_, cellIndex) => cellIndex !== index);
    const coverage = coveredBy(remaining, state.spec.axes);
    const pairsRemain = reachablePairs.every((pair) => coverage.pairs.has(pair));
    const valuesRemain = [...reachableValues].every((value) => coverage.values.has(value));
    if (pairsRemain && valuesRemain) {
      minimized.splice(index, 1);
    }
  }
  return minimized;
}

function finalCoverage(
  spec: VariantMatrixSpec,
  minimized: readonly VariantCell[],
  reachablePairs: readonly string[],
  reachableValues: ReadonlySet<string>,
): { readonly coverage: { readonly pairs: Set<string>; readonly values: Set<string> }; readonly uncovered: readonly string[] } {
  const coverage = coveredBy(minimized, spec.axes);
  const uncovered = reachablePairs.filter((pair) => !coverage.pairs.has(pair));
  if (uncovered.length > 0) {
    instrumentError(`matrix left ${uncovered.length} reachable pairs uncovered`);
  }
  for (const value of reachableValues) {
    if (!coverage.values.has(value)) {
      instrumentError(`matrix left reachable value uncovered (${value})`);
    }
  }
  return { coverage, uncovered };
}

export function planVariantMatrix(spec: VariantMatrixSpec): VariantMatrixPlan {
  const axesById = validateSpec(spec);
  const requirements = validateRequirements(spec, axesById);
  const reachablePairs = reachablePairKeys(spec);
  const reachableValues = reachableValueKeys(spec);
  if (reachableValues.size === 0) {
    instrumentError("variant matrix has no legal cells");
  }
  const state: MatrixState = {
    spec,
    uncoveredPairs: new Set(reachablePairs),
    cells: new Map(),
    protectedCellIds: new Set(),
    rowReceipt: [],
    twinReceipt: [],
  };
  seedRequiredRows(state, requirements.rows);
  seedRequiredTwins(state, requirements.twins);
  coverReachablePairs(state);
  coverReachableValues(state, reachableValues);
  const minimized = minimizeCells(state, reachablePairs, reachableValues);
  const { coverage, uncovered } = finalCoverage(spec, minimized, reachablePairs, reachableValues);

  return {
    cells: minimized,
    receipt: {
      axes: spec.axes.map((axis) => ({ id: axis.id, values: axis.values.map((value) => value.id) })),
      reachablePairs,
      coveredPairs: reachablePairs.filter((pair) => coverage.pairs.has(pair)),
      uncoveredPairs: uncovered,
      requiredRows: state.rowReceipt,
      requiredTwins: state.twinReceipt,
      cellIds: minimized.map((cell) => cell.id),
    },
  };
}
