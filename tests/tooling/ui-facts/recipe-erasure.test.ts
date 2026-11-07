// No arm of a flat `tv()` recipe erases another axis unless that pair is declared here: `cn` drops the earlier class without a word, and a caller who sets
// both props gets one of them. A new pair fails this test until its axes are reordered, closed by a type, or stated as a refinement.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { survives } from "../../../tooling/src/eslint/ui-classes/class-conflict.ts";
import { loadUiSources } from "../../../tooling/src/eslint/ui-classes/source.ts";
import type { ComponentRecipe } from "../../../tooling/src/eslint/ui-classes/variant-tables.ts";
import { componentTables } from "../../../tooling/src/eslint/ui-classes/variant-tables.ts";
import type { Arm, ArmClasses } from "../../../tooling/src/eslint/ui-classes/variants.ts";

const ROOT = join(import.meta.dirname, "../../..");

/** The prop types refuse both at once: `ButtonBox`, `ButtonStretch`, `ToneInkSelection`, `TextCue`, or the arm is `Omit`ted from the named component. */
const CLOSED_BY_TYPE = [
  "clamp > lines",
  "minHeight > size+stacked",
  "minHeight > size+wrap",
  "square > grow",
  "square > stacked",
  "square > stretch",
  "stacked > glyph",
  "tone > ink",
  "width > glyph",
  "width > hoverCue",
  "width > size+square",
  "wrap > glyph",
  "wrap > stacked",
];

/** `hidden` takes a box out whatever display an earlier axis gave it. */
const HIDDEN_WINS = ["flow > hiddenAt", "inline > hiddenAt", "readingFlow > hiddenAt", "tracks > hiddenAt"];

/** A box has one place: an arm that places it replaces the containing block or the pin an earlier axis wrote. */
const ONE_PLACE = ["artDecoration > placed", "placed > pinned", "push > pinned", "scroll > placed"];

/** An inset an axis spends on purpose: a bleed, an indent or an art reservation is the box's whole statement of that edge. */
const INSET_SPENT = [
  "cap > artDecoration",
  "indent > artDecoration",
  "indent > reach",
  "paddingInline > reach",
  "paddingInlineEnd > artDecoration",
  "paddingInlineEnd > reach",
  "paddingInlineEndNarrow > reach",
  "paddingInlineNarrow > reach",
  "paddingInlineStart > artDecoration",
  "paddingInlineStart > indent",
  "paddingInlineStart > reach",
  "push > reach",
  "reach > centred",
  "shape > artDecoration",
];

/** The later axis is the narrower statement of the same fact: a state over a resting style, a step over a voice, a shape's own default. */
const REFINES = [
  "artDecoration > artPane",
  "artDecoration > cap",
  "artDecoration > padding",
  "artDecoration > share",
  "artDim > arrival",
  "artPane > cap",
  "artPane > maxHeight",
  "artPane > width",
  "artScale > halo",
  "cols > align",
  "divider > dividerTone",
  "divider > tone",
  "dividerTone > tone",
  "elevated > nested",
  "fill > height",
  "ground > ink",
  "height > minHeight",
  "hoverDim > artDim",
  "indeterminate > size",
  "ink > painted",
  "ink > selection",
  "inline > tracks",
  "justify > caption",
  "justify > textAlign",
  "layout > typeStep",
  "layout > width",
  "lines > whitespace",
  "pinned > layer",
  "pinned > paddingBlockShort",
  "prose > artScale",
  "prose > halo",
  "prose > solidLine",
  "rail > nested",
  "receded > arrival",
  "receded > artDim",
  "receded > reveal",
  "reveal > painted",
  "selection > focusRing",
  "selection > painted",
  "selection > reserveEdge",
  "selection > underline",
  "shape > cardCorners",
  "shape > corners",
  "shape > elevated",
  "shape > nested",
  "shape > padding",
  "shape > share",
  "shape > width",
  "size > artScale",
  "size > cap",
  "size > face",
  "size > flush",
  "size > glyph",
  "size > halo",
  "size > inset",
  "size > layout",
  "size > prose",
  "size > solidLine",
  "size > square",
  "size > stacked",
  "size > step",
  "size > stretch",
  "size > voice",
  "size > wrap",
  "solidLine > halo",
  "stackBelow > reverse",
  "stacked > caption",
  "stacked > inset",
  "stretch > grow",
  "stretch > minWidth",
  "textAlign > caption",
  "truncate > grow",
  "variant > ink",
  "variant > painted",
  "variant > reserveEdge",
  "variant > selection",
  "variant > width",
  "voice > artScale",
  "voice > halo",
  "voice > ink",
  "voice > prose",
  "voice > push",
  "voice > solidLine",
  "voice > tone",
  "weight > voice",
  "wrap > cap",
  "wrap > inset",
];

const DECLARED = [...CLOSED_BY_TYPE, ...HIDDEN_WINS, ...ONE_PLACE, ...INSET_SPENT, ...REFINES];

const flat = (arms: ArmClasses): boolean => [...arms.values()].every((arm: Arm) => arm.slots.length === 0);

/** The tokens of `earlier` that a later write evicts, none of which that write repeats. */
const erases = (earlier: readonly string[], later: readonly string[]): boolean =>
  earlier.some((token) => !later.includes(token) && later.some((winner) => !survives(token, winner)));

const armsErase = (earlier: ArmClasses, later: readonly (readonly string[])[]): boolean =>
  [...earlier.values()].some((arm) => later.some((tokens) => erases(arm.tokens, tokens)));

function recipePairs(recipe: ComponentRecipe): readonly string[] {
  const axes = [...recipe.declared].filter(([, arms]) => flat(arms));
  return axes.flatMap(([earlier, arms], index) => [
    ...axes
      .slice(index + 1)
      .filter(([, later]) =>
        armsErase(
          arms,
          [...later.values()].map((arm) => arm.tokens),
        ),
      )
      .map(([later]) => `${earlier} > ${later}`),
    ...recipe.compounds
      .filter((compound) => !compound.conditions.has(earlier) && armsErase(arms, [compound.tokens]))
      .map((compound) => `${earlier} > ${[...compound.conditions.keys()].join("+")}`),
  ]);
}

const erasingPairs = (): readonly string[] => [
  ...new Set([...componentTables(ROOT, loadUiSources(ROOT)).values()].flatMap((door) => [...door.values()].flatMap(recipePairs))),
];

test("every pair of axes where a later arm erases an earlier one is declared, and no declared pair is stale", () => {
  const pairs = erasingPairs().toSorted();
  expect(pairs).toContain("variant > selection");
  expect(pairs).toEqual([...DECLARED].toSorted());
});
