// The gap-scanning comment walk is byte-identical to the token walk it replaced, on the shapes that broke it.
import type { SourceFile } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";
import { blankTsComments, forEachCommentRange } from "../../../../tooling/src/verify/lib/comment-spans.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// Every carrier shape the 2026-09-06 whole-corpus differential exercised, in one file: same-line comments
// after a comma (a TRAILING range of the comma token and nothing else), comments before `)` / `}` / EOF, an
// empty `{ /* */ }` literal, an empty JSX expression, and comment SPELLINGS inside a template literal, a
// string and a JSX attribute that are not comments at all. No trailing newline on purpose: the EOF comment
// must reach the walk as the EndOfFileToken's leading range.
const SOURCE = `/** JSDoc on the first declaration. */
export const table = {
  a: [], // same-line after a comma
  b: 1 /* after a value, before the comma */,
  c: {}, /* block after a comma */
  d: { /* only a comment between the braces */ },
};
export function call(x: number, y: number): number {
  return Math.max(x /* before the comma */, y /* before the close paren */);
}
if (table.b) {
  call(1, 2);
} /* between the block and else */ else {
  call(2, 1);
}
export const tpl = \`not /* a comment */ and not // one either \${table.b}/*/still not*/\`;
export const str = "// not a comment";
export const el = (
  <div>
    {/* an empty JSX expression carrying a block comment */}
    <span title="/* not a comment */">text</span>
  </div>
);
// trailing line comment at EOF without a newline`;

function parse(source: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
  return project.createSourceFile("/repo/packages/sample/src/probe.tsx", source);
}

/** The retired walk, verbatim: every node AND every `getChildren()` token, leading at pos + trailing at end. */
function legacyRanges(sf: SourceFile): readonly string[] {
  const root = sf.compilerNode;
  const text = root.text;
  const out = new Set<string>();
  const walk = (node: ts.Node): void => {
    for (const range of [...(ts.getLeadingCommentRanges(text, node.pos) ?? []), ...(ts.getTrailingCommentRanges(text, node.end) ?? [])]) {
      out.add(`${range.pos}:${range.end}`);
    }
    for (const child of node.getChildren(root)) {
      walk(child);
    }
  };
  walk(root);
  return [...out].toSorted((left, right) => left.localeCompare(right));
}

function rangeOf(source: string, comment: string): string {
  const pos = source.indexOf(comment);
  if (pos === -1) {
    throw new Error(`fixture comment ${JSON.stringify(comment)} is absent`);
  }
  return `${pos}:${pos + comment.length}`;
}

test("the gap scanner reports exactly the ranges the token walk reported, carrier-attributed to the gap's owner", () => {
  const sf = parse(SOURCE);
  const carriers = new Map<string, Set<ts.SyntaxKind>>();
  const ranges = new Set<string>();
  forEachCommentRange(sf, (range, carrier) => {
    const key = `${range.pos}:${range.end}`;
    ranges.add(key);
    (carriers.get(key) ?? carriers.set(key, new Set()).get(key))?.add(carrier.kind);
  });
  expect([...ranges].toSorted((left, right) => left.localeCompare(right))).toEqual(legacyRanges(sf));

  const found = [
    "/** JSDoc on the first declaration. */",
    "// same-line after a comma",
    "/* after a value, before the comma */",
    "/* block after a comma */",
    "/* only a comment between the braces */",
    "/* before the comma */",
    "/* before the close paren */",
    "/* between the block and else */",
    "/* an empty JSX expression carrying a block comment */",
    "// trailing line comment at EOF without a newline",
  ];
  for (const comment of found) {
    expect(ranges.has(rangeOf(SOURCE, comment)), comment).toBe(true);
  }
  expect(ranges.size).toBe(found.length);
  for (const spelling of ["/* a comment */", "// one either", "/*/still not*/", "// not a comment", "/* not a comment */"]) {
    expect(ranges.has(rangeOf(SOURCE, spelling)), spelling).toBe(false);
  }

  // Carrier semantics are the token walk's, exactly: a same-line comment is the TRAILING range of whatever
  // precedes it and nothing else (TypeScript's leading reader skips same-line comments, so the token AFTER
  // it never carries it). When that predecessor is a node, the node carries it; when it is a gap token —
  // a comma, an opening brace — the owner of that gap does, which is the token's `parent` under the old walk.
  const carrierKinds = (comment: string): readonly string[] =>
    [...(carriers.get(rangeOf(SOURCE, comment)) ?? [])].map((kind) => SyntaxKind[kind]).toSorted((left, right) => left.localeCompare(right));
  expect(carrierKinds("// same-line after a comma")).toEqual(["ObjectLiteralExpression"]);
  expect(carrierKinds("/* block after a comma */")).toEqual(["ObjectLiteralExpression"]);
  expect(carrierKinds("/* only a comment between the braces */")).toEqual(["ObjectLiteralExpression"]);
  expect(carrierKinds("/* before the close paren */")).toEqual(["Identifier"]);
  expect(carrierKinds("/* between the block and else */")).toEqual(["Block"]);
  expect(carrierKinds("/* an empty JSX expression carrying a block comment */")).toEqual(["JsxExpression"]);
  expect(carrierKinds("// trailing line comment at EOF without a newline")).toEqual(["EndOfFileToken"]);
});

test("blanking rides the same walk: comment text becomes spaces, code and every newline survive", () => {
  const sf = parse(SOURCE);
  const blanked = blankTsComments(sf);
  expect(blanked.length).toBe(SOURCE.length);
  expect([...blanked].flatMap((char, index) => (char === "\n" ? [index] : []))).toEqual([...SOURCE].flatMap((char, index) => (char === "\n" ? [index] : [])));
  expect(blanked.includes("same-line after a comma")).toBe(false);
  expect(blanked.includes("before the close paren")).toBe(false);
  expect(blanked.includes("trailing line comment at EOF")).toBe(false);
  expect(blanked.includes("not /* a comment */ and not // one either")).toBe(true);
  expect(blanked.includes('"// not a comment"')).toBe(true);
  expect(blanked.includes('title="/* not a comment */"')).toBe(true);
});
