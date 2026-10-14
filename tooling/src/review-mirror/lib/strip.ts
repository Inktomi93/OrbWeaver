// Comment stripping preserves line count and parses TS-like files before removing trivia; raw regex stripping
// would corrupt regex literals, JSX and template strings and make the supposedly code-only mirror lie.
import { extname } from "node:path";
import { ts } from "ts-morph";

const HASH_LINE_RE = /^\s*#/u;
// PRESERVED comments — suppression/directive markers are load-bearing (they change tooling behavior AND tell
// a reviewer a line was deliberately exempted): a stripped-of-everything mirror hides exactly the
// gate-suppression ownership a reviewer needs (#1496 — e.g. `@orb-waive caught-failure-ownership`
// annotations were invisible here even though the review round exists to check them). Covers lint/type
// suppressions AND this repo's own gate escape grammar: `// terse-ok:`, `// test-exempt`, `seated-exempt`,
// the `@*-ok`/`@*-exempt` family, and `@orb-*`/`@instrument-*`/`@ds-*` annotations, plus SAFE:.
const DIRECTIVE_RE =
  /\b(biome-ignore|eslint-(disable|enable)|prettier-ignore|v8 ignore|c8 ignore|istanbul ignore|knip)\b|@(ts-expect-error|ts-ignore|ts-nocheck|public|alias|internal|deprecated|dsCard)\b|[\w-]+-(ok|exempt|allow)\b|@ds-[\w-]+|@orb-[\w-]+|@instrument-[\w-]+|\bSAFE:/iu;
const TS_LIKE: Readonly<Record<string, ts.ScriptKind>> = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".js": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".json": ts.ScriptKind.JSON,
};

function stripTsLike(text: string, scriptKind: ts.ScriptKind): string {
  const source = ts.createSourceFile("review-mirror", text, ts.ScriptTarget.Latest, true, scriptKind);
  const ranges: [start: number, end: number][] = [];
  const push = (found: readonly ts.CommentRange[] | undefined): void => {
    for (const range of found ?? []) {
      ranges.push([range.pos, range.end]);
    }
  };
  const visit = (node: ts.Node): void => {
    push(ts.getLeadingCommentRanges(text, node.pos));
    push(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(source)) {
      visit(child);
    }
  };
  visit(source);
  const seen = new Set<string>();
  const unique = ranges
    .filter(([start, end]) => {
      const key = `${start.toString()}:${end.toString()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort(([left], [right]) => left - right);
  let output = "";
  let cursor = 0;
  for (const [start, end] of unique) {
    if (start < cursor) {
      continue;
    }
    output += text.slice(cursor, start);
    const span = text.slice(start, end);
    output += DIRECTIVE_RE.test(span) ? span : ` ${"\n".repeat(span.split(/\r?\n/u).length - 1)}`;
    cursor = end;
  }
  return output + text.slice(cursor);
}

function cssQuotedEnd(source: string, start: number): number {
  const quote = source[start];
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === quote) {
      return index + 1;
    }
  }
  return source.length;
}

function sqlQuotedEnd(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] !== "'") {
      index += 1;
      continue;
    }
    if (source[index + 1] === "'") {
      index += 2;
      continue;
    }
    return index + 1;
  }
  return source.length;
}

function blockCommentEnd(source: string, start: number): number {
  const end = source.indexOf("*/", start + 2);
  return end === -1 ? source.length : end + 2;
}

function newlineHoles(span: string): string {
  return "\n".repeat(span.split("\n").length - 1);
}

function stripCss(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const current = source[index] ?? "";
    if (current === '"' || current === "'") {
      const end = cssQuotedEnd(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }
    if (current === "/" && source[index + 1] === "*") {
      const end = blockCommentEnd(source, index);
      const span = source.slice(index, end);
      output += DIRECTIVE_RE.test(span) ? span : ` ${newlineHoles(span)}`;
      index = end;
      continue;
    }
    output += current;
    index += 1;
  }
  return output;
}

function stripHtml(source: string): string {
  return source.replaceAll(/<!--[\s\S]*?-->/gu, (comment) => "\n".repeat(comment.split(/\r?\n/u).length - 1));
}

function stripSql(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const current = source[index] ?? "";
    if (current === "'") {
      const end = sqlQuotedEnd(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }
    if (current === "-" && source[index + 1] === "-") {
      const end = source.indexOf("\n", index + 2);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (current === "/" && source[index + 1] === "*") {
      const end = blockCommentEnd(source, index);
      output += newlineHoles(source.slice(index, end));
      index = end;
      continue;
    }
    output += current;
    index += 1;
  }
  return output;
}

function stripHashFullLine(source: string): string {
  return source
    .split(/\r?\n/u)
    .map((line, index) => {
      if (index === 0 && line.startsWith("#!")) {
        return line;
      }
      return HASH_LINE_RE.test(line) ? "" : line;
    })
    .join("\n");
}

function tidy(source: string): string {
  // Keep blank lines: evidence points back to the authored tree by line number, so compacting comment holes
  // would make an otherwise complete mirror operationally misleading.
  return source.replaceAll(/[ \t]+$/gmu, "");
}

type CommentStripper = (source: string) => string;

export function stripperFor(path: string): CommentStripper | null {
  const extension = extname(path).toLowerCase();
  const base = path.toLowerCase().split("/").at(-1);
  const scriptKind = TS_LIKE[extension];
  if (scriptKind !== undefined) {
    return (source) => stripTsLike(source, scriptKind);
  }
  if (extension === ".css" || extension === ".scss") {
    return stripCss;
  }
  if (extension === ".html" || extension === ".htm") {
    return stripHtml;
  }
  if (extension === ".sql") {
    return stripSql;
  }
  if ([".yml", ".yaml", ".toml", ".sh", ".bash"].includes(extension) || base === "dockerfile") {
    return stripHashFullLine;
  }
  return null;
}

export function stripComments(path: string, source: string): string {
  const strip = stripperFor(path);
  return strip === null ? source : tidy(strip(source));
}
