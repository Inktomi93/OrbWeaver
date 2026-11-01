// Which findings could become a lint rule, and which need a data or design decision first. Counts come from the run.
import type { UiFacts } from "./analysis.ts";
import type { Cohort } from "./compare.ts";
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
      hits: cohortOutliers(facts, "copy:placeholder-search", "ellipsis") + cohortOutliers(facts, "copy:placeholder", "ellipsis"),
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
  { finding: "Raw wire value in a chip", needs: "type information; the syntax cannot tell a raw enum from a mapped word" },
];

export const CANNOT_SEE: readonly string[] = [
  "Syntax only: no type checker. A chip that renders a raw expression is reported as dynamic; its case is not measured.",
  "Class strings assembled across statements, or held in constants not named *Class or *Classes, are not read.",
  "A spread or computed prop is invisible to the variant usage count; an axis with a computed use cannot claim an unused value.",
  "Layout variants are merged per door, so a value used on Row counts for Stack.",
  "Dialog dismiss evidence is read per file: a file with two dialogs shares one answer. Dismiss evidence is an element, not a runtime check.",
  "The destructive-verb check reads button text against a word list; a Delete behind an icon-only button is not matched.",
  "CSS is read line by line; a declaration split over lines is partly read. Selector context is not read.",
  "Tailwind raw numbers are priced at 4px a step; the config resets that scale, so a raw `w-4` may not be a valid class at all.",
  "Overrides by wrapper markup are not detected, only className and style on the primitive itself.",
  "Nothing is rendered: a value that only the cascade produces is not seen.",
];
