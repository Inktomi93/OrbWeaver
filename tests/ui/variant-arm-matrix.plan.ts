// Cell planning + parity reporting for the variant-arm matrix (design record: variant-arm-matrix.def.ts).
// NODE-SIDE ONLY: planVariantMatrix rides node:crypto — never import this from the browser-bundled
// stories module. The CT suite imports it in its node context (the spec body), which is legal.
//
// CELL LAW: the full arm cross when it is small (the brief's expectation — 2-4 axes × 2-4 values), the
// policy-neutral pairwise engine (@orb/tooling/_shared/variant-matrix) when the cross explodes (button's
// 5×13×2×3 = 390, text's ≈18k). The cap is a cell-budget call, not a coverage claim — the pairwise
// receipt still covers every VALUE (asserted in the parity suite) and every axis PAIR.
//
// UNSET ARMS ARE REAL ARMS: an axis absent from defaultVariants (text's `voice`, `lines`) renders a
// distinct arm when the prop is omitted — so such axes get a synthetic `__unset` value whose payload is
// `undefined` (the renderer drops the prop). Axes WITH a default still enumerate only declared values:
// the default IS one of them.

import { planVariantMatrix } from "@orb/tooling/_shared/variant-matrix";
import type { TvIntrospection, VariantArmStoryDef } from "./variant-arm-matrix.def.ts";

/** Above this many full-cross cells a story switches to the pairwise plan. */
const FULL_CROSS_CELL_CAP = 100;

/** The value id a renderer receives for "prop omitted" on a default-less axis. */
const UNSET_VALUE = "__unset";

/** One renderable arm: a serialisable id + the exact props the renderer spreads. */
interface ArmCell {
  readonly id: string;
  readonly props: Readonly<Record<string, string | number | boolean>>;
}

export interface ArmPlan {
  readonly story: string;
  readonly axes: readonly { readonly id: string; readonly values: readonly string[] }[];
  readonly strategy: "full-cross" | "pairwise";
  readonly cells: readonly ArmCell[];
}

/** "true"/"false"/numeric variant KEYS were authored as booleans/numbers — coerce back for the prop. */
function coerce(valueId: string): string | number | boolean {
  if (valueId === "true") {
    return true;
  }
  if (valueId === "false") {
    return false;
  }
  const numeric = Number(valueId);
  return Number.isNaN(numeric) || valueId.trim() === "" ? valueId : numeric;
}

function axesOf(tv: TvIntrospection): { readonly id: string; readonly values: readonly string[] }[] {
  return Object.entries(tv.variants).map(([axis, values]) => {
    const declared = Object.keys(values);
    const hasDefault = Object.hasOwn(tv.defaultVariants, axis);
    return { id: axis, values: hasDefault ? declared : [...declared, UNSET_VALUE] };
  });
}

function propsFor(assignment: Readonly<Record<string, string>>): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};
  for (const [axis, valueId] of Object.entries(assignment)) {
    if (valueId !== UNSET_VALUE) {
      props[axis] = coerce(valueId);
    }
  }
  return props;
}

function fullCross(axes: readonly { readonly id: string; readonly values: readonly string[] }[]): Readonly<Record<string, string>>[] {
  let assignments: Record<string, string>[] = [{}];
  for (const axis of axes) {
    assignments = assignments.flatMap((partial) => axis.values.map((value) => ({ ...partial, [axis.id]: value })));
  }
  return assignments;
}

const cellIdOf = (assignment: Readonly<Record<string, string>>): string =>
  Object.entries(assignment)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([axis, value]) => `${axis}=${value}`)
    .join("|");

/** The renderable cell plan for one story — full cross under the cap, else the shared pairwise engine
 *  with the ALL-DEFAULTS row pinned as a required row (the arm every surface renders most). */
export function armPlanFor(story: VariantArmStoryDef): ArmPlan {
  const axes = axesOf(story.tv);
  const crossSize = axes.reduce((n, axis) => n * axis.values.length, 1);
  if (crossSize <= FULL_CROSS_CELL_CAP) {
    const cells = fullCross(axes).map((assignment) => ({ id: cellIdOf(assignment), props: propsFor(assignment) }));
    return { story: story.key, axes, strategy: "full-cross", cells };
  }
  const defaultsRow: Record<string, string> = {};
  for (const axis of axes) {
    const preset = story.tv.defaultVariants[axis.id];
    defaultsRow[axis.id] = preset === undefined ? UNSET_VALUE : String(preset);
  }
  const plan = planVariantMatrix({
    axes: axes.map((axis) => ({ id: axis.id, values: axis.values.map((value) => ({ id: value, payload: value })) })),
    isLegal: () => true,
    requiredRows: [{ id: "all-defaults", assignment: defaultsRow }],
  });
  const cells = plan.cells.map((cell) => ({ id: cellIdOf(cell.assignment), props: propsFor(cell.assignment) }));
  return { story: story.key, axes, strategy: "pairwise", cells };
}

// ── Parity report (pure — the parity suite runs it against the disk census AND against planted
//    in-memory mutations to prove it can fail in both directions) ─────────────────────────────────

export interface DiscoveredTv {
  /** "source::export", source relative to packages/ui/src. */
  readonly id: string;
}

export interface ParityReport {
  /** Discovered on disk, neither storied nor withheld — the silent-gap direction; must be empty. */
  readonly unaccounted: readonly string[];
  /** Storied or withheld, but no longer discovered on disk — stale rows; must be empty. */
  readonly stale: readonly string[];
  /** In BOTH sets — contradiction; must be empty. */
  readonly doubled: readonly string[];
}

export function buildParityReport(
  discovered: readonly DiscoveredTv[],
  storied: readonly VariantArmStoryDef[],
  withheld: Readonly<Record<string, string>>,
): ParityReport {
  const discoveredIds = new Set(discovered.map((entry) => entry.id));
  const storiedIds = new Set(storied.map((story) => `${story.source}::${story.exportName}`));
  const withheldIds = new Set(Object.keys(withheld));
  const accountedIds = new Set([...storiedIds, ...withheldIds]);
  const unaccounted = [...discoveredIds].filter((id) => accountedIds.has(id) === false).toSorted();
  const stale = [...storiedIds, ...withheldIds].filter((id) => !discoveredIds.has(id)).toSorted();
  const doubled = [...storiedIds].filter((id) => withheldIds.has(id)).toSorted();
  return { unaccounted, stale, doubled };
}

/** Every declared value of every axis appears in at least one planned cell — the pin that a legality
 *  filter or a planner regression cannot silently drop an arm. Returns the missing "axis=value" ids. */
export function unplannedValues(plan: ArmPlan): readonly string[] {
  const seen = new Set(plan.cells.flatMap((cell) => cell.id.split("|")));
  return plan.axes.flatMap((axis) => axis.values.map((value) => `${axis.id}=${value}`)).filter((id) => !seen.has(id));
}
