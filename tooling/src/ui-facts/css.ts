// A sites in stylesheets. Line-based: one declaration per line is the house format, and the read is advisory.
import type { Source } from "../eslint/index.ts";
import type { Site } from "./sites.ts";

// Token layers define values; owner layers are where the system's own CSS lives. A stylesheet elsewhere is hand-rolled paint.
const TOKEN_FILES = new Set([
  "packages/ui/src/styles/theme.css",
  "packages/ui/src/styles/layers.css",
  "packages/ui/src/styles/fonts.css",
  "packages/client/src/styles/appearance-channel.gen.css",
]);
// The shell index and its region files are the one feature-tier CSS home (client-architecture-lockdown.md §4.2); the
// hand-rolling census judges each value in them against the shell's structural literals (§4.4).
const OWNER_LAYER =
  /^packages\/(?:ui\/src\/(?:styles|markdown)\/|client\/src\/styles\/|client\/src\/features\/app-shell\/surfaces\/(?:shell\.css$|shell\/[\w-]+\.css$))/u;

const DETAIL_MAX = 100;
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/iu;
const LENGTH = /(?<![\w.-])-?\d*\.?\d+(?:px|rem)\b/u;
// Preference and capability queries have no container equivalent; only a viewport size does.
const VIEWPORT_MEDIA = /@media[^{]*\((?:min-|max-)?(?:width|height|inline-size|block-size)\b/u;

function isOwnerLayer(path: string): boolean {
  return TOKEN_FILES.has(path) || OWNER_LAYER.test(path);
}

function blankComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, (comment) => comment.replace(/[^\n]/gu, " "));
}

function site(source: Source, line: number, kind: string, detail: string): Site {
  return {
    kind,
    path: source.path,
    line,
    section: source.section,
    layer: source.layer,
    detail: detail.trim().slice(0, DETAIL_MAX),
    tag: null,
    on: "none",
    door: null,
    cluster: null,
    ownerLayer: isOwnerLayer(source.path),
  };
}

const PROPERTY_KINDS: readonly (readonly [RegExp, string])[] = [
  [/^z-index$/u, "css-z-index"],
  [/^clip-path$/u, "css-clip-path"],
  [/^(?:transform|translate|rotate|scale)$/u, "css-transform"],
  [/^border(?:-[a-z-]+)?-radius$/u, "css-radius"],
  [/^box-shadow$/u, "css-shadow"],
  [/^opacity$/u, "css-opacity"],
];

function declarationSites(source: Source, line: number, property: string, value: string): readonly Site[] {
  const out: Site[] = [];
  const definesToken = property.startsWith("--");
  const detail = `${property}: ${value}`;
  if (/!important/u.test(value)) {
    out.push(site(source, line, "css-important", detail));
  }
  if (!definesToken) {
    const byProperty = PROPERTY_KINDS.find(([pattern]) => pattern.test(property));
    const literal = !/^var\(/u.test(value) && /\d/u.test(value);
    if (byProperty !== undefined && literal) {
      out.push(site(source, line, byProperty[1], detail));
    }
    if (/gradient\(/u.test(value)) {
      out.push(site(source, line, "css-gradient", detail));
    }
    if (LENGTH.test(value.replace(/var\([^)]*\)/gu, ""))) {
      out.push(site(source, line, "css-raw-length", detail));
    }
  }
  if (COLOR.test(value.replace(/var\([^)]*\)/gu, ""))) {
    out.push(site(source, line, "css-raw-color", detail));
  }
  return out;
}

export function scanCss(source: Source): readonly Site[] {
  const out: Site[] = [];
  const lines = blankComments(source.text).split("\n");
  for (const [index, text] of lines.entries()) {
    const line = index + 1;
    if (VIEWPORT_MEDIA.test(text)) {
      out.push(site(source, line, "css-media", text));
      continue;
    }
    const declaration = /^\s*(--[\w-]+|[a-z-]+)\s*:\s*(.+?)\s*;?\s*$/u.exec(text);
    if (declaration?.[1] !== undefined && declaration[2] !== undefined && !text.trimStart().startsWith("@")) {
      out.push(...declarationSites(source, line, declaration[1], declaration[2]));
    }
  }
  if (!isOwnerLayer(source.path)) {
    out.push(site(source, 1, "css-file-outside-layers", source.path));
  }
  return out;
}
