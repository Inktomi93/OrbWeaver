// Tier-1-DB.md (#642) — a schema CHECK whose cap is `length(<col>) <= <BYTE-named const>` is wrong by up to
// 4x: SQLite's `length()` on a TEXT column counts CODE POINTS, not bytes, so a "64 KiB" cap silently admits
// four times its stated limit of UTF-8. The correct spelling casts first. Every read is canonical rather
// than textual: `check` and `sql`/`sql.raw` through the shared module-origin reader (an alias is the same
// builder, a local helper is not), the SQL through the shared template reader (quasis and holes apart, so a
// non-identifier cap is still read), and the capped COLUMN through `drizzleSchemaFact` — which is what
// acquits a cap over a BLOB column, where `length()` already counts bytes. Limits live in mustPass.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { SchemaTable } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { readMemberReference, resolveModuleMemberOrigin } from "../lib/reference-fact.ts";
import { drizzleSchemaFact } from "../lib/schema-fact.ts";
import { originModuleSpecifier } from "../lib/sealed-origin.ts";
import { readTemplateSkeleton } from "../lib/template-static-text.ts";

const DRIZZLE_SQLITE = "drizzle-orm/sqlite-core";
const DRIZZLE_ORM = "drizzle-orm";
const CHECK_EXPORT = "check";
const SQL_EXPORT = "sql";
const RAW_MEMBER = "raw";
/** Byte intent is NAME-ONLY: a `*_BYTE`/`*_BYTES` constant is the tell. */
const BYTES_NAME_RE = /BYTES?$/iu;
/** The quasi immediately BEFORE a hole, when that hole is the cap of a `length(<x>) <=` comparison. The
 *  leading character class keeps `json_array_length(` — a different SQL function — out of the subject. */
const LENGTH_CAP_TAIL_RE = /(?:^|[^A-Za-z0-9_])length\(\s*([^()]*(?:\([^()]*\))?[^()]*?)\s*\)\s*<=\s*$/u;
/** Only a TEXT column has the character-vs-byte gap. `length()` on a BLOB already counts bytes. */
const BYTE_COUNTING_BUILDERS = new Set(["blob"]);
/** Quoted SQL identifiers name the same column as the bare spelling. */
const SQL_QUOTES = /^["'`[]|["'`\]]$/gu;

const MESSAGE =
  "a schema CHECK's `length(<col>) <= <N>` caps a column by a BYTE-named constant, but SQLite `length()` on " +
  "TEXT counts CODE POINTS, not bytes — a '64 KiB' cap silently admits up to 4x its stated limit of UTF-8. " +
  "Cast to BLOB first: `length(cast(<col> as blob)) <= <N>` (Tier-1-DB.md, #642).";

const FIX = "wrap the column in `cast(<col> as blob)` inside the CHECK's length() call — `length(cast(value as blob)) <= VALUE_MAX_BYTES`.";

/** Legacy `scanRoot` was `p.startsWith("packages/db/src/schema/")` — byte-equal to this expression, which is
 *  also `drizzleSchemaFact`'s own population. */
const SCHEMA_POPULATION = { in: ["@db"], under: ["packages/db/src/schema/**"], ext: ["ts", "tsx"] } as const;

/** Is this callee the named Drizzle export? Alias, namespace member and re-export all resolve here; a local
 *  helper of the same name does not. */
function isDrizzleExport(callee: MorphNode, moduleSpecifier: string, exportedName: string): boolean {
  const origin = resolveModuleMemberOrigin(callee);
  if (origin.kind !== "resolved" || originModuleSpecifier(origin.value) !== moduleSpecifier) {
    return false;
  }
  const path = [origin.value.exportedName, ...origin.value.memberPath];
  return path.at(-1) === exportedName;
}

/** The SQL template a `check(name, …)` call carries: `sql.raw(…)`, a `sql` tagged template, or a bare
 *  template argument. Anything else (a precomputed string, a call result) carries no authored SQL. */
function checkSqlTemplate(call: CallExpression): MorphNode | null {
  const sqlArgument = call.getArguments()[1];
  if (sqlArgument === undefined) {
    return null;
  }
  if (Node.isTaggedTemplateExpression(sqlArgument)) {
    return isDrizzleExport(sqlArgument.getTag(), DRIZZLE_ORM, SQL_EXPORT) ? sqlArgument.getTemplate() : null;
  }
  if (Node.isCallExpression(sqlArgument)) {
    const member = readMemberReference(sqlArgument.getExpression());
    if (member.kind !== "resolved" || member.value.name !== RAW_MEMBER || !isDrizzleExport(sqlArgument.getExpression(), DRIZZLE_ORM, RAW_MEMBER)) {
      return null;
    }
    return sqlArgument.getArguments()[0] ?? null;
  }
  return Node.isNoSubstitutionTemplateLiteral(sqlArgument) || Node.isTemplateExpression(sqlArgument) ? sqlArgument : null;
}

/** The authored NAME a cap hole carries: a bare identifier, or the member a dotted/bracket read names. A cap
 *  the reader cannot name carries no byte INTENT, which is the evidence this policy needs. */
function capName(capNode: MorphNode): string | null {
  if (Node.isIdentifier(capNode)) {
    return capNode.getText();
  }
  const member = readMemberReference(capNode);
  return member.kind === "resolved" ? member.value.name : null;
}

/** The nearest enclosing variable declaration — the `export const t = sqliteTable(…)` a CHECK belongs to.
 *  A BOUNDED ancestor walk on the delivered node, never a descendant sweep. */
function enclosingDeclaration(node: MorphNode): MorphNode | null {
  let current: MorphNode | undefined = node.getParent();
  while (current !== undefined && !Node.isSourceFile(current)) {
    if (Node.isVariableDeclaration(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

/** Does `length()` already count BYTES for this column? Only when the schema fact resolves the capped SQL
 *  name to a column whose builder is byte-counting. An unresolved column is fail-closed: the cast defect
 *  does not stop being one because the reader could not name the column. */
function alreadyCountsBytes(table: SchemaTable | null, sqlName: string): boolean {
  const column = table?.columns.find((candidate) => candidate.sqlName === sqlName.replaceAll(SQL_QUOTES, ""));
  return column !== undefined && BYTE_COUNTING_BUILDERS.has(column.builder.exportedName);
}

interface Candidate {
  readonly hole: MorphNode;
  readonly name: string;
  readonly cappedExpression: string;
  readonly declaration: MorphNode | null;
}

// ── conformance fixture builders ───────────────────────────────────────────────────────────────────────
// The `${…}` sequence is composed from its char code rather than spelled, because biome's
// noTemplateCurlyInString reads any `${` inside a STRING as an author's mistaken template literal — which
// these fixture bodies genuinely are not. The legacy module used the same technique for the same reason.
const DOLLAR_CHAR_CODE = 36;
const BACKTICK_CHAR_CODE = 96;
const DOLLAR = String.fromCharCode(DOLLAR_CHAR_CODE);
const TICK = String.fromCharCode(BACKTICK_CHAR_CODE);
const FIXTURE_BYTE_CAP = 65_536;
const FIXTURE_CHAR_CAP = 128;

function hole(expression: string): string {
  return `${DOLLAR}{${expression}}`;
}

function sqlText(capExpression: string, capHole: string): string {
  return `length(${capExpression}) <= ${capHole}`;
}

interface FixtureOptions {
  readonly declarations: string;
  readonly capExpression: string;
  readonly capHole: string;
  readonly builder?: string;
  readonly checkBinding?: string;
  readonly sqlBinding?: string;
  readonly tagged?: boolean;
  readonly waiver?: string;
}

/** One `packages/db/src/schema` fixture: a real Drizzle table whose third argument carries one CHECK. */
function schemaFixture(options: FixtureOptions): string {
  const builder = options.builder ?? "text";
  const checkBinding = options.checkBinding ?? CHECK_EXPORT;
  const sqlBinding = options.sqlBinding ?? SQL_EXPORT;
  const checkImport = checkBinding === CHECK_EXPORT ? CHECK_EXPORT : `${CHECK_EXPORT} as ${checkBinding}`;
  const sqlImport = sqlBinding === SQL_EXPORT ? SQL_EXPORT : `${SQL_EXPORT} as ${sqlBinding}`;
  const body = `${TICK}${sqlText(options.capExpression, options.capHole)}${TICK}`;
  const expression = options.tagged === true ? `${sqlBinding}${body}` : `${sqlBinding}.${RAW_MEMBER}(${body})`;
  return (
    `import { ${sqlImport} } from "${DRIZZLE_ORM}";\n` +
    `import { ${checkImport}, sqliteTable, ${builder} } from "${DRIZZLE_SQLITE}";\n` +
    options.declarations +
    `export const t = sqliteTable("t", { value: ${builder}("value") }, () => [\n` +
    (options.waiver ?? "") +
    `  ${checkBinding}("t_value_check", ${expression}),\n` +
    "]);\n"
  );
}

const BYTE_CONST = `const KV_VALUE_MAX_BYTES = ${FIXTURE_BYTE_CAP};\n`;
const CHAR_CONST = `const KV_VALUE_MAX_CHARS = ${FIXTURE_CHAR_CAP};\n`;
const BYTE_HOLE = hole("KV_VALUE_MAX_BYTES");

export const gate = defineGate({
  id: "byte-check-cast",
  family: "drizzle-schema",
  authority: "ordinary",
  severity: "error",
  population: SCHEMA_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: Candidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (!(Node.isCallExpression(node) && isDrizzleExport(node.getExpression(), DRIZZLE_SQLITE, CHECK_EXPORT))) {
              return;
            }
            const template = checkSqlTemplate(node);
            const skeleton = template === null ? null : readTemplateSkeleton(template);
            if (skeleton === null) {
              return;
            }
            const declaration = enclosingDeclaration(node);
            for (const [index, capHole] of skeleton.holes.entries()) {
              const before = LENGTH_CAP_TAIL_RE.exec(skeleton.quasis[index] ?? "");
              const capped = before?.[1]?.trim();
              const name = capName(capHole);
              if (capped === undefined || capped.startsWith("cast(") || name === null || !BYTES_NAME_RE.test(name)) {
                continue;
              }
              candidates.push({ hole: capHole, name, cappedExpression: capped, declaration });
            }
          },
        },
      ],
      evaluate: () => {
        const fact = ctx.fact(drizzleSchemaFact);
        recordReadySchemaFact(ctx, fact.schema());
        for (const candidate of candidates) {
          const table = candidate.declaration === null ? null : fact.table(candidate.declaration);
          const resolved = table !== null && table.kind === "resolved" ? table.value : null;
          if (alreadyCountsBytes(resolved, candidate.cappedExpression)) {
            continue;
          }
          ctx.report.node(candidate.hole, { token: candidate.name, offset: candidate.hole.getText().indexOf(candidate.name) });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/db/src/schema/x.ts": schemaFixture({ declarations: BYTE_CONST, capExpression: "value", capHole: BYTE_HOLE }) },
      expect: { count: 1, token: "KV_VALUE_MAX_BYTES" },
      why: "the exact `plugin.ts:96` defect shape — a `*_MAX_BYTES` cap over a bare `length(value)` with no cast, 4x-admitting its stated byte limit (#642)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/aliased.ts": schemaFixture({
          declarations: BYTE_CONST,
          capExpression: "value",
          capHole: BYTE_HOLE,
          checkBinding: "constraint",
          sqlBinding: "raw",
        }),
      },
      expect: { count: 1, token: "KV_VALUE_MAX_BYTES" },
      why: "ALIASED `check` and `sql` are the same Drizzle builders — the legacy reader compared `getExpression().getText()` against the literal strings `check` and `sql.raw`, so a single import alias retired the whole gate",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/member-cap.ts": schemaFixture({
          declarations: `const LIMITS = { valueMaxBytes: ${FIXTURE_BYTE_CAP} };\n`,
          capExpression: "value",
          capHole: hole("LIMITS.valueMaxBytes"),
        }),
      },
      expect: { count: 1, token: "valueMaxBytes" },
      why: "A NON-IDENTIFIER CAP — the legacy interpolation capture matched bare identifiers only, so moving the constant onto a limits object made the byte intent invisible",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tagged.ts": schemaFixture({ declarations: BYTE_CONST, capExpression: "value", capHole: BYTE_HOLE, tagged: true }),
      },
      expect: { count: 1, token: "KV_VALUE_MAX_BYTES" },
      why: "the TAGGED-TEMPLATE composition is the same CHECK, and the shape the discovery schema already uses for its other constraints; the legacy reader required the exact `sql.raw` spelling",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/quoted.ts": schemaFixture({ declarations: BYTE_CONST, capExpression: '"value"', capHole: BYTE_HOLE }),
      },
      expect: { count: 1, token: "KV_VALUE_MAX_BYTES" },
      why: "a QUOTED SQL identifier names the same column — the legacy identifier-only capture could not match it, so quoting the column was a silent escape",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/cast.ts": schemaFixture({ declarations: BYTE_CONST, capExpression: "cast(value as blob)", capHole: BYTE_HOLE }),
      },
      why: "the `automation.ts:204` exemplar — the SAME byte cap, correctly cast to blob first, which is exactly what the fix names",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chars.ts": schemaFixture({ declarations: CHAR_CONST, capExpression: "value", capHole: hole("KV_VALUE_MAX_CHARS") }),
      },
      why: "a CHARACTER-intent cap needs no cast — the compared constant's own name is the only byte-intent evidence there is, and `plugin.ts:95` is exactly this shape",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/blob-column.ts": schemaFixture({
          declarations: BYTE_CONST,
          capExpression: "value",
          capHole: BYTE_HOLE,
          builder: "blob",
        }),
      },
      why: "THE SCHEMA FACT'S OWN ARM — `length()` on a BLOB column ALREADY counts bytes, so a cast would be noise. A byte-named cap over a blob column was a confident FALSE POSITIVE the legacy text reader had no way to avoid; the column's builder is what the fact makes knowable",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/local-check.ts":
          `import { sqliteTable, text } from "${DRIZZLE_SQLITE}";\n` +
          BYTE_CONST +
          "function check(name: string, expression: string): string {\n  return name.concat(expression);\n}\n" +
          "const sql = { raw: (value: string): string => value };\n" +
          'export const t = sqliteTable("t", { value: text("value") });\n' +
          `export const note = check("t_value_check", sql.raw(${TICK}${sqlText("value", BYTE_HOLE)}${TICK}));\n`,
      },
      why: "THE IDENTITY COUNTERFACTUAL — a LOCAL `check` and a local `sql.raw`, byte-named cap, no cast, in a schema file with drizzle imported alongside. The legacy text comparison accused it; deleting the origin checks turns this row red",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/list-check.ts":
          `import { sql } from "${DRIZZLE_ORM}";\n` +
          `import { check, sqliteTable, text } from "${DRIZZLE_SQLITE}";\n` +
          'export const t = sqliteTable("t", { kind: text("kind") }, () => [check("t_kind_check", sql.raw("kind in (\'a\',\'b\')"))]);\n',
      },
      why: "a CHECK that is not a length cap at all (the `notifications.ts:73` list shape) has nothing to match",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/dynamic-cap.ts": schemaFixture({
          declarations: "declare function capFor(name: string): number;\n",
          capExpression: "value",
          capHole: hole('capFor("value")'),
        }),
      },
      why: "DECLARED LIMIT — byte intent is NAME-ONLY, so a cap the reader cannot NAME (a call result) carries no evidence of byte intent. This policy fails QUIET on an unnameable cap rather than accusing every computed CHECK; the KiB/MiB-comment fallback the issue floats has zero live cases and would be an unproven arm",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/waived.ts": schemaFixture({
          declarations: BYTE_CONST,
          capExpression: "value",
          capHole: BYTE_HOLE,
          waiver:
            "  // @orb-waive byte-check-cast(KV_VALUE_MAX_BYTES): the writer normalizes to the byte cap before insert, so this CHECK is a coarse backstop. Ends when the writer stops normalizing.\n",
        }),
      },
      why: "the ONE central positioned waiver naming the exact reported cap — malformed, stale and over-broad markers are proven CENTRALLY, never re-proved per policy",
    },
  ],
});
