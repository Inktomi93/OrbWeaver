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
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ConfigRead, ExtractRequest, RowExtraction, StaticRead, UnresolvedShape } from "../contract/config-read.ts";
import type { ExactRow } from "./grant-liveness.ts";
import { lineFinder } from "./grant-liveness.ts";

export type { ConfigRead, ExtractRequest, RowExtraction } from "../contract/config-read.ts";

const EMPTY: StaticRead = { values: [], unresolved: [] };

function refuse(node: Node): StaticRead {
  return { values: [], unresolved: [{ kind: node.getKindName(), text: node.getText(), line: node.getStartLineNumber() }] };
}

function merge(parts: readonly StaticRead[]): StaticRead {
  return {
    values: parts.flatMap((p) => p.values),
    unresolved: parts.flatMap((p) => p.unresolved),
  };
}

/** Resolve an identifier through its ONE variable declaration's initializer. A `const` with no initializer,
 *  a parameter, an import, or a re-assigned binding is refused rather than guessed. */
function readIdentifier(node: Node, seen: Set<Node>): StaticRead {
  const decl = node.getSymbol()?.getDeclarations()[0];
  if (decl === undefined || !Node.isVariableDeclaration(decl)) {
    return refuse(node);
  }
  const init = decl.getInitializer();
  return init === undefined ? refuse(node) : readValue(init, seen);
}

/** A template literal is readable only when EVERY substitution resolves to EXACTLY ONE string — a span that
 *  resolves to an array (or to nothing) has no single ordered value, so the whole template is refused. */
function readTemplate(node: Node, seen: Set<Node>): StaticRead {
  if (!Node.isTemplateExpression(node)) {
    return refuse(node);
  }
  let acc = node.getHead().getLiteralText();
  const unresolved: UnresolvedShape[] = [];
  for (const span of node.getTemplateSpans()) {
    const part = readValue(span.getExpression(), seen);
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
function readConcat(node: Node, seen: Set<Node>): StaticRead {
  if (!Node.isBinaryExpression(node) || node.getOperatorToken().getText() !== "+") {
    return refuse(node);
  }
  const left = readValue(node.getLeft(), seen);
  const right = readValue(node.getRight(), seen);
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
function readValue(node: Node, seen: Set<Node> = new Set()): StaticRead {
  if (seen.has(node)) {
    return EMPTY;
  }
  seen.add(node);
  try {
    return readValueInner(node, seen);
  } finally {
    seen.delete(node);
  }
}

function readValueInner(node: Node, seen: Set<Node>): StaticRead {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return { values: [node.getLiteralText()], unresolved: [] };
  }
  if (Node.isArrayLiteralExpression(node)) {
    return merge(node.getElements().map((el) => readValue(el, seen)));
  }
  if (Node.isSpreadElement(node)) {
    return readValue(node.getExpression(), seen);
  }
  if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isSatisfiesExpression(node)) {
    return readValue(node.getExpression(), seen);
  }
  if (Node.isIdentifier(node)) {
    return readIdentifier(node, seen);
  }
  if (Node.isTemplateExpression(node)) {
    return readTemplate(node, seen);
  }
  if (Node.isBinaryExpression(node)) {
    return readConcat(node, seen);
  }
  return refuse(node);
}

// ── the file reader ───────────────────────────────────────────────────────────────────────────────────
/** ONE scratch parser for exact code files outside the governed shared-workspace corpus. The root configs
 *  and Playwright's CT bootstrap are intentionally outside that corpus (`harnessGlobs` covers
 *  `packages/*​/src`, `tests/`, `tooling/src/` — never a root `.js`/`.cjs` or `playwright/`), so `getWorkspace()` structurally
 *  cannot serve them without widening every gate's jurisdiction. This is the `comment-spans.ts` /
 *  `baseui-read.ts` precedent and carries a cited `PROJECT_SITES` row in `tooling-shared-plumbing.ts`.
 *  Each file is created at its OWN path, so the overwrite-identity trap (GATE-AUTHORING.md §5 — one reused SourceFile
 *  object answering every later call with the FIRST file's text) cannot arise between reads. */
const scratch = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });

/** Read + parse one repo-relative source. Missing and SYNTACTICALLY BROKEN both refuse loudly. */
export function readStaticSource(root: string, rel: string): ConfigRead {
  const abs = `${root}/${rel}`;
  if (!existsSync(abs)) {
    return { kind: "missing" };
  }
  const text = readFileSync(abs, "utf-8");
  const sf = scratch.createSourceFile(rel, text, { overwrite: true });
  const diags = scratch.getProgram().getSyntacticDiagnostics(sf);
  const first = diags[0];
  if (first !== undefined) {
    const message = first.getMessageText();
    return { kind: "unparseable", detail: typeof message === "string" ? message : message.getMessageText() };
  }
  return { kind: "ok", sf, text };
}

/** Config-owner spelling retained for the two registry readers; parsing still has one implementation. */
export function readConfigSource(root: string, rel: string): ConfigRead {
  return readStaticSource(root, rel);
}

/** Walk a parsed config for the given property KEYS, statically evaluate each value, and classify it.
 *  Every unreadable shape is carried out in `unresolved` — the caller MUST fail loud on a non-empty list;
 *  a shape this cannot read is never a clean zero. */
export function extractRows(request: ExtractRequest): RowExtraction {
  const { sf, rel, text, keys, classify } = request;
  const lineOf = lineFinder(text);
  const exact: ExactRow[] = [];
  const unresolved: UnresolvedShape[] = [];
  let candidates = 0;
  let skipped = 0;
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const init = pa.getInitializer();
    if (!keys.includes(pa.getName().replaceAll(/['"]/gu, "")) || init === undefined) {
      continue;
    }
    const read = readValue(init);
    unresolved.push(...read.unresolved);
    for (const value of read.values) {
      candidates += 1;
      const path = classify(value);
      if (path === undefined) {
        skipped += 1;
        continue;
      }
      // Anchor at the VALUE's own literal line when the raw text carries it (a const-resolved or
      // template-built value has no literal of its own — those fall back to the property's line).
      const at = lineOf(value);
      exact.push({ file: rel, path, line: at === 0 ? pa.getStartLineNumber() : at });
    }
  }
  return { candidates, exact, skipped, unresolved };
}
