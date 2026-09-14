// STATIC source reading plus string evaluation for CODE registries (#614) — `eslint.config.js` and
// `.dependency-cruiser.cjs` are JS/CJS, so a file-exact row hides behind a named const, an array const, a
// spread, or a template literal built from consts. A gate that reads only bare StringLiterals there would
// SILENTLY SEE ALMOST NOTHING and print a clean zero over a registry it never read — the lying-proof class
// (GATE-AUTHORING.md §5 literal-shape blindness). This module resolves the shapes it CAN prove and REFUSES
// LOUDLY on every shape it cannot: `read()` returns resolved values AND an explicit `unresolved` list, and
// the caller is obliged to turn a non-empty `unresolved` into a finding. Nothing here ever guesses, and an
// unreadable shape is never silently dropped. The ordered-evaluation approach is `dangling-refs.ts`'s
// `evalString` precedent, widened to arrays/spreads/identifiers with a cycle fence.
import { existsSync, readFileSync } from "node:fs";
import { resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import type { SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ConfigRead, ExtractRequest, RowExtraction, StaticRead, UnresolvedShape } from "../contract/config-read.ts";
import type { ExactRow } from "./grant-liveness.ts";
import { lineFinder } from "./grant-liveness.ts";

export type { ConfigRead } from "../contract/config-read.ts";

function refuse(node: Node): StaticRead {
  return { values: [], unresolved: [{ kind: node.getKindName(), text: node.getText(), line: node.getStartLineNumber() }] };
}

function merge(parts: readonly StaticRead[]): StaticRead {
  return {
    values: parts.flatMap((p) => p.values),
    unresolved: parts.flatMap((p) => p.unresolved),
  };
}

function unwrap(node: Node): Node {
  let current = node;
  while (Node.isParenthesizedExpression(current) || Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isNonNullExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

function declarationSymbol(node: Node): object | undefined {
  if (!(Node.isVariableDeclaration(node) && Node.isIdentifier(node.getNameNode()))) {
    return;
  }
  return node.getNameNode().getSymbol()?.compilerSymbol;
}

function isAssignmentOperator(kind: SyntaxKind): boolean {
  return kind >= SyntaxKind.FirstAssignment && kind <= SyntaxKind.LastAssignment;
}

function isStoredOrReturned(identifier: import("ts-morph").Identifier): boolean {
  let current: Node = identifier;
  let parent = current.getParent();
  while (parent !== undefined) {
    if (Node.isSpreadElement(parent) && parent.getExpression() === current) {
      return false;
    }
    if (Node.isVariableDeclaration(parent)) {
      const initializer = parent.getInitializer();
      return initializer !== undefined && unwrap(initializer) !== identifier;
    }
    if (Node.isReturnStatement(parent)) {
      return true;
    }
    if (Node.isExportAssignment(parent)) {
      return false;
    }
    if (Node.isBinaryExpression(parent) && isAssignmentOperator(parent.getOperatorToken().getKind())) {
      return parent.getRight() === current || parent.getRight().getDescendants().includes(identifier);
    }
    current = parent;
    parent = current.getParent();
  }
  return false;
}

function isMutatingUse(identifier: import("ts-morph").Identifier): boolean {
  if (isStoredOrReturned(identifier)) {
    return true;
  }
  let current: Node = identifier;
  let parent = current.getParent();
  while (
    parent !== undefined &&
    (Node.isParenthesizedExpression(parent) ||
      Node.isAsExpression(parent) ||
      Node.isSatisfiesExpression(parent) ||
      Node.isNonNullExpression(parent) ||
      Node.isPropertyAccessExpression(parent) ||
      Node.isElementAccessExpression(parent))
  ) {
    current = parent;
    parent = current.getParent();
  }
  if (parent === undefined) {
    return false;
  }
  if (Node.isCallExpression(parent)) {
    return (
      parent.getExpression() === current || parent.getArguments().some((argument) => argument === current || argument.getDescendants().includes(identifier))
    );
  }
  if (Node.isBinaryExpression(parent) && parent.getLeft() === current) {
    return isAssignmentOperator(parent.getOperatorToken().getKind());
  }
  if ((Node.isPrefixUnaryExpression(parent) || Node.isPostfixUnaryExpression(parent)) && parent.getOperand() === current) {
    const operator = parent.getOperatorToken();
    return operator === SyntaxKind.PlusPlusToken || operator === SyntaxKind.MinusMinusToken;
  }
  return Node.isDeleteExpression(parent) && parent.getExpression() === current;
}

function aliasEdge(declaration: import("ts-morph").VariableDeclaration): readonly [alias: object, source: object] | undefined {
  const alias = declarationSymbol(declaration);
  const initializer = declaration.getInitializer();
  const value = initializer === undefined ? undefined : unwrap(initializer);
  const source = value !== undefined && Node.isIdentifier(value) ? value.getSymbol()?.compilerSymbol : undefined;
  return alias === undefined || source === undefined ? undefined : [alias, source];
}

function escapedSymbol(identifier: import("ts-morph").Identifier): object | undefined {
  const parent = identifier.getParent();
  if (Node.isShorthandPropertyAssignment(parent)) {
    return parent.getValueSymbol()?.compilerSymbol;
  }
  const symbol = identifier.getSymbol()?.compilerSymbol;
  return symbol !== undefined && !(Node.isVariableDeclaration(parent) && parent.getNameNode() === identifier) && isMutatingUse(identifier) ? symbol : undefined;
}

function propagateEscapedAliases(escaped: Set<object>, aliases: readonly (readonly [alias: object, source: object])[]): void {
  let grew = true;
  while (grew) {
    grew = false;
    for (const [alias, source] of aliases) {
      if (escaped.has(alias) && !escaped.has(source)) {
        escaped.add(source);
        grew = true;
      }
    }
  }
}

function escapedCollectionSymbols(source: import("ts-morph").SourceFile): ReadonlySet<object> {
  const aliases = source
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .map(aliasEdge)
    .filter((edge): edge is readonly [alias: object, source: object] => edge !== undefined);
  const escaped = new Set(
    source
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .map(escapedSymbol)
      .filter((symbol): symbol is object => symbol !== undefined),
  );
  propagateEscapedAliases(escaped, aliases);
  return escaped;
}

/** Arrays are mutable even behind `const`. Refuse any mutation/escape through the binding or a same-file
 * alias; otherwise the literal snapshot can differ from the runtime config value. */
function collectionBindingEscapes(terminal: Node, declarations: readonly Node[], escaped: ReadonlySet<object>): boolean {
  if (!Node.isArrayLiteralExpression(terminal)) {
    return false;
  }
  return declarations.some((declaration) => {
    const symbol = declarationSymbol(declaration);
    return symbol !== undefined && escaped.has(symbol);
  });
}

/** Resolve an identifier through its ONE variable declaration's initializer. A `const` with no initializer,
 *  a parameter, an import, or a re-assigned binding is refused rather than guessed. */
function readIdentifier(node: Node, seen: Set<Node>, escaped: ReadonlySet<object>): StaticRead {
  const fact = resolveStableExpression(node);
  if (
    fact.trace.origin.getSourceFile() !== node.getSourceFile() ||
    fact.trace.declarations.some((declaration) => declaration.getSourceFile() !== node.getSourceFile())
  ) {
    return { values: [], unresolved: [{ kind: "Reference:external", text: node.getText(), line: node.getStartLineNumber() }] };
  }
  if (fact.kind === "unresolved") {
    if (fact.reason === "dynamic" && (Node.isTemplateExpression(fact.node) || Node.isBinaryExpression(fact.node))) {
      return readValue(fact.node, seen, escaped);
    }
    return {
      values: [],
      unresolved: [{ kind: `Reference:${fact.reason}`, text: fact.node.getText(), line: fact.node.getStartLineNumber() }],
    };
  }
  if (collectionBindingEscapes(fact.value, fact.trace.declarations, escaped)) {
    return { values: [], unresolved: [{ kind: "Reference:write", text: node.getText(), line: node.getStartLineNumber() }] };
  }
  return readValue(fact.value, seen, escaped);
}

/** A template literal is readable only when EVERY substitution resolves to EXACTLY ONE string — a span that
 *  resolves to an array (or to nothing) has no single ordered value, so the whole template is refused. */
function readTemplate(node: Node, seen: Set<Node>, escaped: ReadonlySet<object>): StaticRead {
  if (!Node.isTemplateExpression(node)) {
    return refuse(node);
  }
  let acc = node.getHead().getLiteralText();
  const unresolved: UnresolvedShape[] = [];
  for (const span of node.getTemplateSpans()) {
    const part = readValue(span.getExpression(), seen, escaped);
    unresolved.push(...part.unresolved);
    if (part.values.length !== 1) {
      unresolved.push({ kind: "TemplateSpan", text: span.getExpression().getText(), line: span.getStartLineNumber() });
      return { values: [], unresolved };
    }
    acc += `${part.values[0] ?? ""}${span.getLiteral().getLiteralText()}`;
  }
  return unresolved.length > 0 ? { values: [], unresolved } : { values: [acc], unresolved: [] };
}

/** A `+` concatenation of two single-valued halves, in source order. Any other operator is refused. */
function readConcat(node: Node, seen: Set<Node>, escaped: ReadonlySet<object>): StaticRead {
  if (!Node.isBinaryExpression(node) || node.getOperatorToken().getText() !== "+") {
    return refuse(node);
  }
  const left = readValue(node.getLeft(), seen, escaped);
  const right = readValue(node.getRight(), seen, escaped);
  if (left.values.length !== 1 || right.values.length !== 1) {
    return merge([left, right, refuse(node)]);
  }
  return { values: [`${left.values[0] ?? ""}${right.values[0] ?? ""}`], unresolved: [...left.unresolved, ...right.unresolved] };
}

/** Evaluate an expression to the ORDERED set of strings it contributes. Arrays and spreads flatten; every
 *  unreadable shape lands in `unresolved` rather than being skipped.
 *
 *  `seen` fences a const CYCLE (`const A = [...B]; const B = [...A]`) and is maintained as the current
 *  RECURSION PATH — pushed before descending and POPPED after (see the `finally`). A set that merely
 *  accumulated every visited node would conflate "this is a cycle" with "this const was already used
 *  somewhere else in the expression", which is not a cycle at all: `.dependency-cruiser.cjs` spells
 *  `${UI}` nine times inside ONE `pathNot` array, and an accumulate-only fence refused eight of them —
 *  measured, and exactly the false-RED that would have blocked every lane's import-law floor. */
function readValue(node: Node, seen: Set<Node> = new Set(), escaped: ReadonlySet<object> = escapedCollectionSymbols(node.getSourceFile())): StaticRead {
  if (seen.has(node)) {
    return refuse(node);
  }
  seen.add(node);
  try {
    return readValueInner(node, seen, escaped);
  } finally {
    seen.delete(node);
  }
}

function readValueInner(node: Node, seen: Set<Node>, escaped: ReadonlySet<object>): StaticRead {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return { values: [node.getLiteralText()], unresolved: [] };
  }
  if (Node.isArrayLiteralExpression(node)) {
    return merge(node.getElements().map((el) => readValue(el, seen, escaped)));
  }
  if (Node.isSpreadElement(node)) {
    return readValue(node.getExpression(), seen, escaped);
  }
  if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isSatisfiesExpression(node)) {
    return readValue(node.getExpression(), seen, escaped);
  }
  if (Node.isIdentifier(node)) {
    return readIdentifier(node, seen, escaped);
  }
  if (Node.isTemplateExpression(node)) {
    return readTemplate(node, seen, escaped);
  }
  if (Node.isBinaryExpression(node)) {
    return readConcat(node, seen, escaped);
  }
  return refuse(node);
}

/** The ordered string evaluator's PUBLIC face (#910): evaluate ONE expression to the strings it provably
 *  contributes, plus every shape it could not read. Same contract as the row extractor (`createRowExtractor`) — a caller that ignores
 *  `unresolved` is printing a clean zero over a value it never read. Exported because a second reader of
 *  authored CODE strings (`enforcement-registry-parity`, comparing a doc row against a gate descriptor's
 *  runtime `message`) must not re-spell this evaluation: a hand-rolled `Node.isStringLiteral(x)` read is
 *  the literal-shape blindness class (GATE-AUTHORING.md §5), and every message in the gate corpus is built
 *  from `+`-concatenated fragments. */
export function readExpressionString(node: Node): StaticRead {
  return readValue(node);
}

/** Evaluate a finite expression batch while sharing only the source-level escape census. Each expression
 * keeps an independent recursion path, and the cache dies with this call, so mutation/alias refusal is
 * byte-identical to {@link readExpressionString} without rescanning a source for every candidate. */
export function readExpressionStrings(nodes: readonly Node[]): readonly StaticRead[] {
  const escapedBySource = new Map<SourceFile, ReadonlySet<object>>();
  return nodes.map((node) => {
    const source = node.getSourceFile();
    const escaped = escapedBySource.get(source) ?? escapedCollectionSymbols(source);
    escapedBySource.set(source, escaped);
    return readValue(node, new Set(), escaped);
  });
}

// ── the file reader ───────────────────────────────────────────────────────────────────────────────────
/** ONE scratch parser for exact code files outside the governed shared-workspace corpus. The root configs
 *  and Playwright's CT bootstrap are intentionally outside that corpus (`harnessGlobs` covers
 *  `packages/*​/src`, `tests/`, `tooling/src/` — never a root `.js`/`.cjs` or `playwright/`), so `getWorkspace()` structurally
 *  cannot serve them without widening every gate's jurisdiction. This is the `comment-spans.ts` /
 *  `baseui-read.ts` precedent and carries the reviewed grant `tooling-project-home:config-static-read`
 *  in `lib/reviewed-grants.ts` (the construction below is the licensed non-workspace Project).
 *  Each file is created at its OWN path, so the overwrite-identity trap (GATE-AUTHORING.md §5 — one reused SourceFile
 *  object answering every later call with the FIRST file's text) cannot arise between reads. */
let scratch: Project | undefined;

/** Lazily create the parser project. Importing the verify CLI must remain an argv-only operation so every
 * verb can answer `--help` under the small-heap contract without constructing a ts-morph Project. */
function scratchProject(): Project {
  scratch ??= new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  return scratch;
}

/** Parse one repo-relative source whose TEXT already arrived — the door a policy takes when the file
 *  came through a declared resource fact (`exact-file`) rather than off disk, so the ONE scratch parser
 *  serves a resource-fed read without the gate touching the filesystem. `missing` is the disk reader's
 *  verdict alone: a text that arrived has, by definition, been read. SYNTACTICALLY BROKEN refuses loudly. */
export function parseStaticSourceText(rel: string, text: string): Exclude<ConfigRead, { readonly kind: "missing" }> {
  const project = scratchProject();
  const sf = project.createSourceFile(rel, text, { overwrite: true });
  const diags = project.getProgram().getSyntacticDiagnostics(sf);
  const first = diags[0];
  if (first !== undefined) {
    const message = first.getMessageText();
    return { kind: "unparseable", detail: typeof message === "string" ? message : message.getMessageText() };
  }
  return { kind: "ok", sf, text };
}

/**
 * Read + parse one repo-relative source. Missing and SYNTACTICALLY BROKEN both refuse loudly.
 * @public knip false positive — no live importer; consumed at TEST RUNTIME by the frozen legacy `tooling-shared-plumbing` gate that tests/tooling/verify/gates/tooling-plumbing-family.test.ts git-shows at its pinned SHA and rewires to this live module.
 */
export function readStaticSource(root: string, rel: string): ConfigRead {
  const abs = `${root}/${rel}`;
  if (!existsSync(abs)) {
    return { kind: "missing" };
  }
  return parseStaticSourceText(rel, readFileSync(abs, "utf-8"));
}

type BoundExtractRequest = Omit<ExtractRequest, "sf">;
type RowExtractor = (request: BoundExtractRequest) => RowExtraction;

function extractRowsWith(
  request: BoundExtractRequest,
  escaped: ReadonlySet<object>,
  properties: readonly import("ts-morph").PropertyAssignment[],
): RowExtraction {
  const { rel, text, keys, classify } = request;
  const lineOf = lineFinder(text);
  const exact: ExactRow[] = [];
  const skippedRows: ExactRow[] = [];
  const unresolved: UnresolvedShape[] = [];
  let candidates = 0;
  let skipped = 0;
  for (const pa of properties) {
    const init = pa.getInitializer();
    if (!keys.includes(pa.getName().replaceAll(/['"]/gu, "")) || init === undefined) {
      continue;
    }
    const read = readValue(init, new Set(), escaped);
    unresolved.push(...read.unresolved);
    for (const value of read.values) {
      candidates += 1;
      const path = classify(value);
      const at = lineOf(value);
      const line = at === 0 ? pa.getStartLineNumber() : at;
      if (path === undefined) {
        skipped += 1;
        skippedRows.push({ file: rel, path: value, line });
        continue;
      }
      exact.push({ file: rel, path, line });
    }
  }
  return { candidates, exact, skipped, skippedRows, unresolved };
}

/** Invocation-local extractor for callers that classify several key families from one parsed source. */
export function createRowExtractor(sf: import("ts-morph").SourceFile): RowExtractor {
  const escaped = escapedCollectionSymbols(sf);
  const properties = sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment);
  return (request) => extractRowsWith(request, escaped, properties);
}
