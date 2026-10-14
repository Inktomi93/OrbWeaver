import { readSqliteLexical } from "./sqlite-lexical.ts";

interface SqlToken {
  readonly kind: "word" | "punct";
  readonly text: string;
}

function sqlTokens(text: string): SqlToken[] {
  const body = text.startsWith("`") && text.endsWith("`") ? text.slice(1, -1) : text;
  return readSqliteLexical(body).tokens.flatMap((token): SqlToken[] => {
    if (token.kind === "word") {
      return [{ kind: "word", text: token.text }];
    }
    if (token.kind === "quoted-identifier") {
      return token.text.startsWith('"') ? [{ kind: "word", text: token.text.slice(1, -1).replaceAll('""', '"') }] : sqlTokens(token.text.slice(1, -1));
    }
    return "(),".includes(token.text) ? [{ kind: "punct", text: token.text }] : [];
  });
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
