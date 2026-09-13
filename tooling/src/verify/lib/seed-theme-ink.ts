// The seed-palette INK-DUTY derivation behind `gates/seed-theme-ink-contrast.ts`. PURE, and it reads
// NOTHING: every input arrives as a fact — the `product-css` declaration facts its one consumer already
// declares, and the `text-<token>` / `bg-<token>/<alpha>` candidates the shared static-class walk
// produces. What is left here is the policy's own ALGORITHM (which grounds an ink rests on, how a
// self-tint composites, which utility spellings are inks), which §12.3 explicitly permits in `verify/lib`.
//
// THE PRIVATE CSS PARSER IS GONE (#2293, §5b.7 / §12.3). This module used to carry `DECLARATION` /
// `THEME_BLOCK` / `SEED_BLOCK` regexes plus a hand-rolled balanced-brace `blockBody` scan over `theme.css`
// TEXT — repository CSS reading behind `defineGate`, in a one-importer `lib/` file, answering a question
// the consumer's own declared `product-css` resource already answers. `CssDeclarationFact` carries the
// property, the collapsed value and the OWNER (`@theme` as an at-rule prelude, `[data-theme="x"]` as a
// style-rule selector list); the ENCLOSING blocks come from the two shared ancestry readers
// (`css-rules.ts#rulesContaining` / `#atRulesContaining`), because an owner names only the INNERMOST
// block.
//
// THE FIRST FOLD CLAIMED "three deltas, all widening" AND THAT WAS FALSE (#2293 leg 2, caught in source
// review). Reading only the owner NARROWED the reader: a `--color-*` nested one level inside `@theme` or
// inside a seed belongs to the inner block, so it silently left the palette. The live `theme.css` has no
// such nesting, which is exactly why a real-sheet parity twin could not see it — a parity receipt over a
// subject that never exercises the changed code path is not a measurement of the change.
//
// THE REPLACEMENT SENTENCE CLAIMED FOUR DELTAS, "each pinned", AND THAT WAS FALSE IN BOTH HALVES (#2315,
// caught by the next verifier: there are more classes than four, and two of the four it listed had no
// test). So the set is ENUMERATED FROM A DRIVEN DIFFERENTIAL rather than from memory — the frozen
// pre-fold TEXT reader (`680d66e7c^`) against the tip reader over identical bytes. The differences below
// each carry a pin in tests/tooling/verify/gates/seed-theme-ink-family.test.ts.
// Frozen → tip:
//   WIDER    a final declaration with no `;` before its `}` is READ (`hearth{x}` → `hearth{x,last}`) — the
//            old `DECLARATION` regex required the semicolon.
//   WIDER    every `@theme` block merges, not only the first (`hearth{x}` → `hearth{x,second}`) — the old
//            `THEME_BLOCK.exec` took one match.
//   WIDER    a COMPOUND-ROOT subject is a ROOT (`dusk{x}` → `dusk{x,f}` for `[data-theme="x"].foo`) — the
//            old `SEED_BLOCK` regex demanded the attribute immediately before the `{`.
//   FIXED    `html[data-theme="x"]` minted a SECOND `dusk` palette at the BASE polarity
//            (`dusk/light{x}` + `dusk/dark{x,h}`); tip merges it into one `dusk/light{x,h}`.
//   FIXED    a multi-root list minted a DUPLICATE palette and skipped a seed (`dusk{x}` + `ember{x}` +
//            `ember{x,m}`); tip files each seed once.
//   CHANGED  a `--color-*` under a nested CONDITIONAL at-rule becomes its own ARM (`<palette> @ <prelude>`)
//            instead of being merged last-wins — both arms are judged, where the old scan REPLACED the
//            unconditional value and hid the base arm. TWO classes: under `@theme`, and under a seed.
//   CHANGED  `.card &` becomes an ARM for the same reason — the subject is still the seed, under an
//            ancestor condition (old: merged into the palette).
//   NARROWER a `--color-*` whose SUBJECT is a descendant or sibling is EXCLUDED — the seed's own text
//            never resolves against it, and the old scan counting it was a defect of the balanced-body
//            read rather than a capability.
//   NARROWER a seed nested INSIDE a seed is dropped; the balanced-body scan filed one declaration into
//            BOTH palettes.
// And ONE shape is deliberately NOT a delta, listed so the set is closed: the FLATTENED descendant
// (`[data-theme="x"] .a`) reads the same on both sides — the frozen regex never matched it either, so the
// fold's brief regression there (#2293 leg 3) was a defect against the frozen reader, not a delta of it.
//
// AND THE SUBJECT RULE IS DECIDED PER COMPLEX SELECTOR, OFF THE SUBJECT COMPOUND (#2293 leg 3). Leg 2
// built the descendant exclusion only for the NESTED spelling: the flattened `[data-theme="x"] .a` (and
// `[data-theme="x"] + .b`) still matched the unanchored `SEED_SELECTOR` against the whole selector LIST
// and was absorbed as the seed, so the same CSS got two answers depending on authoring style. Membership
// now runs `splitSelectorList` → `selectorSubject` — the SHARED reader (`lib/css-rules.ts`,
// `over-art-plate.ts` is the other consumer), not a new one, and not `^…$` anchoring, which would have
// thrown away every legitimate compound root. Four shapes, each pinned:
//   ROOT  `[data-theme="x"].foo` · `html[data-theme="x"]` · `[data-theme="x"]:where(.a, .b)` — the subject
//         IS the seed element; a qualifier narrows WHICH elements carry the seed, not what the palette is,
//         so it MERGES into that seed rather than forking an arm (declared limit, pinned).
//   ARM   `.card &` — the subject is still the seed, under an ANCESTOR condition, so it is an arm exactly
//         like a conditional at-rule. Leg 2's prose called this a descendant subject and DROPPED it; a
//         dropped reachable arm is the blindness this gate exists to refuse, and that sentence is retired.
//   NONE  `& .x` · `& > .y` · `[data-theme="x"] .a` · `[data-theme="x"] + .b` — the subject is another
//         element.
//   LIST  a selector list is decided arm by arm, never by matching the list text — and it resolves to a
//         SET of roots, so `[data-theme="light"], [data-theme="mocha"] { … }` files into BOTH palettes and
//         a nested `@media` under it forks an ARM PER ROOT, each inheriting its own seed's polarity.
//         Duplicate roots in one list collapse and file once. Leg 3 wrote this sentence while the code
//         `break`ed on the first match and dropped `mocha` outright (#2293 leg 4) — the pins now cover two
//         distinct roots, the two-root arm, root-beside-descendant, and the duplicate, because the shape
//         nobody fixtures is the shape the prose is free to lie about.
// Parity receipt on the real `packages/ui/src/styles/theme.css` (which exercises none of the four): three
// palettes (hearth/dark, light/light, mocha/dark), 81 `--color-*` each, byte-identical values.
//
// WHY theme.css AND NOT the DTCG sources: the light-dark() composition (base $value = the dark arm,
// themes/light.json = the light arm, everything else a [data-theme] override) is tokens.build.ts's
// decision, and re-deriving it here would be a second home for it that drifts the first time the
// build changes. The emitted stylesheet is what the BROWSER resolves, so judging it is judging the
// shipped pixel; freshness against tokens.json is separately machine-enforced (tests/ui/tokens).
//
// COLOUR MATH: `@orb/kit/safe-color` (ColorJS-backed, standards CSS parsing) for oklch -> sRGB, and
// `@orb/tooling/_shared/wcag` for the ratio. NO third converter is minted here — the house already
// paid for that lesson twice (ui-audit/lib/css-color.ts's header).
import { parseCssColorToSrgb } from "@orb/kit/safe-color";
import type { Rgb } from "../../_shared/wcag.ts";
import { contrastRatio } from "../../_shared/wcag.ts";
import type { CssDeclarationFact } from "../contract/resource-css.ts";
import type { AuthoredCssFile } from "../contract/resource-tree.ts";
import { atRulesContaining, rulesContaining, selectorSubject, splitSelectorList } from "./css-rules.ts";
import type { StaticClassCandidate } from "./static-class-expression.ts";

/** One shipped seed palette: a name, its inherited color-scheme, and its resolved `--color-*` values. */
export interface SeedPalette {
  readonly name: string;
  readonly scheme: "light" | "dark";
  /** `--color-x` to the oklch literal this palette resolves it to (light-dark() already collapsed). */
  readonly vars: ReadonlyMap<string, string>;
}

/** A token painted as TEXT somewhere in the product, with the carrier that paints it. */
export interface InkUse {
  readonly token: string; // "primary" (the `--color-` suffix)
  readonly file: string; // repo-relative carrier
  readonly line: number;
  readonly column: number;
  readonly className: string; // the `text-<token>` lexeme, for the finding's token field
  /** Percent of its OWN hue this carrier paints BEHIND the ink (`bg-<token>/8`), or null. */
  readonly selfTintPercent: number | null;
}

const LIGHT_DARK = /^light-dark\(\s*(.+?)\s*,\s*(.+?)\s*\)$/u;
/** The BASE palette's home: Tailwind's `@theme` block, read off the declaration fact's at-rule owner. */
const THEME_AT_RULE = /^@theme\b/u;
/** A shipped seed's home: `[data-theme="x"]`. Deliberately UNANCHORED, and it is only ever run against a
 *  SUBJECT COMPOUND (`seedRootOf`), never against a selector list — that pairing is the whole rule. Left
 *  unanchored so a compound root (`html[data-theme="x"]`, `[data-theme="x"].foo`) still resolves; the
 *  descendant/sibling exclusion comes from the SUBJECT, not from anchoring the pattern (#2293 leg 3). */
const SEED_SELECTOR = /\[data-theme="([a-z0-9-]+)"\]/u;
const COLOR_PREFIX = "--color-";
const COLOR_SCHEME = "color-scheme";
/** CSS nesting's parent reference. In a SUBJECT compound it means "this rule still styles the parent". */
const NESTING_SELECTOR = "&";
/** `text-primary`, but never `text-primary-foreground` — a pair ink is judged on its own fill, not here. */
const TEXT_UTILITY = /^text-([a-z][a-z0-9-]*)$/u;
const SELF_TINT_UTILITY = /^bg-([a-z][a-z0-9-]*)\/(\d{1,3})$/u;
/** Tailwind v4's importance marker rides the END of a utility (`text-x!`). */
const TRAILING_IMPORTANT = /!$/u;
const WHITESPACE = /\s+/u;

/** The arm a palette's own color-scheme selects out of a `light-dark(<light>, <dark>)` value. */
function polarityArm(value: string, scheme: "light" | "dark"): string {
  const m = LIGHT_DARK.exec(value.trim());
  if (m === null) {
    return value.trim();
  }
  return (scheme === "light" ? m[1] : m[2]) ?? value.trim();
}

/** One seed under construction: its scheme is a declaration inside the same block and may be authored
 *  before or after the colours, so both are accumulated and the palette is built at the end. */
interface SeedDraft {
  /** `undefined` until the block DECLARES its own `color-scheme`, which is what lets a conditional arm
   *  INHERIT its palette's polarity instead of silently reverting to the base's. */
  scheme: "light" | "dark" | undefined;
  readonly vars: Map<string, string>;
}

/** ONE enclosing block of a declaration, as the shared ancestry readers hand it back. `start` is what
 *  orders the chain: proper nesting means ascending start is outermost-first. */
type Block =
  | { readonly start: number; readonly kind: "style-rule"; readonly selectorList: string }
  | { readonly start: number; readonly kind: "at-rule"; readonly prelude: string };

/** WHERE a declaration sits, in palette terms. `root` is the palette it belongs to (`hearth` for the
 *  `@theme` base, else the seed name); `condition` is the joined preludes of the at-rules between the root
 *  and the declaration — empty for an unconditional declaration. `undefined` means "no palette owns it". */
interface Placement {
  readonly root: string;
  readonly condition: string;
}

/** One CONDITIONAL ARM under construction: the palette it modifies, the joined at-rule preludes that gate
 *  it, and the declarations authored inside. */
interface Arm {
  readonly root: string;
  readonly condition: string;
  readonly draft: SeedDraft;
}

const HEARTH = "hearth";
const CONDITION_JOIN = " · ";

/** Every block containing `offset`, outermost first — BOTH halves of the ancestry, through the two shared
 *  readers. The innermost entry is the declaration's own `owner`; everything before it is a true ancestor,
 *  which is the half `CssDeclarationFact.owner` structurally cannot express. */
function blockChain(file: AuthoredCssFile, offset: number): readonly Block[] {
  const rules: Block[] = rulesContaining(file.rules, offset).map((rule) => ({ start: rule.braceStart, kind: "style-rule", selectorList: rule.selectorList }));
  const atRules: Block[] = atRulesContaining(file.atRules, offset).map((atRule) => ({ start: atRule.offset, kind: "at-rule", prelude: atRule.prelude }));
  return [...rules, ...atRules].toSorted((left, right) => left.start - right.start);
}

/**
 * THE SEED A SELECTOR LIST IS A ROOT FOR — decided per COMPLEX SELECTOR, off its SUBJECT compound, never
 * off the list text (#2293 leg 3).
 *
 * Testing the whole `selectorList` made a FLATTENED descendant a root: `[data-theme="dusk"] .x` matched
 * and its `--color-*` was absorbed into the dusk palette, while the byte-equivalent NESTED spelling
 * (`[data-theme="dusk"] { & .x { … } }`) was excluded by the ancestry read — the same CSS, two answers,
 * decided by authoring style. `[data-theme="dusk"] + .y` was absorbed the same way one combinator over.
 *
 * The rule is CSS's own: a declaration belongs to a palette when the SUBJECT of the complex selector —
 * its last compound, what the rule actually styles — is the seed element. `selectorSubject` is the shared
 * reader that answers it and it is REUSED, not re-minted: anchoring `SEED_SELECTOR` to `^…$` instead
 * would have thrown away every legitimate compound root (`html[data-theme="x"]`, `[data-theme="x"].foo`,
 * `[data-theme="x"]:where(.a, .b)`), each of which still styles the seed element itself.
 *
 * A COMPOUND QUALIFIER ON THE SUBJECT KEEPS IT A ROOT and does not become an arm: it narrows WHICH
 * elements carry the seed, not what the palette is, so two blocks resolving to one seed merge last-wins
 * exactly as two bare `[data-theme="x"]` blocks do. An ANCESTOR relation is the other thing entirely and
 * is an ARM — see `placementOf`.
 *
 * IT RETURNS EVERY DISTINCT ROOT, NOT THE FIRST (#2293 leg 4). Leg 3 said "decided per complex selector"
 * and then `break`ed on the first match, so `[data-theme="light"], [data-theme="mocha"] { … }` updated
 * `light` and SILENTLY DROPPED `mocha` — one shipped seed judged against a value it does not have, and
 * the prose exceeding the code by exactly the arm nobody had written a fixture for. A list is a set of
 * complex selectors and the declaration reaches every subject in it, so the answer is a SET. Duplicates
 * collapse (`[data-theme="x"], [data-theme="x"].y` is one root, filed once), which is what keeps a
 * receipt's census honest.
 */
function seedRootsOf(selectorList: string): readonly string[] {
  const roots = new Set<string>();
  for (const complex of splitSelectorList(selectorList)) {
    const name = SEED_SELECTOR.exec(selectorSubject(complex))?.[1];
    if (name !== undefined) {
      roots.add(name);
    }
  }
  return [...roots];
}

/** Every palette this block OWNS — `hearth` for the `@theme` at-rule, or each distinct seed its selector
 *  list styles. Empty when the block owns none. */
function rootNames(block: Block): readonly string[] {
  if (block.kind === "style-rule") {
    return seedRootsOf(block.selectorList);
  }
  return THEME_AT_RULE.test(block.prelude) ? [HEARTH] : [];
}

/** Does this nested block still style the PARENT element? CSS nesting puts the parent in the subject
 *  compound as `&` — `.card &` and `&.dense` style the parent under a context, `& .x` and `& > .y` style
 *  a DESCENDANT. A nested rule with no `&` at all is relative-descendant by construction (`.x` means
 *  `& .x`), so its subject is not the parent either and the same answer falls out. */
function stylesTheParent(selectorList: string): boolean {
  return splitSelectorList(selectorList).some((complex) => selectorSubject(complex).includes(NESTING_SELECTOR));
}

/** The OUTERMOST block that owns a palette, with EVERY palette it owns. */
function rootOf(chain: readonly Block[]): { readonly index: number; readonly names: readonly string[] } | undefined {
  let found: { readonly index: number; readonly names: readonly string[] } | undefined;
  for (const [index, block] of chain.entries()) {
    const names = rootNames(block);
    if (names.length > 0) {
      found = { index, names };
      break;
    }
  }
  return found;
}

/**
 * WHICH PALETTE, IF ANY, A DECLARATION BELONGS TO — the adjudication this reader exists to make, and the
 * three cases are decided rather than inherited (#2293 leg 2, red-first delta table in the lane report):
 *
 *  - UNCONDITIONAL, directly in `@theme` or in a seed's own block → the palette itself. Unchanged.
 *  - Under a nested at-rule (`@supports`, `@media`, `@container`) inside either → the palette's CONDITIONAL
 *    ARM. It is a value the shipped pixel really takes, so an instrument that drops it goes blind on an arm
 *    the product paints. It is NOT merged into the unconditional palette either: the retired text scan
 *    absorbed it last-wins, which REPLACED the unconditional value and hid the base arm instead. Both arms
 *    are judged, which is the only reading under which neither is invisible.
 *  - Under a nested selector whose SUBJECT IS STILL THE SEED (`.card &`, `&.dense`) → the palette's
 *    CONDITIONAL ARM, exactly like a conditional at-rule (#2293 leg 3, and it CORRECTS this paragraph's
 *    own earlier text, which called `.card &` a descendant subject and silently dropped it). The seed
 *    element really does take that value inside a `.card`, and this gate's job is every ground an ink can
 *    rest on — dropping a reachable arm is the blindness the module exists to refuse.
 *  - Under a nested selector whose SUBJECT IS A DESCENDANT OR SIBLING (`& .x`, `& > .y`, a bare `.x`) →
 *    NOT the palette, deliberately: a `text-<token>` resting on the seed never resolves against it. The
 *    retired scan counted these — a defect of the balanced-body read, not a capability, and not restored.
 *
 * The two nested cases are the SAME QUESTION the root asks, one level down — whose element does this
 * block style — so `stylesTheParent` and `seedRootOf` are the same subject read with different targets. A
 * seed nested inside another seed falls on the descendant side of it; the generator emits flat blocks and
 * no fixture reaches that shape, so it is recorded here rather than special-cased.
 */
function placementsOf(file: AuthoredCssFile, offset: number): readonly Placement[] {
  const chain = blockChain(file, offset);
  const root = rootOf(chain);
  const inner = root === undefined ? [] : chain.slice(root.index + 1);
  if (root === undefined || inner.some((block) => block.kind === "style-rule" && !stylesTheParent(block.selectorList))) {
    return [];
  }
  // An inner block is a CONDITION whichever kind it is: an at-rule contributes its prelude, a
  // still-styling-the-parent selector contributes its own text (`dusk @ .card &`).
  const conditions = [...chain.slice(0, root.index), ...inner].map((block) => (block.kind === "at-rule" ? block.prelude : block.selectorList));
  const condition = conditions.join(CONDITION_JOIN);
  // ONE PLACEMENT PER DISTINCT ROOT. The condition chain is shared — a `@media` inside
  // `[data-theme="light"], [data-theme="mocha"]` is an arm of BOTH seeds, each with its own inherited
  // polarity — so the arms fork here and nowhere else.
  return root.names.map((name) => ({ root: name, condition }));
}

function absorb(draft: SeedDraft, property: string, value: string): void {
  if (property === COLOR_SCHEME) {
    draft.scheme = value.startsWith("light") ? "light" : "dark";
  } else if (property.startsWith(COLOR_PREFIX)) {
    draft.vars.set(property, value);
  }
}

function draftFor(drafts: Map<string, SeedDraft>, key: string): SeedDraft {
  const existing = drafts.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created: SeedDraft = { scheme: undefined, vars: new Map<string, string>() };
  drafts.set(key, created);
  return created;
}

/**
 * Every shipped seed palette, derived from ONE SHEET'S declaration facts and the SHARED ANCESTRY READERS:
 * the `@theme` at-rule carries the base (Hearth — `:root { color-scheme: dark }`), each `[data-theme="…"]`
 * style rule overrides it taking its scheme from its own `color-scheme`, and a conditional at-rule nested
 * inside either contributes an extra ARM named `<palette> @ <prelude>`. A value that is still
 * `light-dark(…)` collapses to the arm that palette's scheme selects.
 *
 * The caller passes the sheet's `AuthoredCssFile` (for ancestry — `rulesContaining` / `atRulesContaining`)
 * and the declaration FACTS for that same file. Nothing here reads a path or parses text.
 *
 * CUSTOM user themes are deliberately OUT OF SCOPE: they are runtime `<ThemeScope>` values clamped by
 * packages/ui/src/content/theme-scope/clamp.ts and swept by its own suite. This reads what WE ship.
 */
interface Sheet {
  readonly base: Map<string, string>;
  readonly seeds: Map<string, SeedDraft>;
  readonly arms: Map<string, Arm>;
}

/** File one declaration into the base map, a seed draft, or a conditional arm — the dispatch `placementOf`
 *  has already decided. A `color-scheme` reaching the base is dropped: Hearth's polarity is the `:root`
 *  declaration outside `@theme`, and the base map holds colours only. */
function fileDeclaration(sheet: Sheet, placement: Placement, property: string, value: string): void {
  if (placement.condition !== "") {
    const key = `${placement.root}${CONDITION_JOIN}${placement.condition}`;
    absorb(sheet.arms.get(key)?.draft ?? registerArm(sheet.arms, key, placement), property, value);
  } else if (placement.root === HEARTH) {
    if (property.startsWith(COLOR_PREFIX)) {
      sheet.base.set(property, value);
    }
  } else {
    absorb(draftFor(sheet.seeds, placement.root), property, value);
  }
}

export function readSeedPalettes(file: AuthoredCssFile, declarations: readonly CssDeclarationFact[]): readonly SeedPalette[] {
  const sheet: Sheet = { base: new Map<string, string>(), seeds: new Map<string, SeedDraft>(), arms: new Map<string, Arm>() };
  const { base, seeds, arms } = sheet;
  for (const declaration of declarations) {
    // ONE DECLARATION, N PLACEMENTS — a selector list styling two seeds files into BOTH (#2293 leg 4).
    // `placementsOf` has already deduplicated identical roots, so a list naming one seed twice files once
    // and no census double-counts it.
    for (const placement of placementsOf(file, declaration.offset)) {
      fileDeclaration(sheet, placement, declaration.property, declaration.value);
    }
  }
  // A sheet with no unconditional `--color-*` in its `@theme` block resolves ZERO palettes, which is the
  // consumer's zero-palette blindness tripwire — the verdict the retired "no `@theme` block at all" arm
  // gave. A conditional-only base is deliberately on this side of the line: there is no arm the product
  // paints unconditionally, so the honest answer is "I could not measure", not a palette built from one
  // `@supports` branch.
  if (base.size === 0) {
    return [];
  }
  const palettes: SeedPalette[] = [{ name: HEARTH, scheme: "dark", vars: collapse(base, "dark") }];
  for (const [name, draft] of seeds) {
    // A seed with no `color-scheme` of its own inherits Hearth's polarity, which is the `:root` default.
    const scheme = draft.scheme ?? "dark";
    palettes.push({ name, scheme, vars: collapse(new Map([...base, ...draft.vars]), scheme) });
  }
  for (const [, arm] of arms) {
    const parent = arm.root === HEARTH ? undefined : seeds.get(arm.root);
    // AN ARM INHERITS ITS PALETTE'S POLARITY unless the conditional block declares its own: a
    // `@media (prefers-contrast: more)` inside a LIGHT seed is still light, and taking the base default
    // there would collapse every `light-dark()` value to the wrong arm — measured, and it is why
    // `SeedDraft.scheme` is optional rather than pre-filled.
    const scheme = arm.draft.scheme ?? parent?.scheme ?? "dark";
    palettes.push({
      name: `${arm.root} @ ${arm.condition}`,
      scheme,
      // The arm is the parent palette OVERRIDDEN, never the conditional block alone: a `@media` declaring
      // one token still paints every other token the palette carries. It composes the RAW maps and
      // collapses ONCE under the arm's own scheme — re-collapsing the parent's already-collapsed values
      // would silently freeze them on the parent's polarity.
      vars: collapse(new Map([...base, ...(parent?.vars ?? []), ...arm.draft.vars]), scheme),
    });
  }
  return palettes;
}

function registerArm(arms: Map<string, Arm>, key: string, placement: Placement): SeedDraft {
  const draft: SeedDraft = { scheme: undefined, vars: new Map<string, string>() };
  arms.set(key, { root: placement.root, condition: placement.condition, draft });
  return draft;
}

function collapse(vars: ReadonlyMap<string, string>, scheme: "light" | "dark"): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of vars) {
    out.set(key, polarityArm(value, scheme));
  }
  return out;
}

/**
 * The UTILITY a class token names, with its variant prefixes and importance markers stripped.
 *
 * A VARIANT-PREFIXED INK IS STILL AN INK (2026-09-01, verifier F2). `hover:text-foreground`,
 * `data-invalid:text-destructive` and `group-hover:text-accolade` paint the same token on the same
 * grounds — the variant decides WHEN, never WHAT. A bare-only reader censused them nowhere, and its
 * coverage of the live tree was ACCIDENTAL: every such token happened to also appear bare, so the day
 * one is authored only behind a variant it would be judged by nothing at all.
 *
 * Prefixes are cut at the LAST bracket-depth-0 colon, so an arbitrary variant carrying its own colon
 * (`[&:hover]:text-x`, `data-[state=open]:text-x`) is not severed in the middle. Importance is stripped
 * at BOTH ends: `!text-x` and `text-x!` are both live spellings, and reading only one of them is how
 * `ui-size-via-variant` shipped a false terminal state.
 */
function utilityOf(classToken: string): string {
  let depth = 0;
  let cut = -1;
  for (let index = 0; index < classToken.length; index += 1) {
    const ch = classToken[index];
    if (ch === "[" || ch === "(") {
      depth += 1;
    } else if (ch === "]" || ch === ")") {
      depth -= 1;
    } else if (ch === ":" && depth === 0) {
      cut = index;
    }
  }
  const bare = classToken.slice(cut + 1);
  return (bare.startsWith("!") ? bare.slice(1) : bare).replace(TRAILING_IMPORTANT, "");
}

/** Self-tint percents by token: `bg-<token>/N` in ANY variant state (`hover:bg-primary/8` counts). */
function selfTintsIn(classTokens: readonly string[]): ReadonlyMap<string, number> {
  const tints = new Map<string, number>();
  for (const raw of classTokens) {
    const match = SELF_TINT_UTILITY.exec(utilityOf(raw));
    const token = match?.[1];
    const percent = Number(match?.[2]);
    if (token !== undefined && Number.isFinite(percent)) {
      tints.set(token, percent);
    }
  }
  return tints;
}

function inkTokensIn(classTokens: readonly string[]): readonly string[] {
  const tokens: string[] = [];
  for (const raw of classTokens) {
    // A `-foreground` token is a PAIR ink: it only ever sits on its own fill, which
    // palette-contrast.suite.test.ts already judges. Measuring it against neutral chrome would
    // manufacture failures (near-white primary-foreground on a light card) for a pair that never occurs.
    const token = TEXT_UTILITY.exec(utilityOf(raw))?.[1];
    if (token !== undefined && !token.endsWith("-foreground")) {
      tokens.push(token);
    }
  }
  return tokens;
}

/** The ink census: which colour tokens the product paints as TEXT, and with what self-tint behind them. */
export function collectInkUses(candidates: readonly StaticClassCandidate[], relativePath: (node: StaticClassCandidate) => string | null): readonly InkUse[] {
  // DEDUPED on (file, line, column, token, tint): one authored site is ONE ink, however many carrier
  // roots the static walk reaches it through. An occurrence-weighted denominator would inflate the
  // gate's own scan count without measuring anything new — a bigger number that says less.
  const seen = new Map<string, InkUse>();
  for (const candidate of candidates) {
    const file = relativePath(candidate);
    const anchor = candidate.segments[0];
    if (file === null || anchor === undefined) {
      continue;
    }
    const classTokens = candidate.value.split(WHITESPACE).filter((token) => token.length > 0);
    const tints = selfTintsIn(classTokens);
    const at = anchor.node.getSourceFile().getLineAndColumnAtPos(anchor.sourceStart);
    for (const token of inkTokensIn(classTokens)) {
      // BOTH ARMS when the carrier paints a self-tint: the ink also has to clear the ground BARE, because
      // the tint may be variant-scoped while the ink is not. A self-tint can only ever LOWER the ratio
      // (same hue, alpha-composited over the ground), so the bare arm never adds a failure the tinted arm
      // did not already have — it only closes the hole where a tint hid the rest state from the census.
      const tint = tints.get(token) ?? null;
      for (const selfTintPercent of tint === null ? [null] : [null, tint]) {
        seen.set(`${file}:${at.line}:${at.column}:${token}:${selfTintPercent ?? "bare"}`, {
          token,
          file,
          line: at.line,
          column: at.column,
          className: `text-${token}`,
          selfTintPercent,
        });
      }
    }
  }
  return [...seen.values()];
}

/** Source-over composite of `fg` at `alpha` over `bg` — the tint a `bg-<token>/N` paints. */
export function compositeOver(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return { r: alpha * fg.r + (1 - alpha) * bg.r, g: alpha * fg.g + (1 - alpha) * bg.g, b: alpha * fg.b + (1 - alpha) * bg.b };
}

const quantize = (c: Rgb): Rgb => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) });
/** The WORSE of the float and 8-bit-quantized ratio — the pixel a reader sees is the rounded one
 *  (the house rule, tests/ui/content/theme-scope/palette-contrast.suite.test.ts). */
export function worstContrast(a: Rgb, b: Rgb): number {
  return Math.min(contrastRatio(a, b), contrastRatio(quantize(a), quantize(b)));
}

/** An oklch/hex/rgb literal as sRGB 0-255, or null. A TRANSLUCENT value also returns null ON PURPOSE:
 *  compositing it needs a backdrop this function is not given, and judging it as if it were opaque is
 *  the naive-contrast lie. Callers treat null as "I could not measure" and say so, never as a pass. */
export function toRgb(value: string): Rgb | null {
  const parsed = parseCssColorToSrgb(value);
  if (parsed === null || parsed.alpha < 1) {
    return null;
  }
  return { r: parsed.r, g: parsed.g, b: parsed.b };
}
