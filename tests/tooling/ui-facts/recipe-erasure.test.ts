// No arm of a flat `tv()` recipe erases another axis unless that pair is declared here: `cn` drops the earlier class without a word, and a caller who sets
// both props gets one of them. A new pair fails this test until its axes are reordered, closed by a type, or stated as a refinement.
// A refinement or a spent inset also names the earlier arms that erase, so a new erasing arm under a declared pair fails it too.
// A pair is keyed by axis name across components: a component that adds an axis of a declared name joins that pair unseen.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { survives } from "../../../tooling/src/eslint/ui-classes/class-conflict.ts";
import { loadUiSources } from "../../../tooling/src/eslint/ui-classes/source.ts";
import type { ComponentRecipe } from "../../../tooling/src/eslint/ui-classes/variant-tables.ts";
import { componentTables } from "../../../tooling/src/eslint/ui-classes/variant-tables.ts";
import type { Arm, ArmClasses } from "../../../tooling/src/eslint/ui-classes/variants.ts";

const ROOT = join(import.meta.dirname, "../../..");

/**
 * The prop types refuse both at once: `ButtonBox`, `ButtonStretch`, `TextCue`, `TextCap`, or the arm is `Omit`ted from the named component.
 * `ToneInkSelection` pairs `tone` with `ink` only as `ink="toneForeground"`, the tone's own ink on the fill it names.
 */
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
const INSET_SPENT: Readonly<Record<string, readonly string[]>> = {
  "cap > artDecoration": [
    "available",
    "avatarHero",
    "column",
    "columnWide",
    "control",
    "controlMd",
    "fit",
    "pane",
    "paneSm",
    "paneXs",
    "prose",
    "reading",
    "readingMin",
    "shell",
    "sidebar",
    "surface",
  ],
  "indent > artDecoration": ["true"],
  "indent > reach": ["true"],
  "paddingInline > reach": ["block", "field", "gutter", "row", "section", "tight"],
  "paddingInlineEnd > artDecoration": ["block", "clearance", "field", "gutter", "row", "section", "tight"],
  "paddingInlineEnd > reach": ["block", "clearance", "field", "gutter", "row", "section", "tight"],
  "paddingInlineEndNarrow > reach": ["block", "row", "tight"],
  "paddingInlineNarrow > reach": ["block", "row"],
  "paddingInlineStart > artDecoration": ["block", "field", "gutter", "row", "section", "tight"],
  "paddingInlineStart > indent": ["field", "gutter", "row", "section", "tight"],
  "paddingInlineStart > reach": ["block", "field", "gutter", "row", "section", "tight"],
  "push > reach": ["inlineEnd", "inlineStart"],
  "reach > centred": ["row", "section"],
  "shape > artDecoration": ["bubble"],
};

/** The later axis is the narrower statement of the same fact: a state over a resting style, a step over a voice, a shape's own default. */
const REFINES: Readonly<Record<string, readonly string[]>> = {
  "artDecoration > artPane": ["portraitEnd", "portraitStart"],
  "artDecoration > cap": ["portraitEnd", "portraitStart"],
  "artDecoration > padding": ["portraitEnd", "portraitStart"],
  "artDecoration > share": ["portraitEnd", "portraitStart"],
  "artDim > arrival": ["lift", "rest"],
  "artPane > cap": ["banner"],
  "artPane > maxHeight": ["portrait"],
  "artPane > width": ["banner", "portrait"],
  "cols > align": ["actionBar"],
  "divider > dividerTone": ["between", "bottom", "end", "start", "top"],
  "divider > tone": ["between", "bottom", "end", "start", "top"],
  "dividerTone > tone": ["sidebar"],
  "elevated > nested": ["true"],
  "fill > height": ["true"],
  "ground > ink": ["background", "bubble", "card", "popover", "readingBand", "systemBubble", "userBubble"],
  "height > minHeight": ["rail"],
  "hoverDim > artDim": ["self"],
  "indeterminate > size": ["true"],
  "ink > painted": ["accolade", "dialogue", "foreground", "muted", "narration", "prose", "speaker", "toneForeground"],
  "ink > selection": ["accolade", "dialogue", "foreground", "inherit", "muted", "narration", "prose", "speaker", "toneForeground"],
  "inline > tracks": ["true"],
  "justify > caption": ["between", "start"],
  "justify > textAlign": ["start"],
  "layout > typeStep": ["field", "inline"],
  "layout > width": ["field", "inline"],
  "lines > whitespace": ["2"],
  "pinned > layer": ["header", "headerOutside"],
  "pinned > paddingBlockShort": ["dialogFooter"],
  "prose > artScale": ["true"],
  "prose > solidLine": ["true"],
  "rail > nested": ["primary"],
  "receded > arrival": ["false", "true"],
  "receded > artDim": ["true"],
  "receded > reveal": ["true"],
  "reveal > painted": ["faint"],
  "selection > focusRing": ["negated"],
  "selection > painted": ["negated", "on"],
  "shape > cardCorners": ["control", "pill"],
  "shape > corners": ["bubble", "island"],
  "shape > elevated": ["row"],
  "shape > nested": ["row"],
  "shape > padding": ["bubble", "inset", "island", "row"],
  "shape > share": ["bubble"],
  "shape > width": ["bubble"],
  "size > artScale": ["body", "headline", "label", "title"],
  "size > cap": ["lg", "md", "sm"],
  "size > face": ["compact"],
  "size > flush": ["compact", "sm"],
  "size > glyph": ["chip", "lg", "md", "sm"],
  "size > inset": ["chip", "lg", "md", "sm"],
  "size > layout": ["chip", "lg", "md", "sm"],
  "size > prose": ["body", "headline", "label", "title"],
  "size > solidLine": ["body", "headline", "label", "title"],
  "size > square": ["chip", "lg", "md", "sm"],
  "size > stacked": ["chip", "lg", "md", "sm"],
  "size > step": ["chip", "lg", "md", "sm"],
  "size > stretch": ["chip", "lg", "md", "sm"],
  "size > voice": ["body", "headline", "label", "title"],
  "size > wrap": ["chip", "lg", "md", "sm"],
  "stackBelow > reverse": ["cq-28", "cq-32", "cq-40", "cq-64"],
  "stacked > caption": ["true"],
  "stacked > inset": ["true"],
  "stretch > grow": ["row"],
  "stretch > minWidth": ["row"],
  "textAlign > caption": ["center", "end"],
  "truncate > grow": ["fill"],
  "underline > selection": ["dotted"],
  "variant > ink": ["ghost", "link", "outline", "solid"],
  "variant > painted": ["ghost", "link", "outline", "solid"],
  "variant > reserveEdge": ["outline"],
  "variant > selection": ["ghost", "link", "outline", "solid"],
  "variant > width": ["text"],
  "voice > artScale": [
    "code",
    "credit",
    "datum",
    "datumMono",
    "focal",
    "gloss",
    "hero",
    "interactiveKicker",
    "kicker",
    "label",
    "lead",
    "masthead",
    "monogram",
    "promoted",
    "quiet",
    "reading",
  ],
  "voice > ink": [
    "code",
    "credit",
    "datum",
    "datumMono",
    "focal",
    "gloss",
    "hero",
    "interactiveKicker",
    "kicker",
    "label",
    "lead",
    "masthead",
    "promoted",
    "quiet",
    "reading",
  ],
  "voice > prose": [
    "code",
    "credit",
    "datum",
    "datumMono",
    "focal",
    "gloss",
    "hero",
    "interactiveKicker",
    "kicker",
    "label",
    "lead",
    "masthead",
    "monogram",
    "promoted",
    "quiet",
    "reading",
  ],
  "voice > push": ["interactiveKicker"],
  "voice > solidLine": [
    "code",
    "credit",
    "datum",
    "datumMono",
    "focal",
    "gloss",
    "hero",
    "interactiveKicker",
    "kicker",
    "label",
    "lead",
    "masthead",
    "monogram",
    "promoted",
    "quiet",
    "reading",
  ],
  "voice > tone": [
    "code",
    "credit",
    "datum",
    "datumMono",
    "focal",
    "gloss",
    "hero",
    "interactiveKicker",
    "kicker",
    "label",
    "lead",
    "masthead",
    "promoted",
    "quiet",
    "reading",
  ],
  "weight > voice": ["regular", "semibold"],
  "wrap > cap": ["true"],
  "wrap > inset": ["true"],
};

const PAIRS_BY_RULE = [...CLOSED_BY_TYPE, ...HIDDEN_WINS, ...ONE_PLACE];
const PAIRS_BY_ARM = { ...INSET_SPENT, ...REFINES };

const flat = (arms: ArmClasses): boolean => [...arms.values()].every((arm: Arm) => arm.slots.length === 0);

/** The tokens of `earlier` that a later write evicts, none of which that write repeats. */
const erases = (earlier: readonly string[], later: readonly string[]): boolean =>
  earlier.some((token) => !later.includes(token) && later.some((winner) => !survives(token, winner)));

/** Each earlier arm that a later axis or compound replaces, as the pair it falls under and the arm's name. */
function recipeErasures(recipe: ComponentRecipe): readonly (readonly [pair: string, arm: string])[] {
  const axes = [...recipe.declared].filter(([, arms]) => flat(arms));
  return axes.flatMap(([earlier, arms], index) =>
    [...arms].flatMap(([name, arm]) => [
      ...axes
        .slice(index + 1)
        .filter(([, later]) => [...later.values()].some((winner) => erases(arm.tokens, winner.tokens)))
        .map(([later]): [string, string] => [`${earlier} > ${later}`, name]),
      ...recipe.compounds
        .filter((compound) => !compound.conditions.has(earlier) && erases(arm.tokens, compound.tokens))
        .map((compound): [string, string] => [`${earlier} > ${[...compound.conditions.keys()].join("+")}`, name]),
    ]),
  );
}

/** Pair to the sorted names of the earlier arms that erase under it, across every component. */
function erasures(): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, Set<string>>();
  for (const door of componentTables(ROOT, loadUiSources(ROOT)).values()) {
    for (const [pair, arm] of [...door.values()].flatMap(recipeErasures)) {
      found.set(pair, (found.get(pair) ?? new Set<string>()).add(arm));
    }
  }
  return new Map([...found].map(([pair, arms]) => [pair, [...arms].toSorted()]));
}

test("every pair of axes where a later arm erases an earlier one is declared, and no declared pair is stale", () => {
  const pairs = [...erasures().keys()].toSorted();
  expect(pairs).toContain("variant > selection");
  expect(pairs).toEqual([...PAIRS_BY_RULE, ...Object.keys(PAIRS_BY_ARM)].toSorted());
});

test("a refinement or a spent inset names every earlier arm that erases under it, so a new erasing arm is a new declaration", () => {
  const found = erasures();
  const declared = Object.fromEntries(Object.entries(PAIRS_BY_ARM).map(([pair, arms]) => [pair, arms.toSorted()]));
  expect(Object.fromEntries(Object.keys(declared).map((pair) => [pair, found.get(pair)]))).toEqual(declared);
});
