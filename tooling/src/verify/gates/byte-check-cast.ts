// Gate: byte-check-cast — a schema `check(...)` CHECK-DDL SQL string whose CAP is a `length(<col>) <= N`
// against a BYTE-named constant (a `*_BYTE`/`*_BYTES` identifier) is wrong by up to 4x: SQLite's `length()`
// on a TEXT column counts CODE POINTS, not bytes, so the correct spelling casts first —
// `length(cast(<col> as blob)) <= N` (`automation.ts:204`'s exemplar, cited in every finding). A
// character-intent cap (`length(name) <= 80`, no BYTE-named constant) is legitimate and stays silent — the
// gate flags ONLY when byte-intent is EVIDENT from the compared constant's own name (#642).
//
// COMMENT POSTURE: comment-SAFE. The scan reads the SQL string from the AST `check(...)` call's second
// argument (a template-literal node), never `sf.getFullText()` — a real TS `//` comment cannot appear
// inside a template-literal node's own text, so there is nothing here for a comment to hide behind.
//
// DECLARED LIMIT: byte-intent detection is NAME-ONLY (`*_BYTE`/`*_BYTES` on the compared constant). The
// issue also floats a KiB/MiB-COMMENT fallback for a cap whose constant name does not say BYTES; every
// live byte cap on the tree today (plugin.ts, automation.ts) already names its constant `*_MAX_BYTES`, so
// that fallback has zero real cases to prove itself against — implementing it now would be an unproven
// arm. `mustPass` records the limit explicitly rather than silently narrowing it.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";

const CHECK_FN = "check";
const SQL_RAW = "sql.raw";
const BYTES_NAME_RE = /BYTES?$/iu;
// Group 1: either `cast(<ident> as blob)` (already correct) or a bare `<ident>` (the byte-cap defect
// shape when group 2 is BYTE-named). Group 2: the constant compared against, textually — the interpolated
// `${IDENT}` inside the template, not its evaluated runtime value (this gate never evaluates the cap).
const LENGTH_CAP_RE = /length\(\s*(cast\(\s*[A-Za-z0-9_]+\s+as\s+blob\s*\)|[A-Za-z0-9_]+)\s*\)\s*<=\s*\$\{\s*([A-Za-z0-9_]+)\s*\}/giu;
// The `$` char code — used to compose `${...}` in a built fixture WITHOUT ever spelling the literal
// sequence in this file's own source (biome's noTemplateCurlyInString reads any `${` in a string as an
// author's mistaken template-literal, which this genuinely is not).
const DOLLAR_CHAR_CODE = 36;
// The conformance fixtures' cap values — the exact 64 KiB byte cap / 128-char cap this gate's real-tree
// exemplars use (plugin.ts, automation.ts), so a fixture reads as the founding shape, not an arbitrary number.
const FIXTURE_BYTE_CAP = 65_536;
const FIXTURE_CHAR_CAP = 128;

function templateRawText(node: Node): string | undefined {
  return Node.isNoSubstitutionTemplateLiteral(node) || Node.isTemplateExpression(node) ? node.getText() : undefined;
}

// Builds a conformance fixture's schema source. `capExpr` is the length() cap ("value" / "cast(value as
// blob)"); `constName` is the compared constant's name — kept as PARAMETERS (never a literal `${…}` in
// this file's own source) so biome's noTemplateCurlyInString stays silent for a genuine reason, not a
// suppression.
function fixtureSource(capExpr: string, constName: string, constValue: number): string {
  const dollar = String.fromCharCode(DOLLAR_CHAR_CODE);
  return (
    'import { sql } from "drizzle-orm";\n' +
    'import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
    `const ${constName} = ${constValue};\n` +
    'export const t = sqliteTable("t", { value: text("value") }, () => [\n' +
    `  check("t_value_check", sql.raw(\`length(${capExpr}) <= ${dollar}{${constName}}\`)),\n` +
    "]);\n"
  );
}

/** The SQL template text of a `check("name", sql.raw(\`...\`))` call, or undefined if this call isn't
 *  that shape (a `check()` with a different second-arg form — e.g. the `type in (...)` list-check callers
 *  that pass a precomputed string — never RESOLVES a length() cap and is correctly out of reach). */
function checkSqlTemplate(call: Node): string | undefined {
  if (!Node.isCallExpression(call) || call.getExpression().getText() !== CHECK_FN) {
    return;
  }
  const [, sqlArg] = call.getArguments();
  if (sqlArg === undefined || !Node.isCallExpression(sqlArg) || sqlArg.getExpression().getText() !== SQL_RAW) {
    return;
  }
  const [template] = sqlArg.getArguments();
  return template === undefined ? undefined : templateRawText(template);
}

export const gate: GateDescriptor = {
  name: "byte-check-cast",
  docRow: "Tier-1-DB.md (byte-vs-character CHECK caps, #642)",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a schema CHECK's `length(<col>) <= <N>` caps a column by BYTE-named constant, but SQLite `length()` on TEXT counts CODE POINTS, not bytes — a '64 KiB' cap silently admits up to 4x its stated limit of UTF-8. Cast to BLOB first: `length(cast(<col> as blob)) <= <N>` (see `packages/db/src/schema/automation.ts:204` for the correct, already-commented exemplar).",
  fix: "wrap the column in `cast(<col> as blob)` inside the CHECK's length() call — `length(cast(value as blob)) <= VALUE_MAX_BYTES`.",
  scanRoot: (p) => p.startsWith("packages/db/src/schema/"),
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    const sql = checkSqlTemplate(node);
    if (sql === undefined) {
      return;
    }
    for (const match of sql.matchAll(LENGTH_CAP_RE)) {
      const capExpr = match[1] ?? "";
      const constantName = match[2] ?? "";
      if (capExpr.startsWith("cast(")) {
        continue; // already the correct byte-safe spelling
      }
      if (!BYTES_NAME_RE.test(constantName)) {
        continue; // a character-intent cap (no BYTE-named constant) — legitimate, stays silent
      }
      ctx.report(node, { token: `length(${capExpr})`, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: fixtureSource("value", "KV_VALUE_MAX_BYTES", FIXTURE_BYTE_CAP),
      at: "packages/db/src/schema/x.ts",
      expect: { messageIncludes: "Cast to BLOB" },
      why: "the exact plugin.ts:96 defect shape — a *_MAX_BYTES cap over a bare length(value), no cast — 4x-admits its stated byte limit (#642, #628(b))",
    },
  ],
  mustPass: [
    {
      files: fixtureSource("cast(value as blob)", "KV_VALUE_MAX_BYTES", FIXTURE_BYTE_CAP),
      at: "packages/db/src/schema/y.ts",
      why: "the automation.ts:204 exemplar — the SAME byte cap, correctly cast to blob first — passes",
    },
    {
      files: fixtureSource("value", "KV_VALUE_MAX_CHARS", FIXTURE_CHAR_CAP),
      at: "packages/db/src/schema/z.ts",
      why: "a CHARACTER-intent cap (the compared constant is *_MAX_CHARS, not *_BYTES) over a bare length() — legitimate, no cast needed, passes (plugin.ts:95 / automation.ts:113's real shape)",
    },
    {
      files:
        'import { sql } from "drizzle-orm";\nimport { check, sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", { kind: text("kind") }, () => [\n  check("t_kind_check", sql.raw(`kind in (\'a\',\'b\')`)),\n]);\n',
      at: "packages/db/src/schema/w.ts",
      why: "a check() whose SQL is not a length() cap at all (an `in (...)` list-check, the notifications.ts:73 shape) — nothing to match, passes",
    },
  ],
};
