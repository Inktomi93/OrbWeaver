// Markup shapes: the same tree of raw elements in 3 or more files is a composite nobody minted.
import ts from "typescript";
import type { FileFacts } from "./file-facts.ts";
import { lineOf } from "./source.ts";

export interface ShapeGroup {
  readonly signature: string;
  readonly sites: readonly string[];
  readonly files: number;
}

const MAX_DEPTH = 3;
const MIN_NODES = 3;
const SHAPE_MIN_FILES = 3;

function signatureOf(node: ts.JsxElement | ts.JsxSelfClosingElement, depth: number): { readonly text: string; readonly raw: number } | null {
  const tag = (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText();
  if (!/^[a-z]/u.test(tag)) {
    return { text: "C", raw: 0 };
  }
  if (ts.isJsxSelfClosingElement(node) || depth >= MAX_DEPTH) {
    return { text: tag, raw: 1 };
  }
  const kids = node.children.flatMap((child) => (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) ? [signatureOf(child, depth + 1)] : []));
  const parts = kids.flatMap((kid) => (kid === null ? [] : [kid]));
  return { text: parts.length === 0 ? tag : `${tag}(${parts.map((part) => part.text).join(",")})`, raw: 1 + parts.reduce((sum, part) => sum + part.raw, 0) };
}

export function findShapes(all: readonly FileFacts[]): readonly ShapeGroup[] {
  const bySignature = new Map<string, string[]>();
  for (const facts of all) {
    const sf = facts.source.sf;
    if (sf === null || facts.source.layer !== "client") {
      continue;
    }
    for (const elem of facts.elems) {
      const signature = elem.kind === "raw" ? signatureOf(elem.element, 0) : null;
      if (signature !== null && signature.raw >= MIN_NODES && signature.text.includes("(") && !/^div\((?:div,?)+\)$/u.test(signature.text)) {
        bySignature.set(signature.text, [...(bySignature.get(signature.text) ?? []), `${facts.source.path}:${lineOf(sf, elem.opening)}`]);
      }
    }
  }
  return [...bySignature.entries()]
    .map(([signature, sites]) => ({ signature, sites, files: new Set(sites.map((site) => site.split(":")[0])).size }))
    .filter((group) => group.files >= SHAPE_MIN_FILES)
    .sort((a, b) => b.files - a.files);
}
