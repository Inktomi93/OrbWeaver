// The Base UI PROP EXPANDER — the syntactic resolver behind every `Installed*` shape: it walks a part's
// `<Symbol>Props` declaration through intersections, `Omit`/`Pick`/passthrough helpers, namespace members
// and cross-file heritage, and records what it deliberately stopped at. Split out of lib/baseui-read.ts at
// the @orb/tooling P6 move (size cap §4.3); the algorithm is unchanged.
//
// DECLARED LIMIT: the surface is read SYNTACTICALLY off the shipped declarations — own-declared members of
// `<Symbol>Props` plus the heritage clause NAMES. Props inherited through `BaseUIComponentProps` (className,
// render, style, and the whole HTML attribute surface) are deliberately NOT expanded: they are universal,
// they are not what a seal re-spells by accident, and expanding them would make every gate keyed on this
// manifest fire on `className` in all ~40 seals (crunch item 5 — a separate, deliberate decision about our
// `cn()` seam, not this manifest's business).
import { dirname, join } from "node:path";
import type { InterfaceDeclaration, Project, SourceFile, TypeAliasDeclaration, TypeNode } from "ts-morph";
import { Node } from "ts-morph";
import type { InstalledPart } from "../contract/baseui.ts";

/** Where prop EXPANSION deliberately stops. `BaseUIComponentProps` (className/render/style + the whole HTML
 *  attribute surface) and the React prop helpers are universal: every part has them, no seal re-spells them
 *  by accident, and expanding them would drown every gate keyed on this manifest in `className`. The arm's
 *  TEXT is recorded in `inherits` instead, so a bump that changes its SHAPE is still a visible diff. */
const EXPANSION_STOPS = new Set([
  "BaseUIComponentProps",
  "NativeButtonProps",
  "NonNativeButtonProps",
  "HTMLProps",
  "ComponentPropsWithRef",
  "ComponentProps",
  "HTMLAttributes",
  "React",
]);
/** Mapped helpers the expander understands structurally rather than resolving. */
const OMIT_LIKE = new Set(["Omit"]);
const PICK_LIKE = new Set(["Pick"]);
const PASSTHROUGH = new Set(["Partial", "Required", "Readonly", "Simplify", "WithBaseUIEvent", "NoInfer"]);
/** Depth is bounded so a pathological alias chain can never hang the harness. MEASURED: `Combobox.Root`
 *  needs 10 hops (`ComboboxRootProps` → `&` → `Omit` → `AriaCombobox.Props` → `AriaComboboxProps` → `&` →
 *  the internal `ComboboxRootProps` interface). A cap of 8 truncated exactly there and reported 14 props
 *  instead of 44 — SILENTLY, on the one component crunch item 6 is about. Truncation is now RECORDED in
 *  `inherits` rather than dropped, so the next time the ceiling is hit the manifest says so out loud. */
const MAX_EXPANSION_DEPTH = 32;
/** Marker written into `inherits` when the depth cap cut an expansion short — never silence. */
export const TRUNCATED = "TRUNCATED:";

const JS_EXT_RE = /\.js$/u;

/** `./root/SelectRoot.js` → the `.d.ts` beside it. */
export function declarationFile(project: Project, fromDir: string, specifier: string): SourceFile | undefined {
  return project.getSourceFile(join(fromDir, specifier.replace(JS_EXT_RE, ".d.ts")));
}

interface Expansion {
  readonly props: Set<string>;
  /** prop name → parameter count of the function signature in its type (absent = not a handler). */
  readonly handlers: Map<string, number>;
  /** Arms the expander deliberately stopped at or could not resolve, as written. */
  readonly inherits: Set<string>;
}

function emptyExpansion(): Expansion {
  return { props: new Set(), handlers: new Map(), inherits: new Set() };
}

/** The function signature inside a prop's declared type, seen through the `((…) => R) | undefined` union
 *  and parenthesis wrappers Base UI writes every handler in. Returns the PARAMETER COUNT, or undefined when
 *  the type carries no signature at all. A union-blind reader would classify every Base UI handler as a
 *  plain value — the §5 literal-shape blindness class, applied to types. */
export function signatureArity(node: TypeNode | undefined): number | undefined {
  // ONE return path (the pass.ts idiom): tsc's noImplicitReturns wants every path to return, biome calls a
  // bare `return undefined;` useless — an accumulator satisfies both without suppressing either.
  let arity: number | undefined;
  if (node !== undefined && Node.isFunctionTypeNode(node)) {
    arity = node.getParameters().length;
  } else if (node !== undefined && Node.isParenthesizedTypeNode(node)) {
    arity = signatureArity(node.getTypeNode());
  } else if (node !== undefined && Node.isUnionTypeNode(node)) {
    arity = node
      .getTypeNodes()
      .map((arm) => signatureArity(arm))
      .find((found) => found !== undefined);
  }
  return arity;
}

/** Record one property's name — and its handler arity when it has a signature. */
function addProperty(into: Expansion, name: string, typeNode: TypeNode | undefined): void {
  into.props.add(name);
  const arity = signatureArity(typeNode);
  if (arity !== undefined && !into.handlers.has(name)) {
    into.handlers.set(name, arity);
  }
}

/** A named type applied to arguments, as reached from EITHER a `TypeReference` node or an interface's
 *  heritage clause — two different node kinds carrying the same information. Normalizing to one shape is
 *  what stops the heritage path from quietly resolving fewer helpers than the alias path. */
interface TypeRef {
  readonly head: string;
  readonly args: readonly TypeNode[];
  readonly text: string;
}

/** One position in the walk: which package Project, which file, how deep, and the cycle guard (SHARED by
 *  reference across the whole walk — the position is what changes, not the memory). Bundling these is not
 *  cosmetic: the recursion is four mutually-calling arms deep, and threading `project`/`seen` by hand
 *  through every one is how an arm ends up with its own empty guard and silently re-walks a cycle. */
interface Walk {
  readonly project: Project;
  readonly sf: SourceFile;
  readonly depth: number;
  readonly seen: Set<string>;
}

/** One hop deeper, optionally crossing into another file. */
function descend(w: Walk, sf: SourceFile = w.sf): Walk {
  return { project: w.project, sf, depth: w.depth + 1, seen: w.seen };
}

const WHITESPACE_RUN = /\s+/gu;

function flat(node: Node): string {
  return node.getText().replace(WHITESPACE_RUN, " ");
}

/** The string keys inside a `'a' | 'b'` union (or a single literal) — an `Omit`/`Pick` key argument. */
function literalKeys(node: TypeNode): string[] {
  if (Node.isLiteralTypeNode(node)) {
    const literal = node.getLiteral();
    return Node.isStringLiteral(literal) ? [literal.getLiteralText()] : [];
  }
  if (Node.isUnionTypeNode(node)) {
    return node.getTypeNodes().flatMap(literalKeys);
  }
  return [];
}

/** Merge `from` into `into`, keeping only the props `keep` admits. */
function mergeProps(into: Expansion, from: Expansion, keep: (name: string) => boolean): void {
  for (const name of from.props) {
    if (!keep(name)) {
      continue;
    }
    into.props.add(name);
    const arity = from.handlers.get(name);
    if (arity !== undefined && !into.handlers.has(name)) {
      into.handlers.set(name, arity);
    }
  }
  for (const arm of from.inherits) {
    into.inherits.add(arm);
  }
}

/** The declaration named by `NS.Member` inside `w.sf`, when the namespace is declared there. */
function namespacedDeclaration(w: Walk, head: string, member: string): InterfaceDeclaration | TypeAliasDeclaration | undefined {
  const ns = w.sf.getModule(head);
  return ns?.getTypeAlias(member) ?? ns?.getInterface(member);
}

/** The file a RELATIVE import of `head` resolves to, when this file imports that name. */
function importedFileFor(w: Walk, head: string): SourceFile | undefined {
  const imp = w.sf
    .getImportDeclarations()
    .find(
      (d) => d.getModuleSpecifierValue().startsWith(".") && d.getNamedImports().some((spec) => (spec.getAliasNode()?.getText() ?? spec.getName()) === head),
    );
  return imp === undefined ? undefined : declarationFile(w.project, dirname(w.sf.getFilePath()), imp.getModuleSpecifierValue());
}

/** Find the declaration a type NAME refers to, following the file's own imports one hop at a time. Handles
 *  `Foo`, and the namespace form `NS.Member` used by Base UI's internal `AriaCombobox.Props`. */
function findDeclaration(w: Walk, name: string): { sf: SourceFile; node: InterfaceDeclaration | TypeAliasDeclaration } | undefined {
  const [head, member] = name.split(".");
  if (head === undefined) {
    return;
  }
  const local = member === undefined ? (w.sf.getInterface(head) ?? w.sf.getTypeAlias(head)) : namespacedDeclaration(w, head, member);
  if (local !== undefined) {
    return { sf: w.sf, node: local };
  }
  const target = importedFileFor(w, head);
  return target === undefined ? undefined : findDeclaration(descend(w, target), name);
}

function expandRef(w: Walk, ref: TypeRef, into: Expansion): void {
  if (EXPANSION_STOPS.has(ref.head) || ref.head.startsWith("React.")) {
    into.inherits.add(ref.text);
    return;
  }
  const [first, second] = ref.args;
  if (first !== undefined && second !== undefined && (OMIT_LIKE.has(ref.head) || PICK_LIKE.has(ref.head))) {
    const inner = emptyExpansion();
    expandType(descend(w), first, inner);
    const keys = new Set(literalKeys(second));
    mergeProps(into, inner, (name) => (OMIT_LIKE.has(ref.head) ? !keys.has(name) : keys.has(name)));
    return;
  }
  if (first !== undefined && PASSTHROUGH.has(ref.head)) {
    expandType(descend(w), first, into);
    return;
  }
  const found = findDeclaration(w, ref.head);
  if (found === undefined) {
    into.inherits.add(ref.text);
    return;
  }
  expandDeclaration(descend(w, found.sf), found.node, into);
}

function expandType(w: Walk, node: TypeNode, into: Expansion): void {
  if (w.depth > MAX_EXPANSION_DEPTH) {
    into.inherits.add(`${TRUNCATED}${flat(node)}`);
    return;
  }
  if (Node.isTypeLiteral(node)) {
    for (const p of node.getProperties()) {
      addProperty(into, p.getName(), p.getTypeNode());
    }
    return;
  }
  if (Node.isIntersectionTypeNode(node) || Node.isUnionTypeNode(node)) {
    for (const arm of node.getTypeNodes()) {
      expandType(descend(w), arm, into);
    }
    return;
  }
  if (Node.isParenthesizedTypeNode(node)) {
    expandType(descend(w), node.getTypeNode(), into);
    return;
  }
  if (Node.isTypeReference(node)) {
    expandRef(w, { head: node.getTypeName().getText(), args: node.getTypeArguments(), text: flat(node) }, into);
    return;
  }
  into.inherits.add(flat(node));
}

function expandDeclaration(w: Walk, decl: InterfaceDeclaration | TypeAliasDeclaration, into: Expansion): void {
  const key = `${w.sf.getFilePath()}#${decl.getName()}`;
  if (w.seen.has(key)) {
    return;
  }
  if (w.depth > MAX_EXPANSION_DEPTH) {
    into.inherits.add(`${TRUNCATED}${decl.getName()}`);
    return;
  }
  w.seen.add(key);
  if (Node.isInterfaceDeclaration(decl)) {
    for (const p of decl.getProperties()) {
      addProperty(into, p.getName(), p.getTypeNode());
    }
    for (const h of decl.getExtends()) {
      expandRef(descend(w), { head: h.getExpression().getText(), args: h.getTypeArguments(), text: flat(h) }, into);
    }
    return;
  }
  const body = decl.getTypeNode();
  if (body !== undefined) {
    expandType(descend(w), body, into);
  }
}

/** Fully expand `<name>` declared in `sf`, on a fresh cycle guard. */
function expandNamed(project: Project, sf: SourceFile, name: string): Expansion | undefined {
  const decl = sf.getInterface(name) ?? sf.getTypeAlias(name);
  if (decl === undefined) {
    return;
  }
  const into = emptyExpansion();
  expandDeclaration({ project, sf, depth: 0, seen: new Set() }, decl, into);
  return into;
}

/** The prop + state surface of `<symbol>Props` / `<symbol>State`, fully expanded. `undefined` = this export
 *  declares no Props type at all, so it is a hook or a type re-export, not an anatomy part.
 *
 *  WHY NOT `getProperties()` ON THE INTERFACE AND STOP (the blind spot the expander replaced):
 *  `ComboboxRootProps` is a TYPE ALIAS whose right-hand side is `Omit<AriaCombobox.Props<…>, …> & { … }`, so
 *  a TypeLiteral-only reader returned ZERO props for the single component crunch item 6 is about — a gate
 *  keyed on that would have been silently, confidently green (tooling/src/verify/gates/GATE-AUTHORING.md §5, literal-shape blindness). */
export function propsOf(project: Project, sf: SourceFile, symbol: string): Omit<InstalledPart, "kind" | "symbol" | "from"> | undefined {
  const props = expandNamed(project, sf, `${symbol}Props`);
  if (props === undefined) {
    return;
  }
  const state = expandNamed(project, sf, `${symbol}State`);
  return {
    props: [...props.props].sort(),
    handlers: Object.fromEntries([...props.handlers.entries()].sort(([a], [b]) => a.localeCompare(b))),
    state: state === undefined ? [] : [...state.props].sort(),
    inherits: [...props.inherits].sort(),
  };
}
