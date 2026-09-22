interface SqlToken {
  readonly kind: "word" | "punct";
  readonly text: string;
}

interface SqlTokenStep {
  readonly next: number;
  readonly token?: SqlToken;
}

function skipTemplateExpression(text: string, start: number): number {
  let depth = 1;
  let index = start + 2;
  while (index < text.length && depth > 0) {
    if (text[index] === "{") {
      depth += 1;
    } else if (text[index] === "}") {
      depth -= 1;
    }
    index += 1;
  }
  return index;
}

function skipQuoted(text: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] !== quote) {
      index += 1;
    } else if (text[index + 1] === quote) {
      index += 2;
    } else {
      return index + 1;
    }
  }
  return index;
}

function skippedSqlRegionEnd(text: string, index: number): number | undefined {
  const char = text[index];
  const next = text[index + 1];
  if (char === "$" && next === "{") {
    return skipTemplateExpression(text, index);
  }
  if (char === "-" && next === "-") {
    const newline = text.indexOf("\n", index + 2);
    return newline < 0 ? text.length : newline + 1;
  }
  if (char === "/" && next === "*") {
    const close = text.indexOf("*/", index + 2);
    return close < 0 ? text.length : close + 2;
  }
  return char === "'" ? skipQuoted(text, index, char) : undefined;
}

function nextSqlToken(text: string, index: number): SqlTokenStep {
  const skipped = skippedSqlRegionEnd(text, index);
  if (skipped !== undefined) {
    return { next: skipped };
  }
  const char = text[index];
  if (char === '"') {
    const end = skipQuoted(text, index, char);
    return { next: end, token: { kind: "word", text: text.slice(index + 1, Math.max(index + 1, end - 1)).replaceAll('""', '"') } };
  }
  if (char !== undefined && /[A-Za-z_]/u.test(char)) {
    let end = index + 1;
    while (end < text.length && /[A-Za-z0-9_]/u.test(text[end] ?? "")) {
      end += 1;
    }
    return { next: end, token: { kind: "word", text: text.slice(index, end) } };
  }
  return char === "(" || char === ")" || char === "," ? { next: index + 1, token: { kind: "punct", text: char } } : { next: index + 1 };
}

function sqlTokens(text: string): SqlToken[] {
  const out: SqlToken[] = [];
  let index = 0;
  while (index < text.length) {
    const step = nextSqlToken(text, index);
    if (step.token !== undefined) {
      out.push(step.token);
    }
    index = step.next;
  }
  return out;
}

function rawInsertColumnsAt(tokens: readonly SqlToken[], start: number): readonly string[] | undefined {
  const columns: string[] = [];
  let cursor = start;
  let expectWord = true;
  while (cursor < tokens.length && tokens[cursor]?.text !== ")") {
    const token = tokens[cursor];
    if (token === undefined || (expectWord ? token.kind !== "word" : token.text !== ",")) {
      return;
    }
    if (expectWord) {
      columns.push(token.text);
    }
    expectWord = !expectWord;
    cursor += 1;
  }
  return columns.length > 0 && !expectWord && tokens[cursor]?.text === ")" ? columns : undefined;
}

function rawInsertHeaderAt(tokens: readonly SqlToken[], start: number): { table: string; columns: readonly string[] } | undefined {
  const tableOffset = 1;
  const openingParenOffset = 2;
  const firstColumnOffset = 3;
  let cursor = start + 1;
  if (tokens[cursor]?.text.toLowerCase() === "or") {
    cursor += 2;
  }
  if (tokens[cursor]?.text.toLowerCase() !== "into" || tokens[cursor + tableOffset]?.kind !== "word") {
    return;
  }
  const table = tokens[cursor + tableOffset]?.text;
  if (table === undefined) {
    return;
  }
  if (tokens[cursor + openingParenOffset]?.text !== "(") {
    return { table, columns: [] };
  }
  const columns = rawInsertColumnsAt(tokens, cursor + firstColumnOffset);
  return columns === undefined ? undefined : { table, columns };
}

/** Parse static `INSERT [OR …] INTO table (column, …)` headers from executable SQL text. */
export function rawInsertHeaders(text: string): readonly { table: string; columns: readonly string[] }[] {
  const tokens = sqlTokens(text);
  const out: { table: string; columns: readonly string[] }[] = [];
  for (let start = 0; start < tokens.length; start += 1) {
    if (tokens[start]?.kind === "word" && tokens[start]?.text.toLowerCase() === "insert") {
      const header = rawInsertHeaderAt(tokens, start);
      if (header !== undefined) {
        out.push(header);
      }
    }
  }
  return out;
}
