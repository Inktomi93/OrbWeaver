// Whether framed markup names external media, read by the host from the same text the frame gets, so the reader can be
// told why an image is missing when the frame's policy refuses it. It decides no policy: the frame's own CSP refuses the
// load whatever this answers, so a wrong answer only shows or hides the notice.
//
// The markup is parsed into a `DOMParser` document, which runs no script and loads no resource, and is read through the
// raw attributes: a `<base>` there would retarget the element's resolved URL, and the frame's `base-uri 'none'`
// refuses one. Each address is resolved with the URL parser against this page, as the frame resolves it, and is
// external when its scheme is http or https and its origin is not the app's own.
//
// Cost: one parse of the markup, one pass per selector over its elements, and one forward pass over each style text.
// The answer stops at the first external address.
//
// Not seen: an address a frame script builds at run time, a CSS escape inside a function name or address, and an
// `image-set()` candidate after its first.

// The elements and attributes the frame's `img-src` and `media-src` govern.
const MEDIA_ATTRIBUTES = [
  ["img[src]", "src"],
  ["img[srcset]", "srcset"],
  ["source[src]", "src"],
  ["source[srcset]", "srcset"],
  ["video[src]", "src"],
  ["video[poster]", "poster"],
  ["audio[src]", "src"],
  ["track[src]", "src"],
  ['input[type="image" i][src]', "src"],
  ['link[rel~="preload" i][as="image" i][href]', "href"],
  ["[background]", "background"],
  ["image[href], feImage[href]", "href"],
  ["image, feImage", "xlink:href"],
] as const;
const SRCSET_ATTRIBUTES: ReadonlySet<string> = new Set(["srcset"]);
const CSS_ADDRESS_OPENER = /(?:url|image-set)\(/giu;
const CSS_SPACE = /\s/u;
const CSS_QUOTES: ReadonlySet<string> = new Set(['"', "'"]);
const CSS_CLOSE = ")";
const WEB_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);

function isExternal(address: string): boolean {
  const url = URL.parse(address.trim(), location.href);
  return url !== null && WEB_SCHEMES.has(url.protocol) && url.origin !== location.origin;
}

// Each srcset candidate is an address, then optional descriptors after whitespace.
function srcsetNamesExternal(srcset: string): boolean {
  return srcset.split(",").some((candidate) => {
    const [address] = candidate.trim().split(/\s+/u);
    return address !== undefined && address !== "" && isExternal(address);
  });
}

function skipSpace(css: string, from: number): number {
  let at = from;
  while (at < css.length && CSS_SPACE.test(css.charAt(at))) {
    at += 1;
  }
  return at;
}

// Every `url(` and `image-set(` address in one style text. The cursor only moves forward, and a string with no close
// ends the read, so the pass is linear in the text.
function cssNamesExternal(css: string): boolean {
  const opener = new RegExp(CSS_ADDRESS_OPENER.source, CSS_ADDRESS_OPENER.flags);
  let match = opener.exec(css);
  while (match !== null) {
    const start = skipSpace(css, match.index + match[0].length);
    const quote = css.charAt(start);
    const quoted = CSS_QUOTES.has(quote);
    const end = quoted ? css.indexOf(quote, start + 1) : css.indexOf(CSS_CLOSE, start);
    const address = css.slice(quoted ? start + 1 : start, end === -1 ? css.length : end);
    if (isExternal(address)) {
      return true;
    }
    if (end === -1) {
      return false;
    }
    opener.lastIndex = end + 1;
    match = opener.exec(css);
  }
  return false;
}

function attributeNamesExternal(element: Element, attribute: string): boolean {
  const value = element.getAttribute(attribute);
  if (value === null) {
    return false;
  }
  return SRCSET_ATTRIBUTES.has(attribute) ? srcsetNamesExternal(value) : isExternal(value);
}

function elementNamesExternal(document: Document): boolean {
  const attributes = MEDIA_ATTRIBUTES.some(([selector, attribute]) =>
    [...document.querySelectorAll(selector)].some((element) => attributeNamesExternal(element, attribute)),
  );
  return (
    attributes ||
    [...document.querySelectorAll("[style]")].some((element) => cssNamesExternal(element.getAttribute("style") ?? "")) ||
    [...document.querySelectorAll("style")].some((style) => cssNamesExternal(style.textContent))
  );
}

/** Whether a frame document built from `html` and `css` names an image or media address off the app's origin. */
export function holdsExternalMedia(html: string, css: string | undefined): boolean {
  if (css !== undefined && cssNamesExternal(css)) {
    return true;
  }
  return elementNamesExternal(new DOMParser().parseFromString(html, "text/html"));
}
