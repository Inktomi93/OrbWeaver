// THE UNMATCHABLE-SELECTOR REFUSAL (#550 — the lying `--wait-for`).
//
// `--wait-for 'choose who speaks next'` is a VALID CSS selector: a descendant chain of four TYPE
// selectors (`choose > who > speaks > next`). No element is named `choose`, so the locator can never
// match, and Playwright's only report is a 10-second timeout that reads exactly like "the text is not
// rendered". A side-eye run filed that as a rendering defect, then the SAME run's `--eval` read the
// tooltip text back — the instrument printed a clean not-found for a query shape it does not support.
// (The suspected cause was a portal/top-layer blind spot. It is NOT: `text=` finds the app's portalled
// Base UI tooltip on the first try — proven live and pinned in tests/tooling/_shared/browser.int.test.ts.)
//
// So: a bare-identifier component that is not a real element name is a query shape snap REFUSES at
// parse time (exit 3, before a browser boots) with the `text=` spelling the caller meant. The predicate
// is deliberately narrow — it fires only on a component that is a PURE identifier (`choose`), never on
// anything carrying CSS syntax (`.x`, `#x`, `[x]`, `:x`) and never on a custom element (hyphenated, per
// the spec) — so `nav a`, `ul li` and every real selector pass untouched. A table short by one element
// name would be a FALSE refusal, which is worse than the lie, so the table is the whole element census.
import { splitLastEq, splitSelectorEq } from "../../_shared/argv.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** Flags whose WHOLE value is a selector — the population this refusal judges. Nav targets
 *  (--goto/--open-chat/--open-character/--context-tab), --expect-url and --eval expressions are NOT
 *  selectors and are deliberately absent. The last four are ops/flags.ts's OPTIONAL_SELECTOR_FLAGS,
 *  restated rather than imported (a lib/ file never imports ops/); the containment is pinned by
 *  tests/tooling/snap/lib/selector-shape.test.ts, so a fifth optional-selector flag cannot slip the net. */
export const SELECTOR_VALUE_FLAGS: ReadonlySet<string> = new Set([
  "--wait",
  "--wait-for",
  "--click",
  "--dom-click",
  "--force-click",
  "--hover",
  "--shot-of",
  "--mask",
  "--contrast",
  "--expect-visible",
  "--expect-focus",
  "--aria",
  "--text",
  "--map",
  "--motion",
  "--expect-no-overflow",
]);

/** Flags whose value is `selector=…`, so only the HEAD is a selector. `--key Tab` (no '=') is a bare
 *  key name and carries no selector at all. */
const SELECTOR_HEAD_FLAGS: ReadonlySet<string> = new Set(["--cascade", "--fill", "--key", "--expect-text", "--expect-count", "--upload", "--drop-files"]);

/** `--fill` splits on the FIRST '=' (its value is a JS literal that routinely contains '=' itself —
 *  `--fill 'input=const a = 1;'`); every other head flag keeps the LAST-'=' convention (selectors can
 *  themselves contain '=', e.g. `[data-x="a=b"]`). */
const FIRST_EQ_HEAD_FLAGS: ReadonlySet<string> = new Set(["--fill"]);

/** Every element name a CSS type selector can legitimately name: HTML (incl. the legacy tags a mock or
 *  an imported card can still carry), SVG, and MathML. Compared case-insensitively — an HTML-document
 *  type selector is case-insensitive, and the SVG camelCase spellings are folded in lowercase. */
const ELEMENT_NAMES: ReadonlySet<string> = new Set(
  (
    "html head title base link meta style body article section nav aside h1 h2 h3 h4 h5 h6 hgroup header " +
    "footer address p hr pre blockquote ol ul menu li dl dt dd figure figcaption main search div a em " +
    "strong small s cite q dfn abbr ruby rt rp data time code var samp kbd sub sup i b u mark bdi bdo " +
    "span br wbr ins del picture source img iframe embed object param video audio track map area table " +
    "caption colgroup col tbody thead tfoot tr td th form label input button select datalist optgroup " +
    "option textarea output progress meter fieldset legend details summary dialog script noscript " +
    "template slot canvas " +
    // HTML, legacy/deprecated but still parseable
    "acronym applet basefont big blink center dir font frame frameset image isindex keygen listing " +
    "marquee menuitem nobr noembed noframes plaintext rb rtc spacer strike tt xmp " +
    // SVG
    "svg g defs symbol use switch path rect circle ellipse line polyline polygon text tspan textpath " +
    "marker lineargradient radialgradient stop pattern clippath mask filter foreignobject desc metadata " +
    "animate animatemotion animatetransform set mpath view hatch hatchpath mesh meshgradient meshpatch " +
    "meshrow solidcolor " +
    // SVG filter primitives
    "feblend fecolormatrix fecomponenttransfer fecomposite feconvolvematrix fediffuselighting " +
    "fedisplacementmap fedistantlight fedropshadow feflood fefunca fefuncb fefuncg fefuncr " +
    "fegaussianblur feimage femerge femergenode femorphology feoffset fepointlight fespecularlighting " +
    "fespotlight fetile feturbulence " +
    // MathML
    "math mi mn mo ms mtext mrow mfrac msqrt mroot mstyle merror mpadded mphantom mspace msub msup " +
    "msubsup munder mover munderover mmultiscripts mprescripts mtable mtr mtd maction semantics " +
    "annotation annotation-xml"
  ).split(" "),
);

/** A component snap can judge: a bare tag name and nothing else. Anything with a `.`/`#`/`[`/`:`/`-`/
 *  digit-prefix carries CSS syntax or is a custom element, and is Playwright's business, not ours. */
const BARE_TYPE_SELECTOR = /^[A-Za-z][A-Za-z0-9]*$/;

/** Playwright's `engine=body` selector form (`text=`, `css=`, `xpath=`, `id=`, `role=`, `data-testid=`,
 *  `_react=`, …). */
const ENGINE_PREFIX = /^[A-Za-z_][\w-]*\s*=/;

/** Selector strings that are NOT CSS and must pass through untouched: the engine form above, Playwright's
 *  `internal:` engines, the `//`/`..` XPath shorthand, the `"quoted"` text shorthand, and any `>>` chain
 *  (each part of which may carry its own engine). */
function isNonCssSelector(selector: string): boolean {
  const head = selector.trimStart();
  return (
    ENGINE_PREFIX.test(head) ||
    head.startsWith("internal:") ||
    head.startsWith("//") ||
    head.startsWith("..") ||
    head.startsWith('"') ||
    selector.includes(">>")
  );
}

/** Top-level CSS combinators — the boundaries between compound components. */
const COMBINATORS: ReadonlySet<string> = new Set([" ", "\t", ">", "+", "~", ","]);

interface ScanState {
  readonly components: string[];
  current: string;
  depth: number;
  quote: string;
  escaped: boolean;
}

/** One character of the component scan. Quotes, `[...]` and `(...)` are opaque, so an attribute value
 *  (`[aria-label="Open chat"]`) or a functional pseudo-class (`:has(a b)`) stays ONE component instead
 *  of becoming a source of phantom "unknown elements". */
function scanChar(state: ScanState, char: string): void {
  if (state.escaped) {
    state.escaped = false;
  } else if (char === "\\") {
    state.escaped = true;
  } else if (state.quote !== "") {
    state.quote = char === state.quote ? "" : state.quote;
  } else if (char === '"' || char === "'") {
    state.quote = char;
  } else if (char === "[" || char === "(") {
    state.depth += 1;
  } else if (char === "]" || char === ")") {
    state.depth -= 1;
  } else if (state.depth === 0 && COMBINATORS.has(char)) {
    if (state.current !== "") {
      state.components.push(state.current);
      state.current = "";
    }
    return;
  }
  state.current += char;
}

/** Split a CSS selector into its TOP-LEVEL compound components. */
function topLevelComponents(selector: string): string[] {
  const state: ScanState = { components: [], current: "", depth: 0, quote: "", escaped: false };
  for (const char of selector) {
    scanChar(state, char);
  }
  if (state.current !== "") {
    state.components.push(state.current);
  }
  return state.components;
}

/** The selector a flag's VALUE carries: the whole value for a plain selector flag, the `head` of a
 *  `selector=…` pair flag, and null for everything else (a nav target, a URL, an expression, a bare key
 *  name — `--key Tab` has no '=' and is not a selector at all). */
function selectorOf(flag: string, raw: string): string | null {
  if (SELECTOR_VALUE_FLAGS.has(flag)) {
    return raw;
  }
  if (!(SELECTOR_HEAD_FLAGS.has(flag) && raw.includes("="))) {
    return null;
  }
  if (FIRST_EQ_HEAD_FLAGS.has(flag)) {
    // The same bracket-aware split the handler uses (#816) — two spellings here would refuse a
    // selector the run then happily fills, or vice versa.
    const split = splitSelectorEq(raw);
    return split === null ? null : split.head;
  }
  return splitLastEq(raw).head;
}

/** The parse-time entry point: the refusal for a flag's raw value, or null when this flag carries no
 *  selector or the selector is fine. ops/parse.ts pushes the message into `args.errors`. */
export function selectorRefusalForFlag(flag: string, raw: string): string | null {
  const selector = selectorOf(flag, raw);
  return selector === null ? null : unmatchableSelectorRefusal(flag, selector);
}

/** The refusal message for a selector that can never match, or null when the selector is judgeable-and-
 *  fine (or not ours to judge). Callers push the message into `args.errors`, which refuses the run with
 *  exit 3 before any browser boots. */
export function unmatchableSelectorRefusal(flag: string, selector: string): string | null {
  if (selector === "" || isNonCssSelector(selector)) {
    return null;
  }
  const unknown = topLevelComponents(selector).filter((component) => BARE_TYPE_SELECTOR.test(component) && !ELEMENT_NAMES.has(component.toLowerCase()));
  if (unknown.length === 0) {
    return null;
  }
  const names = unknown.map((word) => JSON.stringify(word)).join(", ");
  const isPhrase = unknown.length > 1;
  return (
    `${flag} selector ${JSON.stringify(selector)} can never match: ${names} ${isPhrase ? "are not element names" : "is not an element name"}, ` +
    `so this parses as a CSS TYPE selector for ${isPhrase ? "tags" : "a tag"} that cannot exist. ` +
    `To wait on RENDERED TEXT use Playwright's text engine: ${flag} "text=${selector}".`
  );
}
