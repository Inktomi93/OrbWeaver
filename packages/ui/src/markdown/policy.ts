// The two-trust-policy markdown security config. Streamdown's real security surface is
// allowedElements/disallowedElements + urlTransform (not allowedImagePrefixes/allowDataImages,
// which don't exist). Streamdown runs rehype-sanitize + rehype-harden by default, so `trusted` is
// the permissive policy and `untrusted` tightens via an element allowlist + a url blocker.
// "trusted" names the permissive policy, which still sanitizes. The caller selects it for the viewer's own
// input or a character resolved at or above `trusted` — every inheriting character by default (D294).
// External media is a separate axis: a trusted row that forbids it still drops off-origin media
// (`ownOriginMediaOnly`), because the app CSP follows only the box-wide setting.
import remarkGfm from "remark-gfm";
import type { AllowElement, AllowedTags, StreamdownProps, UrlTransform } from "streamdown";
import { defaultRemarkPlugins } from "streamdown";

const IMAGE_TAG = "img";
const SOURCE_TAG = "source";

/**
 * The Tier-A element allowlist: structural + text-formatting + tables + details/summary + links +
 * images. Forbidden by omission: script, style, iframe, object, embed, form, input, and any `on*`
 * handler. This is the full trusted surface; the untrusted surface drops `img` (see below).
 */
export const TIER_A_ELEMENTS: readonly string[] = [
  "p",
  "br",
  "hr",
  "span",
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

/** True when `url` resolves on the page's own origin (a path, a query or a fragment). A protocol-relative
 *  or backslash-led url and every absolute url resolve elsewhere.
 *  @public Test-anchored module surface; the policy suite pins it against off-origin spellings. */
export function resolvesOnOwnOrigin(url: string): boolean {
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

/**
 * Host prefixes an untrusted external image/link may load from. Minimal by design (the load itself
 * is the tracking-pixel/exfil risk): only relative + the app's own origin.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const UNTRUSTED_ALLOWED_PREFIXES: readonly string[] = ["/", "#"];

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
  let parsed: URL;
  // @orb-waive caught-failure-ownership(catch): fail-closed security gate, documented below
  // — an unparseable url is blocked (empty string), consumed by Streamdown as "drop this url". Ends if
  // the block-on-unparseable behavior is removed.
  try {
    parsed = new URL(value);
  } catch {
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
 * `10~20°C`). Overrides only `remarkPlugins`, never `rehypePlugins` — Streamdown's `allowedTags`
 * schema-merge is gated on `rehypePlugins` staying its default reference.
 */
export const MARKDOWN_REMARK_PLUGINS: NonNullable<StreamdownProps["remarkPlugins"]> = Object.values({
  ...defaultRemarkPlugins,
  gfm: [remarkGfm, { singleTilde: false }],
});

/**
 * Trusted-only custom-tag passthrough for the `<speaker>` wire format. Adds `<speaker>` to
 * Streamdown's sanitize schema (no attributes permitted) so a raw `<speaker>NAME</speaker>` that
 * reaches the renderer renders its NAME as literal text instead of being mangled by markdown
 * parsing. Not applied to `untrusted` — imported/foreign content has no business carrying it.
 */
export const TRUSTED_ALLOWED_TAGS: AllowedTags = { speaker: [] };

/**
 * The tags whose children Streamdown treats as plain text. Pairs with {@link TRUSTED_ALLOWED_TAGS}
 * so a `<speaker>` name containing markdown-significant characters renders verbatim.
 */
export const TRUSTED_LITERAL_TAG_CONTENT: readonly string[] = ["speaker"];
