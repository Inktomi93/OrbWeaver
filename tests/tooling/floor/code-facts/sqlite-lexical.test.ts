// @subject tooling/src/floor/code-facts/sqlite-lexical.ts
// @subject tooling/src/floor/code-facts/sql-alias-bindings.ts
// @subject tooling/src/floor/code-facts/sql-insert-header.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { sqlAliasBindings } from "@orb/tooling/floor/code-facts/sql-alias-bindings";
import { rawInsertHeaders } from "@orb/tooling/floor/code-facts/sql-insert-header";
import { readSqliteLexical, sqliteFragmentContained } from "@orb/tooling/floor/code-facts/sqlite-lexical";

test("numeric signs do not consume adjacent operators or comments", () => {
  expect(readSqliteLexical("1-- note")).toEqual({
    complete: true,
    tokens: [
      { kind: "number", text: "1", start: 0, end: 1 },
      { kind: "comment", text: "-- note", start: 1, end: 8 },
    ],
  });
  for (const text of ["1-- note", "1e-2-- note", "0xff-- note", ".5/* note */"]) {
    expect(sqliteFragmentContained(text), text).toBe(false);
  }
  const text = "1e-2+3.5E+4-0xff+.5";
  expect(readSqliteLexical(text).tokens.map(({ kind, text: tokenText, start, end }) => [kind, tokenText, start, end])).toEqual([
    ["number", "1e-2", 0, 4],
    ["operator", "+", 4, 5],
    ["number", "3.5E+4", 5, 11],
    ["operator", "-", 11, 12],
    ["number", "0xff", 12, 16],
    ["operator", "+", 16, 17],
    ["number", ".5", 17, 19],
  ]);
  expect(sqliteFragmentContained(text)).toBe(true);
});

test("containment observes every byte and rejects widening or unfinished fragments", () => {
  for (const text of [
    "a OR b",
    "a /* OR b */",
    "a -- OR b",
    "a; SELECT b",
    "(a) UNION SELECT b",
    "(a",
    "a)",
    "'unfinished",
    '"unfinished',
    "[unfinished",
    "`unfinished",
    "a @ b",
    "a «unfinished",
  ]) {
    expect(sqliteFragmentContained(text), text).toBe(false);
  }
  for (const text of [
    "lower(«0») LIKE «1» ESCAPE '\\'",
    "(a OR b)",
    "EXISTS (SELECT 1 FROM json_each(«0») WHERE value = «1»)",
    "coalesce(«0», 0) > «1»",
    "'OR /* ; )' = «0»",
    '"OR" = «0»',
    "`OR` = «0»",
    "[OR] = «0»",
  ]) {
    expect(sqliteFragmentContained(text), text).toBe(true);
  }
  const input = " a /* comment */ @ 'closed' «0» ";
  const fact = readSqliteLexical(input);
  expect(fact.complete).toBe(false);
  expect(fact.tokens.map((token) => input.slice(token.start, token.end))).toEqual(["a", "/* comment */", "@", "'closed'", "«0»"]);
  expect(fact.tokens.map(({ kind }) => kind)).toEqual(["word", "comment", "other", "string", "hole"]);
});

test("existing INSERT and relation consumers keep their deliberately projected token semantics", () => {
  expect(rawInsertHeaders('INSERT OR IGNORE INTO "owned_rows" (id, ownerId) VALUES (${id}, ${ownerId});')).toEqual([
    { table: "owned_rows", columns: ["id", "ownerId"] },
  ]);
  expect(rawInsertHeaders("`INSERT INTO rows (id) VALUES (${id})`")).toEqual([{ table: "rows", columns: ["id"] }]);
  expect(rawInsertHeaders("INSERT INTO [complex name] (id) VALUES (1)")).toEqual([{ table: "complex", columns: [] }]);
  expect(rawInsertHeaders("/* INSERT INTO decoy (id) */ INSERT INTO rows (id) VALUES ('INSERT INTO hidden (x)')")).toEqual([
    { table: "rows", columns: ["id"] },
  ]);
  const query = "SELECT t.content FROM documents t WHERE t.id = «id»";
  expect(sqlAliasBindings(query).tableOf("t", "content", query.indexOf("t.content"))).toBe("documents");
});
