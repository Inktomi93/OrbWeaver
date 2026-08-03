// Gate: nullable-column-inequality (Core-Enforcement-Active-Gates.md) — `ne(T.col, …)` / `notInArray(T.col, …)`
// on a column that is NULLABLE in packages/db/src/schema/**. SQL three-valued logic makes `NULL <> x` NULL, so
// every NULL row silently VANISHES from the result; widening a NOT NULL FK to nullable turns every such
// predicate into a silent row-dropper with no typecheck, no test and no other gate seeing it (the D124 class).
// Nullability is DERIVED from the schema sources. LIMITS: no `not(eq())`; a `.primaryKey()` column counts NOT NULL.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { repoRel } from "../pass.ts";
import { compositePrimaryKeyColumns, isSchemaFile, schemaTables } from "../schema-read.ts";

const DRIZZLE_MODULE = "drizzle-orm";
// The two predicates whose SQL form is an INEQUALITY over a column — the shapes NULL silently defeats.
// (`not(eq(...))` is the same defect one wrapper out; it appears nowhere on the tree and is a DECLARED LIMIT.)
const INEQUALITY_FNS: ReadonlySet<string> = new Set<string>(["ne", "notInArray"]);
// `notInArray(col, values)` — only argument 0 is a column operand; `ne(a, b)` can carry one on EITHER side
// (`ne(messageVariants.id, messages.selectedVariantId)` — the RHS column is the nullable one there).
const COLUMN_ARG_COUNT: Readonly<Record<string, number>> = { ne: 2, notInArray: 1 };
// The explicit null-guards that make the predicate total: `or(isNull(T.c), ne(T.c, x))` (keep the NULLs) or
// `and(isNotNull(T.c), ne(T.c, x))` (drop them ON PURPOSE). Either one, anywhere in the same statement.
const NULL_GUARD_FNS: ReadonlySet<string> = new Set<string>(["isNull", "isNotNull"]);

// The marker vocabulary, for a site where the NULLs are provably unreachable by a fact the AST cannot see (a
// join that already excludes them, a post-commit non-null invariant). POSITION-NAMED — `@nullable-cmp-ok(T.col):`
// — because one function can carry several guarded comparisons and a bare marker would rubber-stamp all of them.
const MARKER_RE = /@nullable-cmp-ok(?:\((?<name>[^)\n]*)\))?(?<colon>:)?(?<reason>[^\n]*)/u;
const MARKER = "@nullable-cmp-ok";
const GATE_SELF = "scripts/check/gates/nullable-column-inequality.ts";
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
const LINE_COMMENT_RE = /^\s*(?:\/\/|\*|\/\*)/u;

const MESSAGE =
  "an inequality predicate (`ne` / `notInArray`) is applied to a column that is NULLABLE in " +
  "packages/db/src/schema/** and nothing guards the NULLs. SQL is three-valued: `NULL <> 'x'` evaluates to " +
  "NULL, not TRUE, so every row whose column is NULL is silently DROPPED from the result — the predicate " +
  "reads as 'everything except x' and behaves as 'everything except x, and also nothing that is unset'. " +
  "Widening a NOT NULL column to nullable converts every such predicate into a silent row-dropper with no " +
  "typecheck and no test failure (Tier-1-DB.md).";

const FIX =
  "decide what the NULL rows mean and SAY it in the predicate: `or(isNull(T.col), ne(T.col, x))` keeps them " +
  "(the usual intent — 'not x' includes 'unset'), `and(isNotNull(T.col), ne(T.col, x))` drops them " +
  "deliberately. If a fact outside this statement already excludes them (an inner join on that same column, " +
  "a post-commit non-null invariant), mark the site `// @nullable-cmp-ok(Table.column): <why, and what would " +
  "end it>` in the enclosing function or its leading comment block — the reason after the colon is REQUIRED " +
  "(scripts/check/GATE-AUTHORING.md §4).";

// ── the schema-derived nullability map ────────────────────────────────────────────────────────────────
/** `tableVariableName` → the set of columns that may be NULL. Derived from the drizzle sources every run —
 *  no hand-kept list, so widening a column to nullable arms the gate on the next run by itself. */
function nullableColumnMap(ctx: GateRunCtx): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const sf of ctx.project.getSourceFiles()) {
    if (!isSchemaFile(repoRel(ctx.root, sf.getFilePath()))) {
      continue;
    }
    for (const table of schemaTables(sf)) {
      const composite = new Set<string>(
        (table.extra?.getDescendantsOfKind(SyntaxKind.CallExpression) ?? [])
          .filter((call) => call.getExpression().getText() === "primaryKey")
          .flatMap((call) => compositePrimaryKeyColumns(call)),
      );
      const nullable = new Set<string>(
        table.columns
          // `.primaryKey()` counts NOT NULL: SQLite's legacy quirk allows NULL in a non-INTEGER PK, but every
          // PK on this tree is an app-minted TypeID written on insert — a mustPass row records the limit.
          .filter((c) => !(c.text.includes(".notNull(") || c.text.includes(".primaryKey(") || composite.has(c.name)))
          .map((c) => c.name),
      );
      map.set(table.variableName, nullable);
    }
  }
  return map;
}

// ── candidate collection (the shared walk) ────────────────────────────────────────────────────────────
interface Candidate {
  readonly node: Node;
  readonly table: string;
  readonly column: string;
  /** The enclosing function (or top-level statement) the marker window is derived from. */
  readonly window: Node;
}

const candidates: Candidate[] = [];

/** Is `name` imported into this file from `drizzle-orm`? The gate keys on the NAMES `ne`/`notInArray`, so
 *  this is the §4.6 blindness tripwire in reverse: a same-named LOCAL helper must never be judged as SQL. */
function importedFromDrizzle(sf: SourceFile, name: string): boolean {
  for (const decl of sf.getImportDeclarations()) {
    if (!decl.getModuleSpecifierValue().startsWith(DRIZZLE_MODULE)) {
      continue;
    }
    if (decl.getNamedImports().some((n) => (n.getAliasNode() ?? n.getNameNode()).getText() === name)) {
      return true;
    }
  }
  return false;
}

/** `T.col` → its parts, when the operand is a plain two-part property access on an identifier. */
function columnRef(arg: Node | undefined): { readonly table: string; readonly column: string } | undefined {
  if (arg === undefined || !TsNode.isPropertyAccessExpression(arg)) {
    return;
  }
  const receiver = arg.getExpression();
  return TsNode.isIdentifier(receiver) ? { table: receiver.getText(), column: arg.getName() } : undefined;
}

/** The enclosing STATEMENT — the scope a null-guard must share with the predicate to count. */
function enclosingStatement(node: Node): Node {
  let cur = node;
  let parent = cur.getParent();
  while (parent !== undefined && !(TsNode.isBlock(parent) || TsNode.isSourceFile(parent) || TsNode.isModuleBlock(parent))) {
    cur = parent;
    parent = cur.getParent();
  }
  return cur;
}

/** The marker WINDOW for a call: the enclosing function, else the enclosing top-level statement. A marker
 *  binds to this block (or its leading `//` comment block) — never to the whole file. */
function markerWindow(node: Node): Node {
  return (
    node.getFirstAncestor(
      (a) => TsNode.isFunctionDeclaration(a) || TsNode.isMethodDeclaration(a) || TsNode.isArrowFunction(a) || TsNode.isFunctionExpression(a),
    ) ?? enclosingStatement(node)
  );
}

/** Is `T.col`'s nullness explicitly decided anywhere in the same statement (`isNull`/`isNotNull`)? */
function nullGuarded(node: Node, ref: { readonly table: string; readonly column: string }): boolean {
  const wanted = `${ref.table}.${ref.column}`;
  return enclosingStatement(node)
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((call) => NULL_GUARD_FNS.has(call.getExpression().getText()) && columnRefText(call.getArguments()[0]) === wanted);
}

function columnRefText(arg: Node | undefined): string | undefined {
  const ref = columnRef(arg);
  return ref === undefined ? undefined : `${ref.table}.${ref.column}`;
}

function collect(node: Node, sf: SourceFile): void {
  if (!TsNode.isCallExpression(node)) {
    return;
  }
  const callee = node.getExpression().getText();
  if (!(INEQUALITY_FNS.has(callee) && importedFromDrizzle(sf, callee))) {
    return;
  }
  const args = node.getArguments();
  for (const arg of args.slice(0, COLUMN_ARG_COUNT[callee] ?? 1)) {
    const ref = columnRef(arg);
    if (ref !== undefined && !nullGuarded(node, ref)) {
      candidates.push({ node: arg, table: ref.table, column: ref.column, window: markerWindow(node) });
    }
  }
}

// ── the marker reader (two-sided, position-named) ─────────────────────────────────────────────────────
interface Marker {
  readonly line: number;
  /** The `(Table.column)` / `(column)` position name, or undefined for a bare marker. */
  readonly name: string | undefined;
  readonly wellFormed: boolean;
}

/** Every `@nullable-cmp-ok` marker in a file, with its 1-based line and its position name. */
function markersIn(sf: SourceFile): Marker[] {
  const out: Marker[] = [];
  sf.getFullText()
    .split("\n")
    .forEach((text, index) => {
      const m = MARKER_RE.exec(text);
      if (m === null) {
        return;
      }
      const name = m.groups?.["name"]?.trim();
      const reason = m.groups?.["reason"]?.trim() ?? "";
      out.push({
        line: index + 1,
        name: name === undefined || name.length === 0 ? undefined : name,
        wellFormed: m.groups?.["colon"] === ":" && reason.length > 0,
      });
    });
  return out;
}

/** The window's line span, extended UPWARD across the contiguous `//` comment block above it — where the
 *  reason for a marked site is naturally written. */
function windowSpan(window: Node): { readonly start: number; readonly end: number } {
  const sf = window.getSourceFile();
  const lines = sf.getFullText().split("\n");
  const end = sf.getLineAndColumnAtPos(window.getEnd()).line;
  let start = sf.getLineAndColumnAtPos(window.getStart()).line;
  while (start > 1 && LINE_COMMENT_RE.test(lines[start - 2] ?? "")) {
    start -= 1;
  }
  return { start, end };
}

/** Does a position name identify this candidate? `Table.column` or the bare `column`. */
function nameMatches(name: string, c: Candidate): boolean {
  return name === `${c.table}.${c.column}` || name === c.column;
}

const STALE_MARKER = (name: string | undefined): string =>
  `a \`${MARKER}${name === undefined ? "" : `(${name})`}\` marker guards NO live nullable-column inequality in ` +
  "its block — the site was fixed, moved or renamed and the marker outlived it. A stale marker is a loaded " +
  "gun: the next `ne()` written in this block inherits an exemption nobody granted it. Delete it " +
  `(${GATE_SELF}; scripts/check/GATE-AUTHORING.md §4).`;

const MALFORMED_MARKER =
  `a \`${MARKER}\` marker carries no reason. The grammar is \`${MARKER}(Table.column): <why the NULLs cannot ` +
  "reach here, and what would end the exemption>` — the text after the colon is REQUIRED and a bare marker " +
  `exempts NOTHING (${GATE_SELF}; scripts/check/GATE-AUTHORING.md §4).`;

const AMBIGUOUS_MARKER = (names: readonly string[]): string =>
  `a bare \`${MARKER}\` marker sits in a block carrying ${names.length} nullable-column inequalities ` +
  `(${names.join(", ")}) — it cannot say which one it forgives, so it rubber-stamps all of them. POSITION-NAME ` +
  `it: \`${MARKER}(${names[0] ?? "Table.column"}): <why>\`, one marker per site ` +
  `(${GATE_SELF}; scripts/check/GATE-AUTHORING.md §4).`;

/** The per-file judging state: what one well-formed marker resolved to. */
interface MarkerVerdict {
  /** Candidates this marker forgives (empty ⇒ the marker is STALE). */
  readonly exempt: readonly Candidate[];
  /** Set when the marker is bare AND its block carries several sites — it cannot say which it forgives. */
  readonly ambiguous: readonly string[] | undefined;
}

function resolveMarker(marker: Marker, inFile: readonly Candidate[]): MarkerVerdict {
  const inWindow = inFile.filter((c) => {
    const span = windowSpan(c.window);
    return marker.line >= span.start && marker.line <= span.end;
  });
  if (marker.name === undefined) {
    return inWindow.length > 1 ? { exempt: inWindow, ambiguous: inWindow.map((c) => `${c.table}.${c.column}`) } : { exempt: inWindow, ambiguous: undefined };
  }
  const name = marker.name;
  return { exempt: inWindow.filter((c) => nameMatches(name, c)), ambiguous: undefined };
}

/** Judge ONE file's candidates against its markers. Everything is reported through ctx. */
function judgeFile(sf: SourceFile, inFile: readonly Candidate[], ctx: GateRunCtx): void {
  const file = repoRel(ctx.root, sf.getFilePath());
  const exempt = new Set<Candidate>();
  for (const marker of markersIn(sf)) {
    if (!marker.wellFormed) {
      ctx.report({ file, line: marker.line, column: 0, message: MALFORMED_MARKER });
      continue;
    }
    const verdict = resolveMarker(marker, inFile);
    for (const c of verdict.exempt) {
      exempt.add(c);
    }
    if (verdict.ambiguous !== undefined) {
      ctx.report({ file, line: marker.line, column: 0, message: AMBIGUOUS_MARKER(verdict.ambiguous) });
    } else if (verdict.exempt.length === 0) {
      ctx.report({ file, line: marker.line, column: 0, message: STALE_MARKER(marker.name) });
    }
  }
  for (const c of inFile) {
    if (!exempt.has(c)) {
      ctx.report(c.node);
    }
  }
}

export const gate: GateDescriptor = {
  name: "nullable-column-inequality",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // the verdict needs the db schema sources, never just the queried file
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.startsWith("packages/") || p.startsWith("tests/"),
  kinds: [SyntaxKind.CallExpression],
  begin: () => {
    candidates.length = 0;
  },
  visit: collect,
  finalize: (ctx) => {
    const nullable = nullableColumnMap(ctx);
    const live = candidates.filter((c) => nullable.get(c.table)?.has(c.column) === true);
    const byFile = new Map<SourceFile, Candidate[]>();
    for (const c of live) {
      const sf = c.node.getSourceFile();
      byFile.set(sf, [...(byFile.get(sf) ?? []), c]);
    }
    // A file carrying ONLY markers (every site fixed) still owes its stale arm — union both key sets.
    const markerFiles = ctx.project
      .getSourceFiles()
      .filter((sf) => sf.getFullText().includes(MARKER) && !repoRel(ctx.root, sf.getFilePath()).startsWith("scripts/"));
    for (const sf of new Set<SourceFile>([...byFile.keys(), ...markerFiles])) {
      judgeFile(sf, byFile.get(sf) ?? [], ctx);
    }
    // §4.6 blindness tripwire: this gate is keyed on the drizzle schema HOME. If that home stops resolving
    // (a rename/move), the nullability map is empty and the gate reports ✓ forever.
    if (ctx.project.getSourceFile(`${ctx.root}/${REAL_TREE_ANCHOR}`) !== undefined && nullable.size === 0) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `the drizzle schema barrel ${REAL_TREE_ANCHOR} resolves but yielded ZERO tables — the reader in scripts/check/schema-read.ts no longer matches the schema shape, so this gate is a silent no-op. Repoint it.`,
      });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { characters } from "@orb/db";\nexport const p = ne(characters.avatarAssetId, "a");\n',
      },
      expect: { count: 1 },
      why: "the founding shape (D124) — `ne()` on a column with no `.notNull()`: every row whose avatar is unset silently vanishes from a predicate that reads as 'any avatar but this one'",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { notInArray } from "drizzle-orm";\nimport { characters } from "@orb/db";\nexport const p = notInArray(characters.avatarAssetId, ["a", "b"]);\n',
      },
      expect: { count: 1 },
      why: "`notInArray` is the SAME three-valued defect (`NULL NOT IN (…)` is NULL) — covering only `ne` would be a half-gate",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const messages = sqliteTable("messages", { id: text("id").primaryKey(), selectedVariantId: text("selected_variant_id") });\nexport const messageVariants = sqliteTable("message_variants", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { messages, messageVariants } from "@orb/db";\nexport const p = ne(messageVariants.id, messages.selectedVariantId);\n',
      },
      expect: { count: 1 },
      why: "the nullable column on the RIGHT-hand side — the live shape in chat/persistence/queries.ts; an arg-0-only reader would have passed it silently",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { characters } from "@orb/db";\n// @nullable-cmp-ok\nexport const p = ne(characters.avatarAssetId, "a");\n',
      },
      expect: { messageIncludes: "carries no reason" },
      why: "MALFORMED marker — a bare `@nullable-cmp-ok` with no `: <reason>` is a rubber stamp; it must RED and exempt nothing (GATE-AUTHORING.md §4.3)",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id"), coverAssetId: text("cover_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { and, ne } from "drizzle-orm";\nimport { characters } from "@orb/db";\n// @nullable-cmp-ok: the join excludes them\nexport function p(): unknown {\n  return and(ne(characters.avatarAssetId, "a"), ne(characters.coverAssetId, "b"));\n}\n',
      },
      expect: { messageIncludes: "POSITION-NAME" },
      why: "OVER-MARK — one bare marker in a block carrying TWO guarded comparisons cannot say which it forgives, so it must demand a position name (the one-line-two-guarded-things law)",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { eq } from "drizzle-orm";\nimport { characters } from "@orb/db";\n// @nullable-cmp-ok(characters.avatarAssetId): the inner join already drops NULL avatars\nexport const p = eq(characters.avatarAssetId, "a");\n',
      },
      expect: { messageIncludes: "guards NO live" },
      why: "STALE marker — the two-sided arm: the `ne` became an `eq`, the marker survived, and the next inequality written in that block would inherit an exemption nobody granted it",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const users = sqliteTable("users", { id: text("id").primaryKey(), role: text("role").notNull() });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { users } from "@orb/db";\nexport const p = ne(users.role, "owner");\n',
      },
      why: "a `.notNull()` column — three-valued logic cannot bite, and this is the overwhelming majority of the live corpus (17 of 19 sites)",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const rpgSnapshots = sqliteTable("rpg_snapshots", { id: text("id").primaryKey(), messageId: text("message_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { isNull, ne, or } from "drizzle-orm";\nimport { rpgSnapshots } from "@orb/db";\nexport const p = or(isNull(rpgSnapshots.messageId), ne(rpgSnapshots.messageId, "m"));\n',
      },
      why: "the SANCTIONED total form — `or(isNull(col), ne(col, x))`, the live rpg/persistence/snapshots.ts shape and exactly what the fix names",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const rpgSnapshots = sqliteTable("rpg_snapshots", { id: text("id").primaryKey(), messageId: text("message_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { and, isNotNull, ne } from "drizzle-orm";\nimport { rpgSnapshots } from "@orb/db";\nexport const p = and(isNotNull(rpgSnapshots.messageId), ne(rpgSnapshots.messageId, "m"));\n',
      },
      why: "the other sanctioned form — dropping the NULLs DELIBERATELY with `isNotNull` in the same statement is a decision, not an accident",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { characters } from "@orb/db";\n// @nullable-cmp-ok(characters.avatarAssetId): every consumer inner-joins on this column, so NULL rows are already gone. Ends if a consumer left-joins.\nexport function p(): unknown {\n  return ne(characters.avatarAssetId, "a");\n}\n',
      },
      why: "a POSITION-NAMED marker with a reason, in the leading comment block of the enclosing function — the sanctioned escape for a fact the AST cannot see (the live discovery/persistence/embed-store-reads.ts site)",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'function ne(a: string, b: string): boolean {\n  return a !== b;\n}\nexport const p = ne("x", "y");\n',
      },
      why: "DECLARED LIMIT / no-false-positive: a same-named LOCAL `ne` is not drizzle SQL. The import check is the §4.6 tripwire that keeps the name-keyed match honest",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), avatarAssetId: text("avatar_asset_id") });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { eq, not } from "drizzle-orm";\nimport { characters } from "@orb/db";\nexport const p = not(eq(characters.avatarAssetId, "a"));\n',
      },
      why: "DECLARED LIMIT — `not(eq(...))` is the same three-valued defect one wrapper out. It appears nowhere on this tree, so the reader deliberately does not chase it; this row is the written baseline of that choice",
    },
    {
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n',
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { chats } from "@orb/db";\nexport const p = ne(chats.id, "c");\n',
      },
      why: "DECLARED LIMIT — a `.primaryKey()` column is read as NOT NULL. SQLite's legacy quirk permits NULL in a non-INTEGER PK, but every PK here is an app-minted TypeID written on insert, so treating it as nullable would be 40 false positives",
    },
    {
      files: {
        "packages/server/src/domain/x/persistence/reads.ts":
          'import { ne } from "drizzle-orm";\nimport { someTable } from "@orb/db";\nexport const p = ne(someTable.whatever, "a");\n',
      },
      why: "DECLARED LIMIT — a table this run's project carries no schema source for is UNKNOWN, not nullable: the gate fails QUIET rather than flagging every alias/subquery it cannot resolve",
    },
  ],
};
