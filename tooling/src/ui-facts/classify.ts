// The five-way split of every client A and B site: is the drift a bypass of the system, or the system not covering the need?

import type { LengthTokens, TokenNamespace } from "../eslint/index.ts";
import { pxOf, tokensFor } from "../eslint/index.ts";
import type { Classified, Site, SiteClass } from "./sites.ts";
import { KINDS } from "./sites.ts";

/** The classification rule, printed at the head of the report so a reader can check it. */
export const CLASSIFICATION_RULE: readonly string[] = [
  "Only client-layer sites are classified. A site in packages/ui is the system itself; a CSS site in a token or owner layer is where raw values are legal.",
  "1. Bypass: the site is a raw element a primitive replaces (area B, or a hand-rolled token on a raw element), or its literal length equals a value a token already holds. Fix: adopt the named replacement.",
  "3. Missing composite: the site's class string (3 or more tokens, compared as a sorted set) appears in 3 or more files. Fix: the proposed composite, named by layout and dominant paint.",
  "4. Token gap: the same literal (an arbitrary value, a raw number, a CSS length or colour) appears at 3 or more sites in 2 or more files and no length token holds it. Fix: a token for that value.",
  "2. System gap: the site sits on a primitive or composite and overrides it by className or style, so no prop or variant covers the need. Grouped by element and override; 3 sites or 3 sections on one override read as one missing variant.",
  "5. One-off: none of the above.",
  "Precedence: a token that already holds the value (1) first, then repeated cluster (3), repeated literal (4), element override (2), raw-element replacement (1), else (5).",
];

const TAILWIND_STEP_PX = 4;
export const CLUSTER_MIN_FILES = 3;
export const LITERAL_MIN_SITES = 3;
export const LITERAL_MIN_FILES = 2;

export interface ClassifyContext {
  readonly tokens: LengthTokens;
  readonly clusterFiles: ReadonlyMap<string, ReadonlySet<string>>;
  readonly literalSites: ReadonlyMap<string, readonly Site[]>;
}

export const clusterKey = (cluster: string): string => cluster.split(/\s+/u).sort().join(" ");

/** The literal a site writes, normalised so equal values group: a length in pixels, a colour, or the token text. */
function literalOf(site: Site): string | null {
  if (site.kind === "css-raw-length") {
    const match = /(?<![\d.])(-?\d*\.?\d+)(px|rem)\b/u.exec(site.detail);
    const px = match === null ? null : pxOf(match[0]);
    return px === null ? null : `${px}px`;
  }
  if (site.kind === "css-raw-color") {
    return /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([^)]*\)/iu.exec(site.detail)?.[0] ?? null;
  }
  if (site.kind === "tw-arbitrary" || site.kind === "tw-raw-size" || site.kind === "tw-raw-spacing" || site.kind === "tw-color-literal") {
    return site.detail.replace(/^.*:(?![^[]*\])/u, "");
  }
  return null;
}

const NAMESPACES_BY_KIND: Readonly<Record<string, readonly TokenNamespace[]>> = {
  "tw-arbitrary": ["spacing", "size", "width", "radius"],
  "tw-raw-size": ["size", "width"],
  "tw-raw-spacing": ["spacing"],
  "css-raw-length": ["spacing", "size", "width", "radius", "border-width"],
};

function literalPx(site: Site): number | null {
  const literal = literalOf(site);
  if (literal === null) {
    return null;
  }
  const direct = pxOf(literal);
  if (direct !== null) {
    return direct;
  }
  const step = /-(\d+(?:\.\d+)?)$/u.exec(literal)?.[1];
  return step === undefined ? null : Number(step) * TAILWIND_STEP_PX;
}

function tokenHolding(site: Site, tokens: LengthTokens): readonly string[] {
  const namespaces = NAMESPACES_BY_KIND[site.kind];
  const px = namespaces === undefined ? null : literalPx(site);
  return px === null ? [] : tokensFor(tokens, px, namespaces);
}

const PAINT_WORDS: readonly (readonly [RegExp, string])[] = [
  [/^bg-/u, "Tinted"],
  [/^border/u, "Bordered"],
  [/^rounded/u, "Rounded"],
  [/^shadow/u, "Raised"],
  [/^truncate$/u, "Truncating"],
];

/** A proposed composite name from the cluster's layout and dominant paint; a proposal for a reviewer, not a decision. */
export function proposeName(cluster: string): string {
  const tokens = cluster.split(/\s+/u);
  const has = (word: string): boolean => tokens.some((token) => token === word || token.endsWith(`:${word}`));
  let layout = "Box";
  if (has("flex-col")) {
    layout = "Stack";
  } else if (has("flex") || has("inline-flex")) {
    layout = "Row";
  } else if (has("grid")) {
    layout = "Grid";
  }
  const paint = PAINT_WORDS.find(([pattern]) => tokens.some((token) => pattern.test(token)))?.[1] ?? "Plain";
  return `${paint}${layout}`;
}

interface Verdict {
  readonly cls: SiteClass;
  readonly why: string;
  readonly fix: string | null;
  readonly group: string | null;
}

function overrideOf(site: Site): string {
  return site.detail.replace(/^\S*:(?![^[]*\])/u, "");
}

const replacementFor = (site: Site): string | null => KINDS[site.kind]?.replacement ?? null;

function markupBypass(site: Site): Verdict | null {
  if (KINDS[site.kind]?.area !== "B") {
    return null;
  }
  return { cls: "bypass", why: `${KINDS[site.kind]?.what ?? site.kind}: a primitive owns it`, fix: replacementFor(site), group: null };
}

function tokenBypass(site: Site, context: ClassifyContext): Verdict | null {
  const held = tokenHolding(site, context.tokens);
  return held.length === 0 ? null : { cls: "bypass", why: "a token already holds this value", fix: held.join(" or "), group: null };
}

function compositeVerdict(site: Site, context: ClassifyContext): Verdict | null {
  const files = site.cluster === null ? undefined : context.clusterFiles.get(clusterKey(site.cluster));
  if (site.cluster === null || files === undefined || files.size < CLUSTER_MIN_FILES) {
    return null;
  }
  return {
    cls: "missing-composite",
    why: `the same ${site.cluster.split(/\s+/u).length}-token class string is in ${files.size} files`,
    fix: proposeName(site.cluster),
    group: clusterKey(site.cluster),
  };
}

function tokenGapVerdict(site: Site, context: ClassifyContext): Verdict | null {
  const literal = literalOf(site);
  const repeats = literal === null ? undefined : context.literalSites.get(`${site.kind}|${literal}`);
  if (literal === null || repeats === undefined || repeats.length < LITERAL_MIN_SITES || new Set(repeats.map((entry) => entry.path)).size < LITERAL_MIN_FILES) {
    return null;
  }
  return {
    cls: "token-gap",
    why: `${literal} repeats at ${repeats.length} sites and no length token holds it`,
    fix: `a token for ${literal}`,
    group: `${site.kind}|${literal}`,
  };
}

function overrideVerdict(site: Site): Verdict | null {
  if (site.on !== "ui" && site.on !== "composite" && site.on !== "local") {
    return null;
  }
  const tag = site.tag ?? "?";
  return {
    cls: "system-gap",
    why: `an override on <${tag}>`,
    fix: `a prop or variant on ${tag} for ${overrideOf(site)}`,
    group: `${tag}|${site.kind}|${overrideOf(site)}`,
  };
}

function rawVerdict(site: Site): Verdict {
  const replacement = replacementFor(site);
  return replacement !== null && site.on === "raw"
    ? { cls: "bypass", why: "a hand-rolled value on a raw element", fix: replacement, group: null }
    : { cls: "one-off", why: "no primitive, token or repeat covers it", fix: null, group: null };
}

export function classifySite(site: Site, context: ClassifyContext): Classified {
  const verdict =
    markupBypass(site) ??
    tokenBypass(site, context) ??
    compositeVerdict(site, context) ??
    tokenGapVerdict(site, context) ??
    overrideVerdict(site) ??
    rawVerdict(site);
  return { ...site, ...verdict };
}

export function buildContext(sites: readonly Site[], clusterStrings: ReadonlyMap<string, ReadonlySet<string>>, tokens: LengthTokens): ClassifyContext {
  const literalSites = new Map<string, Site[]>();
  for (const site of sites) {
    const literal = literalOf(site);
    if (literal !== null && !site.ownerLayer && site.layer === "client") {
      const key = `${site.kind}|${literal}`;
      literalSites.set(key, [...(literalSites.get(key) ?? []), site]);
    }
  }
  return { tokens, clusterFiles: clusterStrings, literalSites };
}

/** Sites the split covers: client code, outside the owner layers, with a hand-rolled value that is not a runtime style. */
export function classifiable(site: Site): boolean {
  return site.layer === "client" && !site.ownerLayer && site.kind !== "inline-style-runtime";
}
