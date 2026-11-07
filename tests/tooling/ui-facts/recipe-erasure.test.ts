// No arm of a flat `tv()` recipe erases another axis unless the pair is declared here: `cn` drops the earlier class silently, and a caller who sets both props gets one.
// An erasure is a fact of the `tv` table, so the table, derived from `applied`, is the key: a new table is undeclared, and a component reusing a declared table adds nothing to judge.
// The key cannot see a slotted axis (no flat arm to compare), a class a door writes beside its table, or a second erasure under a name that table already declares for that arm.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { survives } from "../../../tooling/src/eslint/ui-classes/class-conflict.ts";
import { loadUiSources } from "../../../tooling/src/eslint/ui-classes/source.ts";
import type { ComponentRecipe } from "../../../tooling/src/eslint/ui-classes/variant-tables.ts";
import { componentTables } from "../../../tooling/src/eslint/ui-classes/variant-tables.ts";
import type { Arm, ArmClasses } from "../../../tooling/src/eslint/ui-classes/variants.ts";

const ROOT = join(import.meta.dirname, "../../..");

const BADGE = "primitives/badge/variants#badgeVariants";
const BUTTON = "primitives/button/variants#buttonVariants";
const CARD = "primitives/card/variants#cardVariants";
const CONTAINER = "layout/variants#containerVariants";
const GLYPH_BUTTON = "primitives/button/variants#buttonVariants+primitives/glyph-button/variants#glyphButtonVariants";
const GRID = "layout/variants#gridVariants";
const ICON = "primitives/icons/variants#iconVariants";
const INLINE_ACTION = "primitives/button/variants#buttonVariants+primitives/inline-action/variants#inlineActionVariants";
const INPUT = "primitives/input/variants#inputVariants";
const MESSAGE_BUBBLE = "primitives/message-bubble/variants#messageBubbleVariants";
const PICTURE_BUTTON = "primitives/button/variants#buttonVariants+primitives/picture-button/variants#pictureButtonVariants";
const ROW = "layout/variants#rowVariants";
const SKELETON = "primitives/skeleton/variants#skeletonVariants";
const SPINNER = "primitives/spinner/variants#spinnerVariants";
const STACK = "layout/variants#stackVariants";
const SWATCH = "primitives/swatch/variants#swatchVariants";
const TEXT = "primitives/text/variants#textVariants";
const THEME_PREVIEW = "content/theme-swatch/preview-pane-variants#themePreviewPaneVariants";
const TOGGLE = "primitives/toggle/variants#toggleVariants";
const WEAVE_GLYPH = "art/web-weave/variants#weaveGlyphVariants";

/**
 * The prop types refuse both at once: `ButtonBox`, `ButtonStretch`, `TextCue`, `TextCap`, or the arm is `Omit`ted from the named component.
 * `ToneInkSelection` pairs `tone` with `ink` only as `ink="toneForeground"`, the tone's own ink on the fill it names.
 */
const CLOSED_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  "clamp > lines": [TEXT],
  "minHeight > size+stacked": [BUTTON],
  "minHeight > size+wrap": [BUTTON],
  "square > grow": [BUTTON],
  "square > stacked": [BUTTON],
  "square > stretch": [BUTTON],
  "stacked > glyph": [GLYPH_BUTTON],
  "tone > ink": [ICON, SPINNER, TEXT, WEAVE_GLYPH],
  "width > glyph": [GLYPH_BUTTON],
  "width > hoverCue": [TEXT],
  "width > size+square": [BUTTON],
  "wrap > glyph": [GLYPH_BUTTON],
  "wrap > stacked": [BUTTON],
};

/** `hidden` takes a box out whatever display an earlier axis gave it. */
const HIDDEN_WINS: Readonly<Record<string, readonly string[]>> = {
  "flow > hiddenAt": [TEXT],
  "inline > hiddenAt": [ROW],
  "readingFlow > hiddenAt": [STACK],
  "tracks > hiddenAt": [ROW],
};

/** A box has one place: an arm that places it replaces the containing block or the pin an earlier axis wrote. */
const ONE_PLACE: Readonly<Record<string, readonly string[]>> = {
  "artDecoration > placed": [STACK],
  "placed > pinned": [ROW],
  "push > pinned": [ROW],
  "scroll > placed": [STACK],
};

type ArmsByTable = Readonly<Record<string, readonly string[]>>;

/** An inset an axis spends on purpose: a bleed, an indent or an art reservation is the box's whole statement of that edge. */
const INSET_SPENT: Readonly<Record<string, ArmsByTable>> = {
  "cap > artDecoration": {
    [CARD]: [
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
  },
  "indent > artDecoration": { [STACK]: ["true"] },
  "indent > reach": { [ROW]: ["true"], [STACK]: ["true"] },
  "paddingInline > reach": {
    [GRID]: ["block", "field", "gutter", "row", "section", "tight"],
    [ROW]: ["block", "field", "gutter", "row", "section", "tight"],
    [STACK]: ["block", "field", "gutter", "row", "section", "tight"],
  },
  "paddingInlineEnd > artDecoration": { [STACK]: ["block", "clearance", "field", "gutter", "row", "section", "tight"] },
  "paddingInlineEnd > reach": {
    [ROW]: ["block", "clearance", "field", "gutter", "row", "section", "tight"],
    [STACK]: ["block", "clearance", "field", "gutter", "row", "section", "tight"],
  },
  "paddingInlineEndNarrow > reach": { [ROW]: ["block", "row", "tight"] },
  "paddingInlineNarrow > reach": { [ROW]: ["block", "row"] },
  "paddingInlineStart > artDecoration": { [STACK]: ["block", "field", "gutter", "row", "section", "tight"] },
  "paddingInlineStart > indent": { [ROW]: ["field", "gutter", "row", "section", "tight"], [STACK]: ["field", "gutter", "row", "section", "tight"] },
  "paddingInlineStart > reach": {
    [ROW]: ["block", "field", "gutter", "row", "section", "tight"],
    [STACK]: ["block", "field", "gutter", "row", "section", "tight"],
  },
  "push > reach": { [ROW]: ["inlineEnd", "inlineStart"] },
  "reach > centred": { [STACK]: ["row", "section"] },
  "shape > artDecoration": { [MESSAGE_BUBBLE]: ["bubble"] },
};

/** The later axis is the narrower statement of the same fact: a state over a resting style, a step over a voice, a shape's own default. */
const REFINES: Readonly<Record<string, ArmsByTable>> = {
  "artDecoration > artPane": { [STACK]: ["portraitEnd", "portraitStart"] },
  "artDecoration > cap": { [STACK]: ["portraitEnd", "portraitStart"] },
  "artDecoration > padding": { [CARD]: ["portraitEnd", "portraitStart"] },
  "artDecoration > share": { [MESSAGE_BUBBLE]: ["portraitEnd", "portraitStart"] },
  "artDim > arrival": { [STACK]: ["lift", "rest"] },
  "artPane > cap": { [STACK]: ["banner"] },
  "artPane > maxHeight": { [STACK]: ["portrait"] },
  "artPane > width": { [STACK]: ["banner", "portrait"] },
  "cols > align": { [GRID]: ["actionBar"] },
  "divider > dividerTone": { [ROW]: ["between", "bottom", "end", "start", "top"], [STACK]: ["between", "bottom", "end", "start", "top"] },
  "divider > tone": { [ROW]: ["between", "bottom", "end", "start", "top"], [STACK]: ["between", "bottom", "end", "start", "top"] },
  "dividerTone > tone": { [ROW]: ["sidebar"], [STACK]: ["sidebar"] },
  "elevated > nested": { [CARD]: ["true"] },
  "ground > ink": { [STACK]: ["background", "bubble", "card", "popover", "readingBand", "systemBubble", "userBubble"] },
  "height > minHeight": { [ROW]: ["rail"] },
  "hoverDim > artDim": { [STACK]: ["self"] },
  "indeterminate > size": { [SWATCH]: ["true"] },
  "ink > painted": { [PICTURE_BUTTON]: ["accolade", "dialogue", "foreground", "muted", "narration", "prose", "speaker", "toneForeground"] },
  "ink > selection": { [BUTTON]: ["accolade", "dialogue", "foreground", "inherit", "muted", "narration", "prose", "speaker", "toneForeground"] },
  "inline > tracks": { [ROW]: ["true"] },
  "justify > caption": { [PICTURE_BUTTON]: ["between", "start"] },
  "justify > textAlign": { [BUTTON]: ["start"] },
  "layout > typeStep": { [INPUT]: ["field", "inline"] },
  "layout > width": { [INPUT]: ["field", "inline"] },
  "lines > whitespace": { [TEXT]: ["2"] },
  "pinned > layer": { [ROW]: ["header", "headerOutside"] },
  "pinned > paddingBlockShort": { [ROW]: ["dialogFooter"] },
  "prose > artScale": { [TEXT]: ["true"] },
  "prose > solidLine": { [TEXT]: ["true"] },
  "rail > nested": { [CARD]: ["primary"] },
  "receded > arrival": { [STACK]: ["false", "true"] },
  "receded > artDim": { [STACK]: ["true"] },
  "receded > reveal": { [ROW]: ["true"] },
  "reveal > painted": { [PICTURE_BUTTON]: ["faint"] },
  "selection > focusRing": { [BUTTON]: ["negated"] },
  "selection > painted": { [PICTURE_BUTTON]: ["negated", "on"] },
  "shape > cardCorners": { [BUTTON]: ["control", "pill"] },
  "shape > corners": { [MESSAGE_BUBBLE]: ["bubble", "island"] },
  "shape > elevated": { [CARD]: ["row"] },
  "shape > nested": { [CARD]: ["row"] },
  "shape > padding": { [MESSAGE_BUBBLE]: ["bubble", "island"], [THEME_PREVIEW]: ["inset", "island", "row"] },
  "shape > share": { [MESSAGE_BUBBLE]: ["bubble"] },
  "shape > width": { [MESSAGE_BUBBLE]: ["bubble"] },
  "size > artScale": { [TEXT]: ["body", "headline", "label", "title"] },
  "size > cap": { [CONTAINER]: ["lg", "md", "sm"] },
  "size > face": { [BADGE]: ["compact"] },
  "size > flush": { [BADGE]: ["compact", "sm"] },
  "size > glyph": { [GLYPH_BUTTON]: ["chip", "lg", "md", "sm"] },
  "size > inset": { [BUTTON]: ["chip", "lg", "md", "sm"] },
  "size > layout": { [INPUT]: ["chip", "lg", "md", "sm"] },
  "size > prose": { [TEXT]: ["body", "headline", "label", "title"] },
  "size > solidLine": { [TEXT]: ["body", "headline", "label", "title"] },
  "size > square": { [BUTTON]: ["chip", "lg", "md", "sm"] },
  "size > stacked": { [BUTTON]: ["chip", "lg", "md", "sm"] },
  "size > step": { [INLINE_ACTION]: ["chip", "lg", "md", "sm"] },
  "size > stretch": { [BUTTON]: ["chip", "lg", "md", "sm"] },
  "size > voice": { [TEXT]: ["body", "headline", "label", "title"] },
  "size > wrap": { [BUTTON]: ["chip", "lg", "md", "sm"] },
  "stackBelow > reverse": { [ROW]: ["cq-28", "cq-32", "cq-40", "cq-64"] },
  "stacked > caption": { [PICTURE_BUTTON]: ["true"] },
  "stacked > inset": { [BUTTON]: ["true"] },
  "stretch > grow": { [BUTTON]: ["row"] },
  "stretch > minWidth": { [BUTTON]: ["row"] },
  "textAlign > caption": { [PICTURE_BUTTON]: ["center", "end"] },
  "truncate > grow": { [TEXT]: ["fill"] },
  "underline > selection": { [BUTTON]: ["dotted"] },
  "variant > ink": { [BUTTON]: ["ghost", "link", "outline", "solid"], [TOGGLE]: ["ghost", "outline"] },
  "variant > painted": { [PICTURE_BUTTON]: ["ghost", "link", "outline", "solid"] },
  "variant > reserveEdge": { [BUTTON]: ["outline"] },
  "variant > selection": { [BUTTON]: ["ghost", "link", "outline", "solid"] },
  "variant > width": { [SKELETON]: ["text"] },
  "voice > artScale": {
    [TEXT]: [
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
  },
  "voice > ink": {
    [TEXT]: [
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
  },
  "voice > prose": {
    [TEXT]: [
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
  },
  "voice > push": { [TEXT]: ["interactiveKicker"] },
  "voice > solidLine": {
    [TEXT]: [
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
  },
  "voice > tone": {
    [TEXT]: [
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
  },
  "weight > voice": { [TEXT]: ["regular", "semibold"] },
  "wrap > cap": { [BUTTON]: ["true"] },
  "wrap > inset": { [BUTTON]: ["true"] },
};

const TABLES_BY_RULE = { ...CLOSED_BY_TYPE, ...HIDDEN_WINS, ...ONE_PLACE };
const ARMS_BY_TABLE = { ...INSET_SPENT, ...REFINES };

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

const tableKey = ({ file, name }: ComponentRecipe["applied"][number]): string =>
  `${file.replace(/^.*packages\/ui\/src\//u, "").replace(/\.tsx?$/u, "")}#${name}`;

const armKey = (pair: string, arm: string): string => `${pair} / ${arm}`;

/** Every table applied alone, with what it erases: a composed door's erasure is its core table's when that table erases the same arm by itself. */
function soloErasures(recipes: readonly ComponentRecipe[]): ReadonlyMap<string, ReadonlySet<string>> {
  const solo = new Map<string, Set<string>>();
  for (const recipe of recipes.filter(({ applied }) => applied.length === 1)) {
    const key = recipe.applied.map(tableKey).join("+");
    const held = solo.get(key) ?? new Set<string>();
    solo.set(key, held);
    for (const [pair, arm] of recipeErasures(recipe)) {
      held.add(armKey(pair, arm));
    }
  }
  return solo;
}

/** Pair to table to the sorted names of the arms that erase under it. */
function erasures(recipes: readonly ComponentRecipe[]): ReadonlyMap<string, ReadonlyMap<string, readonly string[]>> {
  const solo = soloErasures(recipes);
  const found = new Map<string, Map<string, Set<string>>>();
  for (const recipe of recipes) {
    const tables = recipe.applied.map(tableKey);
    for (const [pair, arm] of recipeErasures(recipe)) {
      const table = tables.find((name) => solo.get(name)?.has(armKey(pair, arm))) ?? tables.join("+");
      const byTable = found.get(pair) ?? new Map<string, Set<string>>();
      found.set(pair, byTable.set(table, (byTable.get(table) ?? new Set<string>()).add(arm)));
    }
  }
  return new Map([...found].map(([pair, byTable]) => [pair, new Map([...byTable].map(([table, arms]) => [table, [...arms].toSorted()]))]));
}

// Every arm of every table runs the real merger against every later arm.
const WHOLE_RECIPE_WALK_MS = 60_000;
const TV_CALL = /\btv\(/u;
const RECIPES: readonly ComponentRecipe[] = [...componentTables(ROOT, loadUiSources(ROOT)).values()].flatMap((door) => [...door.values()]);

/** One line per declaration that differs from the recipes, in either direction: an undeclared erasure or a stale row. */
function undeclared(recipes: readonly ComponentRecipe[]): readonly string[] {
  const found = erasures(recipes);
  const foundRows = [...found].flatMap(([pair, byTable]) =>
    [...byTable].map(([table, arms]) => (pair in TABLES_BY_RULE ? `${pair} @ ${table}` : `${pair} @ ${table}: ${arms.join(" ")}`)),
  );
  const declaredRows = [
    ...Object.entries(TABLES_BY_RULE).flatMap(([pair, tables]) => tables.map((table) => `${pair} @ ${table}`)),
    ...Object.entries(ARMS_BY_TABLE).flatMap(([pair, byTable]) =>
      Object.entries(byTable).map(([table, arms]) => `${pair} @ ${table}: ${arms.toSorted().join(" ")}`),
    ),
  ];
  return [...foundRows.filter((row) => !declaredRows.includes(row)), ...declaredRows.filter((row) => !foundRows.includes(row))].toSorted();
}

test("every erasure of a later arm is declared for its table, and no declared row is stale", { timeout: WHOLE_RECIPE_WALK_MS }, () => {
  expect(erasures(RECIPES).get("variant > selection")?.get(BUTTON)).toContain("ghost");
  expect(undeclared(RECIPES)).toEqual([]);
});

// The recipe reader opens a table through its import, so a table a component file keeps to itself is never compared.
test("every table sits in a module of its own", () => {
  const sources = loadUiSources(ROOT);
  expect(sources.filter(({ kind, text }) => kind === "ts" && TV_CALL.test(text)).length).toBeGreaterThan(0);
  expect(sources.filter(({ kind, text }) => kind === "tsx" && TV_CALL.test(text)).map(({ path }) => path)).toEqual([]);
});

// The control for the key: the same recipe under a table no row names is undeclared under every pair it erases, declared axis names included.
test("a new component's own table joins no declared pair unseen", { timeout: WHOLE_RECIPE_WALK_MS }, () => {
  const copies = RECIPES.filter(({ applied }) => applied.map(tableKey).join("+") === ROW).map((row) => ({
    ...row,
    applied: [{ file: "packages/ui/src/primitives/zz/variants.ts", name: "zzVariants" }],
  }));
  expect(undeclared([...RECIPES, ...copies])).toContain("height > minHeight @ primitives/zz/variants#zzVariants: rail");
});
