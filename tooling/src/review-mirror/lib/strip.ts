// Comment stripping preserves line count and parses TS-like files before removing trivia; raw regex stripping
// would corrupt regex literals, JSX and template strings and make the supposedly code-only mirror lie.
import { extname } from "node:path";
import { ts } from "ts-morph";

const HASH_LINE_RE = /^\s*#/u;
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
    output += ` ${"\n".repeat(text.slice(start, end).split("\n").length - 1)}`;
    cursor = end;
  }
  return output + text.slice(cursor);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a quote-aware comment scanner is branchy by nature.
function stripCss(source: string): string {
  let output = "";
  let index = 0;
  let quote: string | null = null;
  while (index < source.length) {
    const current = source[index] ?? "";
    const next = source[index + 1];
    if (quote !== null) {
      output += current;
      if (current === "\\") {
        output += next ?? "";
        index += 2;
        continue;
      }
      if (current === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }
    if (current === '"' || current === "'") {
      quote = current;
      output += current;
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      let end = index + 2;
      let newlines = "";
      while (end < source.length && !(source[end] === "*" && source[end + 1] === "/")) {
        if (source[end] === "\n") {
          newlines += "\n";
        }
        end += 1;
      }
      output += ` ${newlines}`;
      index = end + 2;
      continue;
    }
    output += current;
    index += 1;
  }
  return output;
}

function stripHtml(source: string): string {
  return source.replaceAll(/<!--[\s\S]*?-->/gu, (comment) => "\n".repeat(comment.split("\n").length - 1));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a SQL-quote-aware comment scanner is branchy by nature.
function stripSql(source: string): string {
  let output = "";
  let index = 0;
  let quoted = false;
  while (index < source.length) {
    const current = source[index] ?? "";
    const next = source[index + 1];
    if (quoted) {
      output += current;
      if (current === "'") {
        if (next === "'") {
          output += next;
          index += 2;
          continue;
        }
        quoted = false;
      }
      index += 1;
      continue;
    }
    if (current === "'") {
      quoted = true;
      output += current;
      index += 1;
      continue;
    }
    if (current === "-" && next === "-") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      continue;
    }
    if (current === "/" && next === "*") {
      let end = index + 2;
      while (end < source.length && !(source[end] === "*" && source[end + 1] === "/")) {
        if (source[end] === "\n") {
          output += "\n";
        }
        end += 1;
      }
      index = end + 2;
      continue;
    }
    output += current;
    index += 1;
  }
  return output;
}

function stripHashFullLine(source: string): string {
  return source
    .split("\n")
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
