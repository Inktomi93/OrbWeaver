// The CSS half of the compat lint: which property, value keyword and at-rule the floor lacks. Stylelint reads it over stylesheets;
// the ESLint rule reads it over the CSS a Tailwind class compiles to, so one key check judges both.

type Lacking = readonly string[];

const PROPERTY = "css.properties.";
const AT_RULE = "css.at-rules.";
const KEYWORD = /^[a-z][a-z0-9-]*$/u;

export interface CssSupportIndex {
  readonly properties: Map<string, Lacking>;
  /** property → value keyword → lacking browsers. */
  readonly values: Map<string, Map<string, Lacking>>;
  readonly atRules: Map<string, Lacking>;
}

/** `css.properties.x[.v]` / `css.at-rules.x` as [kind, name, value]; any other key shape (selectors, types, sub-features) is not a use here. */
function parseKey(key: string): ["at-rule" | "property", string, string | undefined] | null {
  const kind = key.startsWith(AT_RULE) ? "at-rule" : "property";
  const prefix = kind === "at-rule" ? AT_RULE : PROPERTY;
  const [name, value, ...rest] = key.slice(prefix.length).split(".");
  const spelled = key.startsWith(prefix) && rest.length === 0 && KEYWORD.test(name ?? "") && (value === undefined || KEYWORD.test(value));
  return spelled && name !== undefined ? [kind, name, value] : null;
}

const isHarmless = (harmless: Readonly<Record<string, string>>, property: string, value: string | undefined): boolean =>
  property in harmless || (value !== undefined && `${property}: ${value}` in harmless);

/** Index the lacking CSS keys; a `harmless` entry (ignored with no layout or behavior change) is left out: `prop` for the property whole, `prop: value` for one keyword. */
export function indexCss(unsupported: ReadonlyMap<string, Lacking>, harmless: Readonly<Record<string, string>>): CssSupportIndex {
  const index: CssSupportIndex = { properties: new Map(), values: new Map(), atRules: new Map() };
  for (const [key, lacking] of unsupported) {
    const [kind, name, value] = parseKey(key) ?? [];
    if (name === undefined || (kind === "property" && isHarmless(harmless, name, value))) {
      continue;
    }
    if (kind === "at-rule") {
      // `css.at-rules.supports.selector` is a sub-feature of a supported at-rule, not the at-rule.
      if (value === undefined) {
        index.atRules.set(name, lacking);
      }
    } else if (value === undefined) {
      index.properties.set(name, lacking);
    } else {
      index.values.set(name, (index.values.get(name) ?? new Map()).set(value, lacking));
    }
  }
  return index;
}

/** The refused part of one declaration (`field-sizing`, `display: subgrid`), or `null` when the floor runs it. */
export function refusedDeclaration(index: CssSupportIndex, property: string, value: string): { readonly what: string; readonly lacking: Lacking } | null {
  const lackingProperty = index.properties.get(property);
  if (lackingProperty !== undefined) {
    return { what: `\`${property}\``, lacking: lackingProperty };
  }
  const keywords = index.values.get(property);
  for (const word of keywords === undefined ? [] : value.toLowerCase().split(/[^a-z0-9-]+/u)) {
    const lacking = keywords?.get(word);
    if (lacking !== undefined) {
      return { what: `\`${property}: ${word}\``, lacking };
    }
  }
  return null;
}
