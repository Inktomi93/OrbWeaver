// What a framed reply's card-frame document needs besides its markup (D294), so the reply reads like its
// neighbours: the app rules its markup can match, the resolved token set at the reply's place in the page (a
// custom theme and a speaker's carried palette included), and the root's `data-*` channels. The frame re-clamps
// the tokens and attributes (`@orb/kit/card-frame`); this only reads the page.
//
// THE CSS IS APP-AUTHORED ONLY. It is read through the CSSOM from the app's own build sheets: a same-origin
// `<link>` (production) or a `<style>` Vite injected for a source module (development). Every other sheet is
// skipped: the owner's custom theme `<style>` (its values reach the frame only as clamped token values), a
// browser extension's sheet, and any sheet the CSSOM refuses to read. A frame cannot load the app's sheets itself:
// its origin is opaque, and every app response carries `Cross-Origin-Resource-Policy: same-origin`.
//
// Only the rules the reply's markup can match travel, so a transcript of framed replies does not carry the whole
// app stylesheet per frame. A rule is matched against the markup parsed into an inert document (no script runs and
// no resource loads in a `DOMParser` document), with interaction states and pseudo-elements stripped first so a
// hover colour or a marker rule still travels. A selector the parser refuses is kept rather than guessed at.

import { clampCardFrameRootAttributes, clampCardFrameThemeTokens } from "@orb/kit/card-frame";
import { LIVE_TOKEN_ROOT_ATTRIBUTE } from "#lib";

// The frame's own rules over the app's: the reply sits inside its bubble, so the frame paints no second surface,
// and the bubble slot keeps only its reading typography; the body's root carries `data-frame-reply`
// (`packages/client/src/features/chat/components/reply-frame.tsx`). The app shell clips its root; a frame must not,
// so markup wider than a phone column at a large text scale scrolls sideways instead of being cut off. Unlayered and
// last, so it outranks the app's rules.
const FRAME_REPLY_CSS =
  "html,body{background:transparent;overflow:visible;}[data-frame-reply]{background:none;border:0;box-shadow:none;padding:0;margin:0;inline-size:auto;max-inline-size:none;min-block-size:0;}";

// What the mint needs besides the markup: the page's look at the reply's place.
interface FrameReplyLook {
  readonly themeTokens: Readonly<Record<string, string>>;
  readonly rootAttributes: Readonly<Record<string, string>>;
  /** The app rules the markup can match, then {@link FRAME_REPLY_CSS}. */
  readonly css: string;
}

const APP_LAYER = "orb-app";
const CUSTOM_PROPERTY = /^--/u;
const DATA_ATTRIBUTE = /^data-/u;
// States a static document never enters, and parts no element is: stripped before matching so their rules travel.
const UNMATCHABLE_STATE =
  /::?(?:before|after|marker|placeholder|selection|backdrop|first-line|first-letter|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+)|:(?:hover|active|focus-visible|focus-within|focus|visited|target|open|checked|placeholder-shown|popover-open|autofill)(?![\w-])/gu;

function dataAttributes(element: Element | null, into: Record<string, string>): void {
  for (const attribute of element?.attributes ?? []) {
    if (DATA_ATTRIBUTE.test(attribute.name)) {
      into[attribute.name] = attribute.value;
    }
  }
}

function isAppSheet(sheet: CSSStyleSheet): boolean {
  const owner = sheet.ownerNode;
  if (owner instanceof HTMLLinkElement) {
    return sheet.href !== null && new URL(sheet.href).origin === location.origin;
  }
  return owner instanceof HTMLStyleElement && owner.dataset["viteDevId"] !== undefined;
}

// The sheet's rules, or none when the CSSOM refuses to read them (a cross-origin sheet throws `SecurityError`).
function readableRules(sheet: CSSStyleSheet): readonly CSSRule[] {
  try {
    return [...sheet.cssRules];
  } catch {
    return [];
  }
}

function canMatch(selectorText: string, document: Document): boolean {
  try {
    return document.querySelector(selectorText.replaceAll(UNMATCHABLE_STATE, "")) !== null;
  } catch {
    return true;
  }
}

function keptRule(rule: CSSRule, document: Document): string {
  if (rule instanceof CSSStyleRule) {
    return canMatch(rule.selectorText, document) ? rule.cssText : "";
  }
  // A font the frame could not fetch (the same cross-origin wall) and an import it could not follow.
  if (rule instanceof CSSFontFaceRule || rule instanceof CSSImportRule) {
    return "";
  }
  if (rule instanceof CSSGroupingRule) {
    const inner = [...rule.cssRules].map((child) => keptRule(child, document)).join("");
    return inner === "" ? "" : `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${inner}}`;
  }
  // Layer order, custom-property registrations, keyframes: small, and their use cannot be read off a selector.
  return rule.cssText;
}

function attributeMarkup(attributes: Readonly<Record<string, string>>): string {
  return Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");
}

function matchedAppCss(markup: string, rootAttributes: Readonly<Record<string, string>>): string {
  const parsed = new DOMParser().parseFromString(`<!doctype html><html${attributeMarkup(rootAttributes)}><body>${markup}</body></html>`, "text/html");
  const kept: string[] = [];
  for (const sheet of document.styleSheets) {
    if (isAppSheet(sheet)) {
      for (const rule of readableRules(sheet)) {
        kept.push(keptRule(rule, parsed));
      }
    }
  }
  return kept.join("");
}

/** The page's look at `host` for a reply's rendered `markup`: read once per render of the frame document, after it
 *  renders, so a theme flip, a custom theme or a text scale is read again when the caller renders again. */
export function resolveFrameReplyLook(host: Element, markup: string): FrameReplyLook {
  const computed = getComputedStyle(host);
  const themeTokens: Record<string, string> = {};
  for (const name of computed) {
    if (CUSTOM_PROPERTY.test(name)) {
      const value = computed.getPropertyValue(name).trim();
      if (value !== "") {
        themeTokens[name] = value;
      }
    }
  }
  const rawAttributes: Record<string, string> = {};
  dataAttributes(document.documentElement, rawAttributes);
  dataAttributes(document.querySelector(`[${LIVE_TOKEN_ROOT_ATTRIBUTE}]`), rawAttributes);
  // Clamped here with the frame's own grammars, so the mint never refuses a whole reply over one token or attribute
  // the frame would drop anyway (a Tailwind shadow stack is longer than any token the frame takes).
  const rootAttributes = clampCardFrameRootAttributes(rawAttributes);
  // The app's rules sit in one cascade layer, so every unlayered rule outranks them whatever its specificity: the
  // reply's own `<style>` blocks and inline styles, the frame's token and base rules, and FRAME_REPLY_CSS.
  const css = `@layer ${APP_LAYER}{${matchedAppCss(markup, rootAttributes)}}${FRAME_REPLY_CSS}`;
  return { themeTokens: clampCardFrameThemeTokens(themeTokens), rootAttributes, css };
}
