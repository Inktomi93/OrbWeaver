// A and B sites in TS and TSX: hand-rolled class tokens, inline styles, inline svg and raw intrinsics.
import ts from "typescript";
import { classifyToken, classStringsOf } from "./classes.ts";
import type { Site } from "./sites.ts";
import type { Elem, Source } from "./source.ts";
import { attrString, elementsOf, lineOf } from "./source.ts";

const INTRINSIC_KIND: Readonly<Record<string, string>> = {
  button: "raw-button",
  input: "raw-input",
  select: "raw-select",
  textarea: "raw-textarea",
  table: "raw-table",
  ul: "raw-list",
  ol: "raw-list",
  a: "raw-anchor",
  dialog: "raw-dialog",
  label: "raw-label",
  hr: "raw-hr",
  h1: "raw-heading",
  h2: "raw-heading",
  h3: "raw-heading",
  h4: "raw-heading",
  h5: "raw-heading",
  h6: "raw-heading",
};

export const CLUSTER_TOKENS = 3;
const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);
export const CONTAINER_TAGS = new Set(["div", "span", "li", "p", "section", "article", "header", "footer", "main", "nav", "aside"]);
// The icon set draws its own glyphs; these directories are where an svg is the work.
const SVG_HOMES = /^packages\/ui\/src\/(?:primitives\/icons|art|charts|markdown)\//u;

interface Finding {
  readonly line: number;
  readonly kind: string;
  readonly detail: string;
  readonly cluster?: string | null;
}

function siteOn(source: Source, elem: Elem | null, { line, kind, detail, cluster = null }: Finding): Site {
  return {
    kind,
    path: source.path,
    line,
    section: source.section,
    layer: source.layer,
    detail,
    tag: elem?.tag ?? null,
    on: elem?.kind ?? "none",
    door: elem?.door ?? null,
    cluster,
    ownerLayer: false,
  };
}

function intrinsicSites(source: Source, elem: Elem): readonly Site[] {
  if (elem.kind !== "raw" || source.layer !== "client") {
    return [];
  }
  const out: Site[] = [];
  const kind = INTRINSIC_KIND[elem.tag];
  if (kind !== undefined) {
    out.push(siteOn(source, elem, { line: elem.line, kind, detail: `<${elem.tag}>` }));
  }
  if (CONTAINER_TAGS.has(elem.tag) && elem.attrs.has("onClick")) {
    out.push(siteOn(source, elem, { line: elem.line, kind: "div-onclick", detail: `<${elem.tag} onClick>` }));
  }
  const role = attrString(elem.attrs.get("role"));
  if (CONTAINER_TAGS.has(elem.tag) && role !== undefined) {
    out.push(siteOn(source, elem, { line: elem.line, kind: "div-role", detail: `<${elem.tag} role="${role}">` }));
  }
  return out;
}

function svgSites(source: Source, elem: Elem): readonly Site[] {
  if (elem.kind !== "raw" || !SVG_TAGS.has(elem.tag) || SVG_HOMES.test(source.path)) {
    return [];
  }
  // One site per drawing, not per child shape.
  return elem.tag === "svg" ? [siteOn(source, elem, { line: elem.line, kind: "inline-svg", detail: "<svg>" })] : [];
}

function textareaSites(source: Source, elem: Elem): readonly Site[] {
  const rows = elem.attrs.get("rows")?.initializer;
  const single =
    rows !== undefined && ts.isJsxExpression(rows) && rows.expression !== undefined && ts.isNumericLiteral(rows.expression) && rows.expression.text === "1";
  // A maxRows ceiling says the box grows, which an Input cannot do.
  return elem.kind === "ui" && elem.tag === "Textarea" && single && !elem.attrs.has("maxRows")
    ? [siteOn(source, elem, { line: elem.line, kind: "textarea-single-row", detail: "Textarea rows={1}" })]
    : [];
}

function styleSites(source: Source, sf: ts.SourceFile, elem: Elem): readonly Site[] {
  const initializer = elem.attrs.get("style")?.initializer;
  if (initializer === undefined || !ts.isJsxExpression(initializer) || initializer.expression === undefined) {
    return [];
  }
  const expression = initializer.expression;
  if (!ts.isObjectLiteralExpression(expression)) {
    return [siteOn(source, elem, { line: elem.line, kind: "inline-style-runtime", detail: "style={…}" })];
  }
  const out: Site[] = [];
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      out.push(siteOn(source, elem, { line: lineOf(sf, property), kind: "inline-style-runtime", detail: "style spread" }));
      continue;
    }
    const key = property.name.getText(sf);
    const isLiteral =
      ts.isStringLiteral(property.initializer) || ts.isNumericLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer);
    if (key.startsWith("--") || key.startsWith('"--') || key.startsWith("'--")) {
      continue;
    }
    out.push(
      siteOn(source, elem, {
        line: lineOf(sf, property),
        kind: isLiteral ? "inline-style-static" : "inline-style-runtime",
        detail: `${key}: ${property.initializer.getText(sf)}`,
      }),
    );
  }
  return out;
}

function classSites(source: Source, sf: ts.SourceFile, referenced: ReadonlySet<string>): readonly Site[] {
  const out: Site[] = [];
  for (const classString of classStringsOf(source.path, sf, referenced)) {
    const cluster = classString.tokens.length >= CLUSTER_TOKENS ? classString.tokens.join(" ") : null;
    for (const token of classString.tokens) {
      const found = classifyToken(token);
      if (found !== null) {
        out.push(siteOn(source, classString.elem, { line: classString.line, kind: found.kind, detail: token, cluster }));
      }
    }
  }
  return out;
}

/** Every A and B site in one TS or TSX file. */
export function scanMarkup(source: Source, referenced: ReadonlySet<string>): readonly Site[] {
  const sf = source.sf;
  if (sf === null) {
    return [];
  }
  const out: Site[] = [...classSites(source, sf, referenced)];
  if (source.kind === "tsx") {
    for (const elem of elementsOf(sf)) {
      out.push(...intrinsicSites(source, elem), ...svgSites(source, elem), ...textareaSites(source, elem), ...styleSites(source, sf, elem));
    }
  }
  return out;
}
