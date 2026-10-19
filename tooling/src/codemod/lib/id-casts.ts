// ID branding, the cast arms: object-literal / comparison / diagnostic-driven castId insertion.
// Drizzle tables, operators and string types are floor facts read in every native world that owns the file. A file
// no world owns, or a site the worlds disagree on, gets no cast from those arms and a preview note naming why.

import type { CallExpression, Diagnostic, DiagnosticMessageChain, PropertyAssignment } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { callsDrizzleOperator } from "../../floor/code-facts/drizzle-operators.ts";
import { DRIZZLE_SET_VERB, DRIZZLE_VALUES_VERB } from "../../floor/code-facts/drizzle-vocabulary.ts";
import { readDrizzleWriteTable } from "../../floor/code-facts/drizzle-write-chain.ts";
import type { CastSkip, WorldReader } from "../contract/cast-worlds.ts";
import type { CastByDiagnosticOptions, CastIdComparisonsOptions, CastIdLiteralsOptions, CodemodContext, Plan } from "../contract/types.ts";
import { agreedInEveryWorld, logSkips, skipSuffix, worldReader } from "./cast-worlds.ts";
import { addNamedImport } from "./imports.ts";
import { assertPathString, composePlans, isTestFile } from "./plans.ts";
import { applyTextReplacements, replacementsForNodes } from "./text.ts";

/** The receiver of the `.values()` / `.set()` call whose payload holds this property, single-row or multi-row. */
function writePayloadReceiver(pa: PropertyAssignment): Node | undefined {
  const objLit = pa.getParentIfKind(SyntaxKind.ObjectLiteralExpression);
  const wrapper = objLit?.getParent();
  const call = Node.isArrayLiteralExpression(wrapper) ? wrapper.getParentIfKind(SyntaxKind.CallExpression) : objLit?.getParentIfKind(SyntaxKind.CallExpression);
  const access = call?.getExpression();
  if (!Node.isPropertyAccessExpression(access)) {
    return;
  }
  const method = access.getName();
  return method === DRIZZLE_VALUES_VERB || method === DRIZZLE_SET_VERB ? access.getExpression() : undefined;
}

const TABLE_ARM = "table-scoped id";
const STRING_VARIABLE_ARM = "string variable";
const OPERATOR_ARM = "drizzle operator";

/** The table text of the Drizzle `insert()` / `update()` chain the property's payload is written through. */
function writeTargetTable(pa: PropertyAssignment, reader: WorldReader): string | undefined {
  const receiver = writePayloadReceiver(pa);
  return receiver === undefined
    ? undefined
    : agreedInEveryWorld(reader, TABLE_ARM, receiver, (local) => {
        const table = readDrizzleWriteTable(local);
        return table.kind === "resolved" && table.value !== null ? table.value.getText() : undefined;
      });
}

/**
 * Wrap fixture id string-literals in `castId<Brand>(...)` so they satisfy the now-branded
 * column. Two matchers: `alwaysProps` (a property that is always the brand, e.g. `chatId`)
 * and `tableScopedIdProps` (the generic `id`, only when the enclosing call inserts into the
 * named table). Only string-literal initializers are touched, so it never double-wraps and
 * never touches values fixed by `retypeIdAnnotations`. Test-scoped by default.
 */
/** Is this property assignment one we should cast — either an always-branded name, or the
 *  generic `id` scoped to a matching insert/update table? */
function isCastTargetProperty(
  pa: PropertyAssignment,
  always: ReadonlySet<string>,
  tableScoped: readonly { readonly table: string; readonly prop: string }[],
  reader: WorldReader | undefined,
): boolean {
  const name = pa.getName();
  if (always.has(name)) {
    return true;
  }
  const scoped = tableScoped.filter((t) => t.prop === name);
  if (scoped.length === 0 || reader === undefined) {
    return false;
  }
  const table = writeTargetTable(pa, reader);
  return scoped.some((t) => t.table === table);
}

/** The node to wrap in `castFn<brand>(...)` for a matched property, or undefined if this
 *  property's initializer isn't eligible (already cast, wrong type, or vars disabled). */
function plainStringInEveryWorld(node: Node, reader: WorldReader): boolean {
  return (
    agreedInEveryWorld(reader, STRING_VARIABLE_ARM, node, (local) => {
      const type = local.getType();
      return type.isString() || type.isStringLiteral();
    }) === true
  );
}

function resolveCastCandidate(pa: PropertyAssignment, opts: CastIdLiteralsOptions, reader: WorldReader | undefined): Node | undefined {
  const literal =
    pa.getInitializerIfKind(SyntaxKind.StringLiteral) ??
    pa.getInitializerIfKind(SyntaxKind.NoSubstitutionTemplateLiteral) ??
    pa.getInitializerIfKind(SyntaxKind.TemplateExpression); // `id: `msg-${i}``
  if (literal !== undefined) {
    return literal;
  }
  if (opts.includeStringVars !== true) {
    return;
  }
  // Non-literal initializer (`id: charId`, `characterId: opts.id`): cast ONLY when its type is
  // exactly plain `string` — never nullable, never an already-branded value (would double-cast).
  const expr = pa.getInitializer();
  if (expr === undefined) {
    return;
  }
  if (Node.isCallExpression(expr)) {
    const callee = expr.getExpression().getText();
    if (callee === opts.castFn || callee.startsWith(`${opts.castFn}<`)) {
      return;
    }
  }
  // Plain `string`, or a string-LITERAL type (`const id = "foo"` infers `"foo"`, not `string`) —
  // the common test pattern of a literal id stored in a const before the insert. Both are safe:
  // an already-branded value is neither, so it's never double-cast.
  return reader !== undefined && plainStringInEveryWorld(expr, reader) ? expr : undefined;
}

/** Only the table-scoped and string-variable arms ask a type question; a syntax-only cast builds no native world. */
function objectLiteralReader(ctx: CodemodContext, opts: CastIdLiteralsOptions): WorldReader | undefined {
  return opts.includeStringVars === true || (opts.tableScopedIdProps?.length ?? 0) > 0 ? worldReader(ctx) : undefined;
}

function scanObjectLiteralCastTargets(ctx: CodemodContext, opts: CastIdLiteralsOptions): { targets: Node[]; files: Set<string>; skips: readonly CastSkip[] } {
  const always = new Set(opts.alwaysProps);
  const tableScoped = opts.tableScopedIdProps ?? [];
  const testOnly = opts.testFilesOnly ?? true;
  const reader = objectLiteralReader(ctx, opts);
  const targets: Node[] = [];
  const files = new Set<string>();
  for (const sf of ctx.project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (testOnly && !isTestFile(fp)) {
      continue;
    }
    for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
      if (!isCastTargetProperty(pa, always, tableScoped, reader)) {
        continue;
      }
      const candidate = resolveCastCandidate(pa, opts, reader);
      if (candidate !== undefined) {
        targets.push(candidate);
        files.add(fp);
      }
    }
  }
  return { targets, files, skips: reader?.skips ?? [] };
}

/** Add the `castFn` value import + `brand` type-only import to every touched file. Shared by all
 *  the cast-literal helpers (object literals, comparisons, diagnostic-driven). */
function buildCastImportPlans(
  ctx: CodemodContext,
  opts: { readonly importModule: string; readonly castFn: string; readonly brand: string },
  files: ReadonlySet<string>,
): Plan[] {
  const plans: Plan[] = [];
  for (const fp of files) {
    plans.push(addNamedImport(ctx, fp, { moduleSpecifier: opts.importModule, name: opts.castFn }));
    plans.push(
      addNamedImport(ctx, fp, {
        moduleSpecifier: opts.importModule,
        name: opts.brand,
        isTypeOnly: true,
      }),
    );
  }
  return plans;
}

export function castIdInObjectLiterals(ctx: CodemodContext, opts: CastIdLiteralsOptions): Plan {
  assertPathString(opts.brand, "brand");
  assertPathString(opts.castFn, "castFn");
  assertPathString(opts.importModule, "importModule");
  const always = new Set(opts.alwaysProps);
  const tableScoped = opts.tableScopedIdProps ?? [];
  const { targets, files, skips } = scanObjectLiteralCastTargets(ctx, opts);
  logSkips(ctx, skips);

  const plans: Plan[] = [];
  if (targets.length > 0) {
    plans.push(
      applyTextReplacements(
        ctx,
        replacementsForNodes(targets, (n) => ({
          text: `${opts.castFn}<${opts.brand}>(${n.getText()})`,
          label: `wrap in ${opts.castFn}<${opts.brand}>`,
        })),
        { note: `cast ${targets.length} fixture literal(s)` },
      ),
    );
    plans.push(...buildCastImportPlans(ctx, opts, files));
  }
  return composePlans(
    `cast {${[...always, ...tableScoped.map((t) => `${t.table}.${t.prop}`)].join(", ")}} ` +
      `literals → ${opts.castFn}<${opts.brand}> (${targets.length} site(s) across ${files.size} file(s)${skipSuffix(skips)})`,
    plans,
  );
}

/**
 * Wrap string literals compared against a branded column in `castFn<brand>(...)`. Drizzle's
 * `eq(chats.id, "ch1")` surfaces a column/string mismatch as a TS2769 "no overload" on the
 * operator call (not a clean TS2345 on the literal), so neither the structural nor the
 * diagnostic literal passes reach it — this one targets it directly: `eq`/`ne`/… where one arg
 * is a `columns`-matching column reference and the other is a string literal (and `inArray`'s
 * literal array elements). Idempotent (skips literals already wrapped in `castFn`). Test-scoped.
 */
function isUnwrappedComparisonLiteral(n: Node | undefined, castFn: string): boolean {
  if (n === undefined) {
    return false;
  }
  if (n.getKind() !== SyntaxKind.StringLiteral && n.getKind() !== SyntaxKind.NoSubstitutionTemplateLiteral && n.getKind() !== SyntaxKind.TemplateExpression) {
    return false;
  }
  const parent = n.getParent();
  if (parent !== undefined && Node.isCallExpression(parent)) {
    const callee = parent.getExpression().getText();
    if (callee === castFn || callee.startsWith(`${castFn}<`)) {
      return false;
    }
  }
  return true;
}

/** For one matched `eq`/`inArray`/… call, collect the comparand(s) still needing a cast wrap.
 *  `inArray`'s second arg is an array of comparands; every other op compares directly. */
function collectComparisonTargets(call: CallExpression, opts: CastIdComparisonsOptions): readonly Node[] {
  const [first, second] = call.getArguments();
  if (first === undefined || second === undefined) {
    return [];
  }
  const matchesColumn = opts.columns.some((c) => (c.startsWith(".") ? first.getText().endsWith(c) : first.getText() === c));
  if (!matchesColumn) {
    return [];
  }
  const operands = Node.isArrayLiteralExpression(second) ? second.getElements() : [second];
  return operands.filter((operand) => isUnwrappedComparisonLiteral(operand, opts.castFn));
}

/** Is `call` one of the named drizzle-orm operators in every native world, by its import rather than its spelling? */
function callsDrizzleOperatorInEveryWorld(call: CallExpression, ops: readonly string[], reader: WorldReader): boolean {
  return agreedInEveryWorld(reader, OPERATOR_ARM, call, (local) => Node.isCallExpression(local) && ops.some((op) => callsDrizzleOperator(local, op))) === true;
}

function scanComparisonCastTargets(ctx: CodemodContext, opts: CastIdComparisonsOptions): { targets: Node[]; files: Set<string>; skips: readonly CastSkip[] } {
  const ops = opts.ops ?? ["eq", "ne", "gt", "gte", "lt", "lte", "inArray", "notInArray"];
  const testOnly = opts.testFilesOnly ?? true;
  const reader = worldReader(ctx);
  const targets: Node[] = [];
  const files = new Set<string>();
  for (const sf of ctx.project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (testOnly && !isTestFile(fp)) {
      continue;
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const operands = collectComparisonTargets(call, opts);
      if (operands.length === 0 || !callsDrizzleOperatorInEveryWorld(call, ops, reader)) {
        continue;
      }
      for (const operand of operands) {
        targets.push(operand);
        files.add(fp);
      }
    }
  }
  return { targets, files, skips: reader.skips };
}

export function castIdInComparisons(ctx: CodemodContext, opts: CastIdComparisonsOptions): Plan {
  assertPathString(opts.brand, "brand");
  assertPathString(opts.castFn, "castFn");
  assertPathString(opts.importModule, "importModule");
  const { targets, files, skips } = scanComparisonCastTargets(ctx, opts);
  logSkips(ctx, skips);

  const plans: Plan[] = [];
  if (targets.length > 0) {
    plans.push(
      applyTextReplacements(
        ctx,
        replacementsForNodes(targets, (n) => ({
          text: `${opts.castFn}<${opts.brand}>(${n.getText()})`,
          label: `wrap comparand in ${opts.castFn}<${opts.brand}>`,
        })),
        { note: `cast ${targets.length} comparison literal(s)` },
      ),
    );
    plans.push(...buildCastImportPlans(ctx, opts, files));
  }
  return composePlans(
    `cast {${opts.columns.join(", ")}} comparison literals → ${opts.castFn}<${opts.brand}> (${targets.length} site(s) across ${files.size} file(s)${skipSuffix(skips)})`,
    plans,
  );
}

/** Flatten a ts-morph diagnostic message (string or nested chain) to one string. */
function flattenDiagnosticMessage(msg: string | DiagnosticMessageChain): string {
  if (typeof msg === "string") {
    return msg;
  }
  let out = msg.getMessageText();
  for (const next of msg.getNext() ?? []) {
    out += ` ${flattenDiagnosticMessage(next)}`;
  }
  return out;
}

const TS_ARGUMENT_TYPE_MISMATCH = 2345;
const TS_ASSIGNMENT_TYPE_MISMATCH = 2322;

/**
 * Wrap every string LITERAL that tsc reports as unassignable to `brand` in `castFn<brand>(...)`.
 * Type-checker-driven (not name/structure-driven), so it uniformly catches the spots the
 * structural passes miss: positional call ARGUMENTS (`loadHistory(db, "ch1")`), `=` assignments,
 * and returns — anywhere a literal `string` meets a branded slot. Pairs with `retypeIdAnnotations`
 * (retype the declarations first; this mops up the literal value sites the retype pushes errors to).
 *
 * Run it LAST in a codemod (after retypes), so it reads the post-retype diagnostic frontier. Only
 * string-literal nodes already at a reported error are touched, and a literal already wrapped in
 * `castFn(...)` is skipped — so it's safe to re-run, and the tsc gate proves the result.
 */
/** The string-literal node a diagnostic points at (or just under), skipping literals already
 *  wrapped in `castFn(...)` (idempotent). Undefined if this diagnostic isn't a brand-mismatch
 *  on a literal we can locate. */
function resolveDiagnosticCastLiteral(diag: Diagnostic, opts: CastByDiagnosticOptions): Node | undefined {
  const sf = diag.getSourceFile();
  if (sf === undefined) {
    return;
  }
  const message = flattenDiagnosticMessage(diag.getMessageText());
  if (!opts.brandHints.some((h) => message.includes(h))) {
    return;
  }
  const start = diag.getStart();
  if (start === undefined) {
    return;
  }
  const node = sf.getDescendantAtPos(start);
  if (node === undefined) {
    return;
  }
  const literal = (candidate: Node | undefined): Node | undefined =>
    candidate !== undefined &&
    (candidate.getKind() === SyntaxKind.StringLiteral ||
      candidate.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral ||
      candidate.getKind() === SyntaxKind.TemplateExpression)
      ? candidate
      : undefined;
  // Argument diagnostics point at the value. Annotated variable/property assignments point at the
  // declared name instead, so inspect that declaration's exact initializer without sweeping nearby
  // literals on the line.
  const lit =
    literal(node) ??
    literal(node.getParent()) ??
    literal(node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer()) ??
    literal(node.getFirstAncestorByKind(SyntaxKind.PropertyAssignment)?.getInitializer());
  if (lit === undefined) {
    return;
  }
  // Already wrapped in castFn(...)? Skip (idempotent).
  const parent = lit.getParent();
  if (parent !== undefined && Node.isCallExpression(parent)) {
    const callee = parent.getExpression().getText();
    if (callee === opts.castFn || callee.startsWith(`${opts.castFn}<`)) {
      return;
    }
  }
  return lit;
}

function semanticDiagnostics(ctx: CodemodContext): readonly Diagnostic[] {
  const diagnostics = new Map<string, Diagnostic>();
  for (const program of ctx.semantic().programs) {
    for (const diagnostic of program.project().getPreEmitDiagnostics()) {
      const sourceFile = diagnostic.getSourceFile();
      const identity = `${sourceFile?.getFilePath() ?? "<program>"}\0${String(diagnostic.getStart())}\0${String(diagnostic.getCode())}\0${flattenDiagnosticMessage(diagnostic.getMessageText())}`;
      diagnostics.set(identity, diagnostic);
    }
  }
  return [...diagnostics.values()];
}

function diagnosticCastTarget(
  diagnostic: Diagnostic,
  codes: ReadonlySet<number>,
  testOnly: boolean,
  opts: CastByDiagnosticOptions,
): { readonly filePath: string; readonly literal: Node } | undefined {
  if (!codes.has(diagnostic.getCode())) {
    return;
  }
  const filePath = diagnostic.getSourceFile()?.getFilePath();
  if (filePath === undefined || (testOnly && !isTestFile(filePath))) {
    return;
  }
  const literal = resolveDiagnosticCastLiteral(diagnostic, opts);
  return literal === undefined ? undefined : { filePath, literal };
}

function scanDiagnosticCastTargets(ctx: CodemodContext, opts: CastByDiagnosticOptions): { targets: Node[]; files: Set<string> } {
  const codes = new Set(opts.codes ?? [TS_ARGUMENT_TYPE_MISMATCH, TS_ASSIGNMENT_TYPE_MISMATCH]);
  const testOnly = opts.testFilesOnly ?? true;
  const seen = new Set<string>();
  const targets: Node[] = [];
  const files = new Set<string>();
  for (const diagnostic of semanticDiagnostics(ctx)) {
    const target = diagnosticCastTarget(diagnostic, codes, testOnly, opts);
    if (target === undefined) {
      continue;
    }
    const key = `${target.filePath}:${target.literal.getStart()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    targets.push(target.literal);
    files.add(target.filePath);
  }
  return { targets, files };
}

export function castStringLiteralsByDiagnostic(ctx: CodemodContext, opts: CastByDiagnosticOptions): Plan {
  assertPathString(opts.brand, "brand");
  assertPathString(opts.castFn, "castFn");
  assertPathString(opts.importModule, "importModule");
  const { targets, files } = scanDiagnosticCastTargets(ctx, opts);

  const plans: Plan[] = [];
  if (targets.length > 0) {
    plans.push(
      applyTextReplacements(
        ctx,
        replacementsForNodes(targets, (n) => ({
          text: `${opts.castFn}<${opts.brand}>(${n.getText()})`,
          label: `wrap diagnostic literal in ${opts.castFn}<${opts.brand}>`,
        })),
        { note: `cast ${targets.length} diagnostic-flagged literal(s)` },
      ),
    );
    plans.push(...buildCastImportPlans(ctx, opts, files));
  }
  return composePlans(`cast tsc-flagged string literals → ${opts.castFn}<${opts.brand}> (${targets.length} site(s) across ${files.size} file(s))`, plans);
}
