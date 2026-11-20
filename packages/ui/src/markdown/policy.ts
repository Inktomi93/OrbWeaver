// The two-trust-policy markdown security config. Streamdown's real security surface is
// allowedElements/disallowedElements + urlTransform (not allowedImagePrefixes/allowDataImages,
// which don't exist). Streamdown runs rehype-sanitize + rehype-harden by default, so `trusted` is
// the permissive policy and `untrusted` tightens via an element allowlist + a url blocker.
// "trusted" names the permissive policy, which still sanitizes. The caller selects it for the viewer's own
// input or a character resolved at or above `trusted` — every inheriting character by default (D294).
// External media is a separate axis: a trusted row that forbids it still drops off-origin media
// (`ownOriginMediaOnly`), because the app CSP follows only the box-wide setting.
// Both tiers run Streamdown's rehype pipeline with the seal's own sanitize schema (`sealSanitize`), the one place an
// inline colour is admitted.
import remarkGfm from "remark-gfm";
import type { AllowElement, StreamdownProps, UrlTransform } from "streamdown";
import { defaultRehypePlugins, defaultRemarkPlugins } from "streamdown";
import { REFERENCE_BUDGET_REMARK_PLUGINS } from "./reference-budget.ts";

const IMAGE_TAG = "img";
const SOURCE_TAG = "source";

// Streamdown sanitizes raw HTML before KaTeX; its final element filter must retain the generated MathML.
// Exclude fetching mglyph and HTML integration points such as annotation-xml, not just scripts.
const KATEX_MATHML_ELEMENTS: readonly string[] = [
  "math",
  "semantics",
  "annotation",
  "mrow",
  "mi",
  "mn",
  "mo",
  "mtext",
  "mspace",
  "msup",
  "msub",
  "msubsup",
  "mover",
  "munder",
  "munderover",
  "mfrac",
  "mroot",
  "msqrt",
  "mtable",
  "mtr",
  "mtd",
  "mlabeledtr",
  "menclose",
  "mstyle",
  "mpadded",
  "mphantom",
];

// The Tier-A element allowlist: structural + text-formatting + tables + details/summary + links +
// images + inert MathML, and `font`, which carries only a validated colour (see `sealSanitize`). Forbidden by
// omission: script, style, iframe, object, embed, form, input, and any `on*` handler. The untrusted surface drops
// `img` (see below).
const TIER_A_ELEMENTS: readonly string[] = [
  "p",
  "br",
  "hr",
  "span",
  "font",
  "div",
  "blockquote",
  "pre",
  "code",
  "strong",
  "em",
  "del",
  "ins",
  "sub",
  "sup",
  "mark",
  "small",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "details",
  "summary",
  "a",
  IMAGE_TAG,
  ...KATEX_MATHML_ELEMENTS,
];

/**
 * The untrusted element allowlist = Tier-A minus `img`: external media is forbidden by default.
 * Streamdown emits a `<link rel="preload" as="image" href=…>` for a markdown image that its
 * `urlTransform` does not intercept, so an untrusted external image would prefetch to the source
 * (a tracking-pixel exfil) even with the url gate — dropping `img` blocks that at the element level.
 */
export const TIER_A_UNTRUSTED_ELEMENTS: readonly string[] = TIER_A_ELEMENTS.filter((tag) => tag !== IMAGE_TAG);

// A base no request can reach: `.invalid` never resolves. Resolving against it is how the browser will
// resolve the same url against the page, so `//host` and `/\host` land off it exactly as they would live.
const OWN_ORIGIN_PROBE = new URL("https://own-origin.invalid");

// True when `url` resolves on the page's own origin (a path, a query or a fragment). A protocol-relative
// or backslash-led url and every absolute url resolve elsewhere.
function resolvesOnOwnOrigin(url: string): boolean {
  return URL.canParse(url, OWN_ORIGIN_PROBE) && new URL(url, OWN_ORIGIN_PROBE).origin === OWN_ORIGIN_PROBE.origin;
}

/**
 * The trusted-tier media gate for content whose row forbids external media. The trusted sanitize schema
 * (rehype-sanitize's GitHub default) admits two fetching elements: `img[src]` and `picture > source[srcSet]`.
 * An `img` stays only when its `src` resolves on the page's own origin. Every `source` is dropped, because a
 * `srcSet` lists several urls and the browser picks one; its `picture` still falls back to the `img` inside.
 * The app CSP cannot do this job: its `img-src` follows the box-wide setting, never the row's.
 */
export const ownOriginMediaOnly: AllowElement = (element) => {
  if (element.tagName === SOURCE_TAG) {
    return false;
  }
  if (element.tagName !== IMAGE_TAG) {
    return true;
  }
  const src = element.properties["src"];
  return typeof src === "string" && resolvesOnOwnOrigin(src);
};

// Protocols an untrusted link may use — everything else (javascript:, data:, vbscript:, …) is blocked.
const SAFE_PROTOCOLS: readonly string[] = ["http:", "https:", "mailto:"];

// Host prefixes an untrusted external image/link may load from. Minimal by design (the load itself
// is the tracking-pixel/exfil risk): only relative + the app's own origin.
const UNTRUSTED_ALLOWED_PREFIXES: readonly string[] = ["/", "#"];

/**
 * The `untrusted` url gate. Returns the url to allow it, or an empty string to block (Streamdown
 * drops a url whose transform returns falsy). Blocks any non-safe protocol, any `data:` URI, and
 * any absolute-URL host not on the allowlist. Relative/anchor urls pass.
 */
export const untrustedUrlTransform: UrlTransform = (url) => {
  const value = url.trim();
  if (value.length === 0) {
    return "";
  }
  if (UNTRUSTED_ALLOWED_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return value;
  }
  // The empty string is this gate's block verdict: Markdown passes untrustedUrlTransform as Streamdown's
  // urlTransform, which drops a url that transforms to "".
  const parsed = URL.parse(value);
  if (parsed === null) {
    return ""; // not parseable as absolute + not an allowed relative form → block
  }
  if (!SAFE_PROTOCOLS.includes(parsed.protocol)) {
    return ""; // javascript:, data:, vbscript:, tel:, all blocked
  }
  return value;
};

/**
 * The remark-plugin list for both trust tiers — Streamdown's own `defaultRemarkPlugins` with only
 * the `gfm` entry re-pinned to `{ singleTilde: false }` (its default strikes through prose like
 * `10~20°C`), then the reference-link copy budget (`reference-budget.ts`).
 */
const VENDOR_REMARK_PLUGINS: NonNullable<StreamdownProps["remarkPlugins"]> = Object.values({
  ...defaultRemarkPlugins,
  gfm: [remarkGfm, { singleTilde: false }],
});
export const MARKDOWN_REMARK_PLUGINS: NonNullable<StreamdownProps["remarkPlugins"]> = [...VENDOR_REMARK_PLUGINS, ...REFERENCE_BUDGET_REMARK_PLUGINS];

/** The tag a dialogue colour may ride on as an attribute (`<font color>`), which the seal draws as a `span`. */
export const COLOUR_FONT_TAG = "font";

// ONE colour value, strict: a hex colour, a bare keyword, or an rgb/hsl function of plain numbers. Nothing here can
// open a url, a variable, an expression, a comment, an escape or a second declaration: no `\`, `/*`, `;` or `(`
// outside the two named functions. A value the browser does not take as a colour paints nothing.
const NUMBER = String.raw`[+-]?(?:\d{1,4}(?:\.\d{1,4})?|\.\d{1,4})(?:%|deg)?`;
// Arguments part at a comma, a slash or whitespace; a separator is never empty, so two numbers never split one run of digits.
const ARGUMENT_SEPARATOR = String.raw`(?:[ \t]*[,/][ \t]*|[ \t]+)`;
const COLOUR_VALUE = String.raw`(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]{3,24}|(?:rgba?|hsla?)\([ \t]*${NUMBER}(?:${ARGUMENT_SEPARATOR}${NUMBER}){2,3}[ \t]*\))`;
/** A `<font color>` value the seal draws as a colour. */
export const FONT_COLOUR_RE = new RegExp(String.raw`^[ \t]*${COLOUR_VALUE}[ \t]*$`, "iu");
/** A `style` attribute the sanitizer keeps: one `color` declaration and nothing else. */
const COLOUR_ONLY_STYLE_RE = new RegExp(String.raw`^[ \t]*color[ \t]*:[ \t]*${COLOUR_VALUE}[ \t]*(?:;[ \t]*)?$`, "iu");

// Streamdown types its rehype entries as plain `Pluggable`s, which erases the sanitize schema. These are the two
// schema fields the seal extends; every other field passes through as Streamdown set it.
type PropertyDefinition = string | readonly [string, ...(string | number | boolean | RegExp)[]];
interface SanitizeSchema {
  readonly tagNames?: readonly string[] | null | undefined;
  readonly attributes?: Readonly<Record<string, readonly PropertyDefinition[]>> | null | undefined;
}
type RehypeEntry = NonNullable<StreamdownProps["rehypePlugins"]>[number];
type RehypePlugin = Extract<RehypeEntry, (...parameters: never) => unknown>;

function isSchema(value: unknown): value is SanitizeSchema {
  return typeof value === "object" && value !== null;
}

// Streamdown's own sanitize step, with its schema: its protocol and clobber choices stay the vendor's.
function vendorSanitize(): readonly [RehypePlugin, SanitizeSchema] {
  const entry = defaultRehypePlugins["sanitize"];
  if (!(Array.isArray(entry) && typeof entry[0] === "function" && isSchema(entry[1]))) {
    throw new Error("streamdown's sanitize entry is not a [plugin, schema] pair");
  }
  return [entry[0], entry[1]];
}

/**
 * The seal's sanitize schema: Streamdown's, plus a dialogue colour on two carriers (D294, UI-Theming-and-Content
 * §12.2). A `span` keeps a `style` that is exactly one colour declaration; any other style is dropped by the sanitizer
 * itself. `font` is kept as a tag. Streamdown's `*` attributes already keep `color` on every element at any value, so
 * the seal's `font` component is the step that admits a {@link FONT_COLOUR_RE} value as a colour and drops every other
 * attribute. `extraTags` adds tags with no attributes, for the trusted tier's `<speaker>`.
 */
function sealSanitize(extraTags: readonly string[]): RehypeEntry {
  const [plugin, schema] = vendorSanitize();
  const attributes = schema.attributes ?? {};
  const extended: SanitizeSchema = {
    ...schema,
    tagNames: [...(schema.tagNames ?? []), COLOUR_FONT_TAG, ...extraTags],
    attributes: {
      ...attributes,
      span: [...(attributes["span"] ?? []), ["style", COLOUR_ONLY_STYLE_RE]],
      ...Object.fromEntries(extraTags.map((tag) => [tag, []])),
    },
  };
  return [plugin, extended];
}

function sealRehypePlugins(extraTags: readonly string[]): NonNullable<StreamdownProps["rehypePlugins"]> {
  return Object.entries(defaultRehypePlugins).map(([name, entry]) => (name === "sanitize" ? sealSanitize(extraTags) : entry));
}

/** The custom tag the trusted tier keeps for the `<speaker>` wire format, with no attribute, so a raw
 *  `<speaker>NAME</speaker>` that reaches the renderer shows its NAME as literal text. The untrusted tier's element
 *  filter drops the tag and keeps the name. */
const SPEAKER_TAG = "speaker";

/** The rehype pipeline of the untrusted tier: Streamdown's, with the seal's sanitize schema. */
export const UNTRUSTED_REHYPE_PLUGINS = sealRehypePlugins([]);
/** The rehype pipeline of the trusted tier: the untrusted tier's, with `<speaker>` kept. */
export const TRUSTED_REHYPE_PLUGINS = sealRehypePlugins([SPEAKER_TAG]);

/** The tags whose children Streamdown treats as plain text, so a `<speaker>` name containing markdown-significant
 *  characters renders verbatim. */
export const TRUSTED_LITERAL_TAG_CONTENT: readonly string[] = [SPEAKER_TAG];
