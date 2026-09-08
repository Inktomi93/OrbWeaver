// The AUTHORING CONTROL behind #1506: mechanically RESPELL a gate's own `mustFlag` fixture into the two
// spellings that escaped 21 live gates at once, so a gate cannot ship blind to them.
//
// A gate's conformance rows prove it bites THE SHAPE ITS AUTHOR WROTE. Nothing proved it bites the same
// semantics written another way — and that is the hole this module closes at the harness level rather than
// gate by gate: `tests/tooling/gate-conformance.repo.int.test.ts` feeds each twin back through the SAME
// `verifyGateProofs` door and requires the gate to stay red.
//
//  • BRACKET twin — every `x.foo` in the fixture becomes `x["foo"]`. Same member, different node kind
//    (ElementAccessExpression), invisible to a `PropertyAccessExpression`-keyed detector.
//  • NAMESPACE twin — `import { foo } from "m"; foo(…)` becomes `import * as ns from "m"; ns.foo(…)`.
//    Same reference, and it produces NO ImportSpecifier at all, so an import-specifier-keyed detector
//    never sees a node.
//
// A twin is REFUSED (undefined) rather than guessed whenever the rewrite could change what the fixture
// MEANS — a JSX tag name, a shorthand property, a re-exported binding. A refusal is a value the caller
// counts and reports; it is never silently the same as "the gate is fine" (the bare-zero law).
import type { ImportDeclaration, SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { SpellingTwin } from "../contract/spelling-twins.ts";

/** One scratch project for every rewrite in a process. Each parse lands at its OWN virtual path — never
 *  re-create a path on a reused Project (GATE-AUTHORING.md §12: a re-created SourceFile restarts its
 *  script version and the language service then serves the PREVIOUS document). */
const scratch = new Project({ useInMemoryFileSystem: true });
let parseSeq = 0;

function parse(source: string, extension: string): ReturnType<Project["createSourceFile"]> {
  parseSeq += 1;
  return scratch.createSourceFile(`/twin-${parseSeq}/x${extension}`, source);
}

/** A rewrite as (start, end, replacement) on the ORIGINAL text — applied end-first so earlier offsets stay
 *  valid. */
interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function applyEdits(source: string, edits: readonly Edit[]): string {
  let out = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

/** Is this property access in a position where `x["y"]` is not legal, or not the same thing?
 *  A JSX tag name (`<Foo.Bar />`) and a qualified type name cannot take bracket syntax at all. */
function bracketWouldBreak(access: Node): boolean {
  const parent = access.getParent();
  if (parent === undefined) {
    return true;
  }
  return (
    Node.isJsxOpeningElement(parent) ||
    Node.isJsxSelfClosingElement(parent) ||
    Node.isJsxClosingElement(parent) ||
    // A decorator/`new.target`-style meta property and an import-type qualifier are not member reads.
    Node.isImportTypeNode(parent)
  );
}

/** `x.foo` → `x["foo"]` for every real member read ON THE FOCUSED LINES. Returns undefined when there is
 *  nothing to respell there — no twin to demand, so demanding one would be a false red.
 *
 *  THE FOCUS IS THE WHOLE DESIGN (#1506, measured). Respelling a fixture WHOLESALE asks 255 gates a
 *  question most of them are not about: rewriting a DEFINITION (`sqliteTable("t", { c: text("c") })`,
 *  a zod chain, a `tv()` recipe) into bracket form does not respell the subject, it destroys it — the
 *  unfocused sweep produced 333 "expected a finding, got 0" and 30 tool errors, almost all false. The
 *  focused twin respells only what the gate ITSELF reported, so the question is always the honest one:
 *  "the thing you flagged, written the other way — do you still flag it?" */
export function bracketTwinOnLines(source: string, lines: ReadonlySet<number>, extension = ".ts"): string | undefined {
  const sf = parse(source, extension);
  const edits: Edit[] = [];
  for (const access of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (bracketWouldBreak(access) || !lines.has(access.getStartLineNumber())) {
      continue;
    }
    const nameNode = access.getNameNode();
    if (!Node.isIdentifier(nameNode)) {
      continue;
    }
    // Replace `.name` (or keep `?.` and replace `name` with `["name"]`) — the dot sits immediately before
    // the name node for a plain access; for an optional access the `?.` token precedes it.
    const dotStart = access.getQuestionDotTokenNode()?.getEnd() ?? access.getExpression().getEnd();
    edits.push({ start: dotStart, end: nameNode.getEnd(), text: `["${nameNode.getText()}"]` });
  }
  return edits.length === 0 ? undefined : applyEdits(source, edits);
}

/** Is this identifier reference safe to replace with `ns.name`? A shorthand property (`{ foo }`), a JSX tag
 *  name and an export specifier all change meaning under the rewrite. */
function namespaceWouldBreak(reference: Node): boolean {
  const parent = reference.getParent();
  if (parent === undefined) {
    return true;
  }
  return (
    Node.isShorthandPropertyAssignment(parent) ||
    Node.isExportSpecifier(parent) ||
    Node.isImportSpecifier(parent) ||
    Node.isJsxOpeningElement(parent) ||
    Node.isJsxSelfClosingElement(parent) ||
    Node.isJsxClosingElement(parent) ||
    Node.isBindingElement(parent) ||
    (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === reference)
  );
}

/** One import declaration's local→imported bindings, or undefined when this declaration cannot be turned
 *  into a namespace import at all (no named members, type-only, or a default import beside them). */
function convertibleBindings(declaration: ImportDeclaration): readonly { readonly local: string; readonly imported: string }[] | undefined {
  const named = declaration.getNamedImports();
  if (named.length === 0 || declaration.isTypeOnly() || declaration.getDefaultImport() !== undefined) {
    return;
  }
  if (named.some((specifier) => specifier.isTypeOnly())) {
    return; // a type-only member has no runtime namespace member to read
  }
  return named.map((specifier) => ({ local: specifier.getAliasNode()?.getText() ?? specifier.getName(), imported: specifier.getName() }));
}

/** The edits that rewrite every reference to `bindings` into `<alias>.<imported>`, or undefined when ANY
 *  reference sits in a position the rewrite would change the meaning of (the refusal, not a partial job). */
function referenceEdits(sf: SourceFile, bindings: readonly { readonly local: string; readonly imported: string }[], alias: string): Edit[] | undefined {
  const edits: Edit[] = [];
  for (const identifier of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const binding = bindings.find((b) => b.local === identifier.getText());
    if (binding === undefined || identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) !== undefined) {
      continue;
    }
    if (namespaceWouldBreak(identifier)) {
      return;
    }
    edits.push({ start: identifier.getStart(), end: identifier.getEnd(), text: `${alias}.${binding.imported}` });
  }
  return edits.length === 0 ? undefined : edits;
}

/** `import { a, b as c } from "m"` → `import * as __twin0 from "m"`, with every reference rewritten to
 *  `__twin0.a` / `__twin0.b`. Converts only declarations the FOCUSED LINES touch (see `bracketTwinOnLines`
 *  for why the focus is load-bearing). Returns undefined when there is nothing to convert, or when any
 *  reference sits in a position the rewrite would change the meaning of. */
export function namespaceTwinOnLines(source: string, lines: ReadonlySet<number>, extension = ".ts"): string | undefined {
  const sf = parse(source, extension);
  const edits: Edit[] = [];
  for (const [index, declaration] of sf.getImportDeclarations().entries()) {
    const bindings = convertibleBindings(declaration);
    if (bindings === undefined) {
      continue;
    }
    const alias = `__twin${index}`;
    const references = referenceEdits(sf, bindings, alias);
    // The import itself, or one of the references it binds, must be on a reported line — otherwise this
    // declaration is not what the gate judged and converting it asks a question about somebody else.
    if (
      references === undefined ||
      !(lines.has(declaration.getStartLineNumber()) || references.some((edit) => lines.has(sf.getLineAndColumnAtPos(edit.start).line)))
    ) {
      continue;
    }
    edits.push(
      { start: declaration.getStart(), end: declaration.getEnd(), text: `import * as ${alias} from ${JSON.stringify(declaration.getModuleSpecifierValue())};` },
      ...references,
    );
  }
  return edits.length === 0 ? undefined : applyEdits(source, edits);
}

/** Both twins of one fixture file set, focused on the lines the gate REPORTED (`file -> reported lines`).
 *  Each arm is `undefined` when this fixture has nothing of that shape on those lines — a refusal the
 *  caller counts and prints, never a silent pass. */
export function spellingTwinsOf(files: Readonly<Record<string, string>>, reported: ReadonlyMap<string, ReadonlySet<number>>): SpellingTwin {
  const bracket: Record<string, string> = {};
  const namespaced: Record<string, string> = {};
  let bracketChanged = false;
  let namespaceChanged = false;
  for (const [path, source] of Object.entries(files)) {
    const extension = path.endsWith(".tsx") ? ".tsx" : ".ts";
    const lines = reported.get(path);
    const asBracket = lines === undefined ? undefined : bracketTwinOnLines(source, lines, extension);
    const asNamespace = lines === undefined ? undefined : namespaceTwinOnLines(source, lines, extension);
    bracket[path] = asBracket ?? source;
    namespaced[path] = asNamespace ?? source;
    bracketChanged = bracketChanged || asBracket !== undefined;
    namespaceChanged = namespaceChanged || asNamespace !== undefined;
  }
  return {
    bracket: bracketChanged ? bracket : undefined,
    namespace: namespaceChanged ? namespaced : undefined,
  };
}
