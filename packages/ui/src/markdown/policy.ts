// The two-trust-policy markdown security config (UI-Gates §11.6 / D44 §12.2). Built against the
// VERIFIED Streamdown 2.5 API (its real security surface is `allowedElements`/`disallowedElements` +
// `urlTransform`, NOT the docs-assumed `allowedImagePrefixes`/`allowDataImages`, which do not exist —
// recorded in ui-package-design §3/§10). Streamdown runs rehype-sanitize + rehype-harden by DEFAULT,
// so `trusted` is the permissive default and `untrusted` TIGHTENS via an element allowlist + a url
// blocker. Pure (no JSX) so the component file stays component-export-only.
import remarkGfm from "remark-gfm";
import type { AllowedTags, StreamdownProps, UrlTransform } from "streamdown";
import { defaultRemarkPlugins } from "streamdown";

/**
 * The Tier-A element allowlist (D44 §12.2): structural + text-formatting + tables + details/summary +
 * links + images. FORBIDDEN by omission: script, style, iframe, object, embed, form, input, and any
 * `on*` handler (Streamdown's sanitize strips attributes not on the harden allowlist regardless).
 * This is the full trusted surface; the UNTRUSTED surface drops `img` (see below).
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
  "img",
];

/**
 * The UNTRUSTED element allowlist = Tier-A MINUS `img` (D44 §12.3 — external media is forbidden by
 * default). VERIFIED (2026-07-02): Streamdown emits a `<link rel="preload" as="image" href=…>` for a
 * markdown image that its `urlTransform` does NOT intercept — so an untrusted external image would
 * PREFETCH to the source (the exact D21 tracking-pixel exfil) even with the url gate. Dropping `img`
 * blocks that at the element level. Untrusted images route through the gated `<MessageMedia>` when the
 * chat feature wires it (Phase 6); until then untrusted markdown renders no raw images.
 */
export const TIER_A_UNTRUSTED_ELEMENTS: readonly string[] = TIER_A_ELEMENTS.filter(
  (tag) => tag !== "img",
);

// Protocols an untrusted link may use — everything else (javascript:, data:, vbscript:, …) is blocked.
const SAFE_PROTOCOLS: readonly string[] = ["http:", "https:", "mailto:"];

/**
 * Host prefixes an untrusted external image/link may load from. Minimal by design (D21 — the load
 * itself is the tracking-pixel/exfil): only relative + the app's own origin in v1. The chat feature
 * widens this per its `forbidExternalMedia` policy when it wires MessageMedia (Phase 5).
 */
export const UNTRUSTED_ALLOWED_PREFIXES: readonly string[] = ["/", "#"];

/**
 * The `untrusted` url gate (D21 — cards / other users' content). Returns the url to allow it, or an
 * empty string to BLOCK (Streamdown drops a url whose transform returns falsy). Blocks: any non-safe
 * protocol, any `data:` URI (base64 tracking pixels / embedded payloads), and any absolute-URL host
 * not on the allowlist. Relative/anchor urls pass.
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
  try {
    parsed = new URL(value);
  } catch {
    return ""; // not parseable as absolute + not an allowed relative form → block
  }
  if (!SAFE_PROTOCOLS.includes(parsed.protocol)) {
    return ""; // javascript:, data:, vbscript:, tel:, … all blocked
  }
  return value;
};

/**
 * The remark-plugin list for BOTH trust tiers — Streamdown's own `defaultRemarkPlugins` with ONLY the
 * `gfm` entry re-pinned to `{ singleTilde: false }` (§11.6 the deferred fix). remark-gfm defaults
 * `singleTilde: true`, which strikes through prose like `10~20°C`; disabling single-tilde keeps `~~x~~`
 * strikethrough while leaving a lone `~` literal. This overrides ONLY `remarkPlugins` — never
 * `rehypePlugins` — because Streamdown's `allowedTags` schema-merge is gated on `rehypePlugins` still
 * being its default reference (verified in the 2.5 source); touching rehype would silently drop
 * `allowedTags`. `codeMeta` (the other default remark entry) is preserved by the spread.
 */
export const MARKDOWN_REMARK_PLUGINS: NonNullable<StreamdownProps["remarkPlugins"]> = Object.values(
  {
    ...defaultRemarkPlugins,
    gfm: [remarkGfm, { singleTilde: false }],
  },
);

/**
 * TRUSTED-only custom-tag passthrough (D44 §12.4 — the `<speaker>` wire format). Adds `<speaker>` to
 * Streamdown's sanitize schema (no attributes permitted) so a raw `<speaker>NAME</speaker>` that
 * reaches the renderer on the streaming ghost/reasoning path renders its NAME as literal text instead
 * of being mangled by markdown parsing. NOT applied to `untrusted` — that allowlist is intentionally
 * blind to our internal marker, and imported/foreign content has no business carrying it. On the
 * SETTLED trusted path the feature (`message-content.tsx`) has already consumed every `<speaker>` into
 * per-span `<ThemeScope>` colors upstream, so this is a belt-and-braces literal-render fallback there.
 */
export const TRUSTED_ALLOWED_TAGS: AllowedTags = { speaker: [] };

/**
 * The tags whose children Streamdown treats as plain text (no markdown/child-element parsing). Pairs
 * with {@link TRUSTED_ALLOWED_TAGS} (Streamdown requires a `literalTagContent` tag to also be in
 * `allowedTags`) so a `<speaker>` name containing markdown-significant characters renders verbatim.
 */
export const TRUSTED_LITERAL_TAG_CONTENT: readonly string[] = ["speaker"];
