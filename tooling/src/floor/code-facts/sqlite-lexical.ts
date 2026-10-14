// One lexical home for SQLite source facts. Unknown bytes and unfinished regions remain observations, never clean omissions.
import type { SqliteLexical, SqliteToken, SqliteTokenKind } from "./sqlite-lexical-contract.ts";

function quotedEnd(text: string, start: number, close: string): number | undefined {
  let end: number | undefined;
  for (let index = start + 1; index < text.length && end === undefined; index += 1) {
    if (text[index] === close) {
      if (text[index + 1] !== close) {
        end = index + 1;
      } else {
        index += 1;
      }
    }
  }
  return end;
}

function holeEnd(text: string, start: number): number | undefined {
  if (text[start] === "«") {
    const close = text.indexOf("»", start + 1);
    return close < 0 ? undefined : close + 1;
  }
  let depth = 1;
  let end: number | undefined;
  for (let index = start + 2; index < text.length && end === undefined; index += 1) {
    if (text[index] === "{") {
      depth += 1;
    }
    if (text[index] === "}" && --depth === 0) {
      end = index + 1;
    }
  }
  return end;
}

interface LexicalStep {
  readonly kind: SqliteTokenKind;
  readonly end: number;
  readonly complete: boolean;
}

function quotedRegion(text: string, start: number, char: string): LexicalStep {
  const close = quotedEnd(text, start, char === "[" ? "]" : char);
  return { kind: char === "'" ? "string" : "quoted-identifier", end: close ?? text.length, complete: close !== undefined };
}

function regionAt(text: string, start: number): LexicalStep | undefined {
  const char = text[start] ?? "";
  if (char === "'" || char === '"' || char === "`" || char === "[") {
    return quotedRegion(text, start, char);
  }
  if (text.startsWith("--", start)) {
    const newline = text.indexOf("\n", start + 2);
    return { kind: "comment", end: newline < 0 ? text.length : newline + 1, complete: true };
  }
  if (text.startsWith("/*", start)) {
    const close = text.indexOf("*/", start + 2);
    return { kind: "comment", end: close < 0 ? text.length : close + 2, complete: close >= 0 };
  }
  const hole = char === "«" || text.startsWith("${", start);
  const close = hole ? holeEnd(text, start) : undefined;
  return hole ? { kind: "hole", end: close ?? text.length, complete: close !== undefined } : undefined;
}

function tokenAt(text: string, start: number): LexicalStep {
  const region = regionAt(text, start);
  if (region !== undefined) {
    return region;
  }
  const tail = text.slice(start);
  const word = /^[A-Za-z_][A-Za-z0-9_]*/u.exec(tail)?.[0];
  if (word !== undefined) {
    return { kind: "word", end: start + word.length, complete: true };
  }
  const number = /^(?:0x[\da-f]+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)/iu.exec(tail)?.[0];
  if (number !== undefined) {
    return { kind: "number", end: start + number.length, complete: true };
  }
  const char = text[start] ?? "";
  let kind: SqliteTokenKind = "other";
  if ("(),.;?".includes(char)) {
    kind = "punct";
  } else if ("=<>!+-*/%|&~".includes(char)) {
    kind = "operator";
  }
  return { kind, end: start + 1, complete: kind !== "other" };
}

/** Retain every non-whitespace byte, including comments, interpolation holes and unknown punctuation. */
export function readSqliteLexical(text: string): SqliteLexical {
  const tokens: SqliteToken[] = [];
  let complete = true;
  let index = 0;
  while (index < text.length) {
    const start = index;
    const char = text[index] ?? "";
    if (/[ \t\n\r\f\v]/u.test(char)) {
      index += 1;
      continue;
    }
    const { kind, end, complete: covered } = tokenAt(text, start);
    complete &&= covered;
    tokens.push({ kind, text: text.slice(start, end), start, end });
    index = end;
  }
  return { tokens, complete };
}

/** Whether the fragment can remain one operand when Drizzle joins it without per-child parentheses.
 * This is containment, not a SQL grammar or an authorization proof. */
export function sqliteFragmentContained(text: string): boolean {
  const lexical = readSqliteLexical(text);
  if (!lexical.complete || lexical.tokens.length === 0) {
    return false;
  }
  let depth = 0;
  for (const token of lexical.tokens) {
    if (token.kind === "comment" || token.kind === "other" || token.text === ";") {
      return false;
    }
    if (token.text === "(") {
      depth += 1;
    }
    if (token.text === ")" && --depth < 0) {
      return false;
    }
    if (depth === 0 && token.kind === "word" && /^(?:or|union|intersect|except|returning)$/iu.test(token.text)) {
      return false;
    }
  }
  return depth === 0;
}
