// Which findings could become a lint rule, and which need a data or design decision first. Counts come from the run.

import type { Cohort } from "../floor/verdict/cohort-compare.ts";
import type { UiFacts } from "./analysis.ts";
import { KINDS } from "./sites.ts";

export interface RuleCandidate {
  readonly id: string;
  readonly engine: "eslint" | "stylelint";
  readonly polices: string;
  /** The existing rule whose option list or pattern list it extends, when one exists. */
  readonly extends: string | null;
  readonly hits: number;
}

export interface NotLintable {
  readonly finding: string;
  readonly needs: string;
}

const kindCount = (facts: UiFacts, kinds: readonly string[]): number =>
  facts.sites.filter((site) => kinds.includes(site.kind) && site.layer === "client" && !site.ownerLayer).length;

function cohortOutliers(facts: UiFacts, cohort: string, column: string, value?: string): number {
  const comparison = facts.comparisons.find((entry) => entry.cohort === cohort && entry.column === column);
  return comparison === undefined ? 0 : comparison.outliers.filter((outlier) => value === undefined || outlier.value === value).length;
}

function membersWith(cohort: Cohort | undefined, column: string, value: string): number {
  return cohort?.members.filter((member) => member.cells[column]?.value === value).length ?? 0;
}

export function ruleCandidates(facts: UiFacts): readonly RuleCandidate[] {
  const cohort = (name: string): Cohort | undefined => facts.cohorts.find((entry) => entry.name === name);
  const guarded = (kinds: readonly string[]): string => kinds.filter((kind) => KINDS[kind]?.guard === null).join(", ");
  return [
    {
      id: "restricted-classes: raw size and spacing numbers",
      engine: "eslint",
      polices: guarded(["tw-raw-size", "tw-raw-spacing"]),
      extends: "better-tailwindcss/no-restricted-classes",
      hits: kindCount(facts, ["tw-raw-size", "tw-raw-spacing"]),
    },
    {
      id: "restricted-classes: literal radius, shadow, border, opacity, z, gradient, transform, clip",
      engine: "eslint",
      polices: guarded(["tw-radius", "tw-shadow", "tw-border", "tw-opacity", "tw-z", "tw-gradient", "tw-transform", "tw-clip"]),
      extends: "better-tailwindcss/no-restricted-classes",
      hits: kindCount(facts, ["tw-radius", "tw-shadow", "tw-border", "tw-opacity", "tw-z", "tw-gradient", "tw-transform", "tw-clip"]),
    },
    {
      id: "restricted-classes: viewport breakpoint variants",
      engine: "eslint",
      polices: "tw-viewport-variant",
      extends: "better-tailwindcss/no-restricted-classes",
      hits: kindCount(facts, ["tw-viewport-variant"]),
    },
    {
      id: "raw intrinsic set widened: list, label, hr, heading, dialog, table",
      engine: "eslint",
      polices: "raw-list, raw-label, raw-hr, raw-heading, raw-dialog, raw-table",
      extends: "orb/no-raw-interactive-intrinsics",
      hits: kindCount(facts, ["raw-list", "raw-label", "raw-hr", "raw-heading", "raw-dialog", "raw-table"]),
    },
    { id: "no Textarea rows={1}", engine: "eslint", polices: "textarea-single-row", extends: null, hits: kindCount(facts, ["textarea-single-row"]) },
    {
      id: "dialog has a dismiss path",
      engine: "eslint",
      polices: "dialog cohort, dismiss = none",
      extends: "orb/dialog-via-composite",
      hits: membersWith(cohort("dialog"), "dismiss", "none"),
    },
    {
      id: "destructive verb sits beside a ConfirmDialog",
      engine: "eslint",
      polices: "destructive-action cohort, confirm = none",
      extends: null,
      hits: membersWith(cohort("destructive-action"), "confirm", "none"),
    },
    {
      id: "mutation factory lives in a hooks file",
      engine: "eslint",
      polices: "mutation cohort, home = component or surface file",
      extends: "orb/mutation-only-in-factory",
      hits: membersWith(cohort("mutation"), "home", "component or surface file"),
    },
    {
      id: "library surfaces compose LibraryRow, not ListRow",
      engine: "eslint",
      polices: "list-pane cohort, rows = raw ListRow",
      extends: "orb/page-template-shapes",
      hits: membersWith(cohort("list-pane"), "rows", "raw ListRow"),
    },
    {
      id: "copy: one ellipsis character, search placeholders end in it",
      engine: "eslint",
      polices: "copy cohorts, ellipsis outliers",
      extends: null,
      // A placeholder that carries the ellipsis is the convention; only a search placeholder without one is a hit.
      hits: cohortOutliers(facts, "copy:placeholder-search", "ellipsis", "none"),
    },
    {
      id: "raw length in a stylesheet outside the token layer",
      engine: "stylelint",
      polices: "css-raw-length",
      extends: "declaration-property-value-disallowed-list",
      hits: kindCount(facts, ["css-raw-length"]),
    },
    {
      id: "literal radius, opacity, clip-path, gradient in a stylesheet",
      engine: "stylelint",
      polices: "css-radius, css-opacity, css-clip-path, css-gradient",
      extends: "declaration-property-value-disallowed-list",
      hits: kindCount(facts, ["css-radius", "css-opacity", "css-clip-path", "css-gradient"]),
    },
    {
      id: "no feature-owned stylesheet",
      engine: "stylelint",
      polices: "css-file-outside-layers",
      extends: "orb/rule-in-layer",
      hits: kindCount(facts, ["css-file-outside-layers"]),
    },
  ];
}

export const NOT_LINTABLE: readonly NotLintable[] = [
  { finding: "Repeated class strings (missing composite)", needs: "a composite designed and named; lint can only forbid the string once the composite exists" },
  { finding: "System gaps (the same override on one primitive)", needs: "a prop or variant designed in @orb/ui; then the override joins the restricted list" },
  { finding: "Token gaps (a literal repeated with no token)", needs: "a token value decided in tokens.json; then the literal joins the restricted list" },
  { finding: "Duplicate tone, label and size maps", needs: "one shared home chosen per map; jscpd cannot see keyed maps, a key-set census can" },
  { finding: "Case drift in copy", needs: "a case convention ruled per copy kind; the tool reports the majority, not the law" },
  {
    finding: "Raw wire value in a chip",
    needs: "type information; the copy:chip wire column lists the bare reads, and the syntax cannot tell a raw enum from a word the caller mapped",
  },
];

export const HAND_ROLLING_CANNOT_SEE: readonly string[] = [
  "Stylesheets are read with the css-tree AST and code with the TypeScript parser. A value assembled across statements, a template with substitutions and a number passed to a prop other than `style` are not read.",
  'A string is read only when the whole string is one CSS value (`"20rem"`) or one media condition. A value inside a longer string, or a number in a data table, is not a hit.',
  "A constant is found by a unit word at the end of its name (`_MS`, `Px`, `_REM`, `_SEC`) or by a numeric delay to `setTimeout`, `setInterval`, `debounce` or `throttle`. A number named any other way, or a delay given to another hook, is not seen.",
  "A timing constant matches a motion token only when its name carries an animation word; an equal number alone is a coincidence. A px or rem constant stays a keep unless several repeat it.",
  "Repeated constants group by value and by the word before the unit, not by meaning. Two constants with one word can name different concepts.",
  "A class utility is a recipe move only when the element's own `@orb/ui` component applies a `tv()` table whose arm writes that exact class, and forwards the axis under its own name. The component is read from its own file; a component that renders another door's core, or applies its table through a helper the syntax cannot follow, has no entry and gets no verdict. An arm is read as the string literals in its `tv()` value, through a same-file const or a unique ui export, so a class an arm builds with a call or a template substitution is not seen. A slot-keyed arm names its slots in the reason.",
  "Every axis of the element's table is searched for a class, so an axis needs no entry in the census. Two classes are one utility family when the merger from `@orb/ui/lib` makes each evict the other. A class no arm writes is `new arm` when an axis writes its family, `part of` when an arm writes it beside other classes and it tells that arm from its siblings, `rides on` when every arm of an axis writes it, `another primitive` when it evicts the base and a sibling of the door is built on it, `against base` when it evicts the base with no such sibling, `no axis` when an axis of any door chooses its family, and a class use with no row otherwise: the census section lists those. A utility the merger does not group, such as `shadow-card`, has no family. A class under a variant, a ternary, `&&`, `||` or `??`, a value of a lookup map or an argument of a helper other than `cn` is marked conditional, since an arm is one unconditional class.",
  "A token is offered as an owner by value only when it is a general scale step or role. The purpose-scoped tokens (`SCOPED` in `hand-scope.ts`, from the token descriptions) are reported as a `decide` with the scoped token named. A family row scopes a new step in that family; a token minted in any other family is general until a row names it. A row that matches no token is printed in the report.",
  "The repeated constants in `COINCIDENT_CONSTANTS` are keeps, read one by one; a group that gains a member is a repeat again.",
  "A container query condition in a stylesheet is a keep: it cannot read a custom property. A media condition is still priced against the breakpoint tokens.",
  "An alpha on an intent colour is a tone-role move (D336); an alpha on a neutral colour is a `decide`. A neutral tone's roles may own some of those steps; the census cannot tell which.",
  "A `className` on a client component that hands it on is judged on the primitive it lands on, as a `through` row, and the lint follows that only within one file: a rule reads one file. A wrapper that computes where the class lands is not followed, and a `*ClassName` prop styles a part, not the element. A spread is read through an object literal, a same-file const, a ternary or `&&`; a selected table member is the lint's, and a call or an import is not read, which is why `orb/no-built-class-string` refuses a helper that returns a `className`.",
  "Tailwind numeric steps are priced at 4px a step; the theme resets that scale, so a raw `p-5` may not generate a rule at all.",
  "A style value is a design value only when it is a literal or a branch of a conditional, `??` or `||` over literals. Any other expression reads as a runtime value, including a user colour that should have been a token.",
  "A repeated cluster is the same sorted set of three or more class tokens written three or more times, judged once per kind of element that wears it: a composite is offered to raw containers and layout primitives only. A class constant names no element, so its uses are a decision. A near-duplicate set is not matched.",
  "A string under a `tv()` call is class text except an arm key, a default arm, a compound condition and a string compared with `===`. A sentinel is found by the word `sentinel` in the name of the constant that holds it, and a feature probe by sitting in an `@supports` test.",
  "A colour equals a token only by identical normalised text. A hex or `rgb()` is never equal to an `oklch()` token, so it reads as a new token.",
  "A component is found by the name its import exports, so an aliased import reads its own table.",
  "A migration plan (`--plan`) lists a recipe row only when `move-proof.ts` proves the move renders the same: the arm writes exactly that class, on the element, with no compound, default or `data-*` attribute riding on the prop, and nothing that renders after the axis's slot conflicts with the class. Conflict is the merger's word. A class an arm builds at runtime and a class in a caller's `className` behind a spread are not seen; the codemod skips a spread, a lookup and a helper call. The typecheck after the rewrite proves the prop exists.",
  "CSS selector context and the cascade are not read, and a value that only the cascade produces is not seen. Generated files are skipped by their header.",
];

export const CANNOT_SEE: readonly string[] = [
  "Syntax only: no type checker. A chip that renders a raw expression is reported as dynamic; its case is not measured.",
  "Class strings assembled across statements are not read. A constant is read when it is named *Class or *Classes, or when a className, *ClassName, cn or tv in its own file or a relative importer reads it; an import through an alias is not followed.",
  "A computed prop is unread by the variant census; an axis with such a use cannot claim an unused value. A spread that is not an object literal writes nothing there, on the word of orb/no-opaque-variant-spread.",
  "Layout variants are merged per door, so a value used on Row counts for Stack.",
  "A `<Track of={X}>` counts as X, and a door that renders another door's core.tsx (GlyphButton, InlineAction, PictureButton) counts for that door's axes. A prop renamed onto an axis (`actionsFloat` to `float`), a value computed inside a component, and a wrapper door that writes another door's axis (RadioGroupPicker to PickerCell) are not seen, so read the component before deleting an unwritten value.",
  "Dialog dismiss evidence is read per file: a file with two dialogs shares one answer. Dismiss evidence is an element, not a runtime check.",
  "The destructive-verb check reads button text against a word list; a Delete behind an icon-only button is not matched.",
  "CSS is read line by line; a declaration split over lines is partly read. Selector context is not read.",
  "Tailwind raw numbers are priced at 4px a step; the config resets that scale, so a raw `w-4` may not be a valid class at all.",
  "Overrides by wrapper markup are not detected, only className and style on the primitive itself.",
  "Nothing is rendered: a value that only the cascade produces is not seen.",
];
