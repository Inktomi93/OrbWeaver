// Drops the `className` prop from the seals a map names, because no caller supplies one: the seal's props interface loses
// `className?: string` (its `Omit<Base, "className">` stays, so an override fails to compile), the component's own
// destructure loses `className`, `slots.x({ className })` becomes `slots.x()` and `className={className}` goes. A
// component whose body uses `className` any other way keeps its remaining references and fails typecheck, which is the
// signal to restore it by hand. An import left unused is Biome's to remove.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_MAP_FILE = "codemod-drop-classname-map.json";
const PROP = "className";
const SPACE = 0x20;
const TAB = 0x09;
const NEWLINE = 0x0a;

const FILE: RuleConfig<TSX> = { rule: { kind: "program" } };

export const getSelector: GetSelector<TSX> = () => FILE;

function readNames(targetDir: string, mapFile: string): ReadonlySet<string> {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  const components = (parsed as { components?: unknown } | null)?.components;
  if (!Array.isArray(components) || components.some((name) => typeof name !== "string")) {
    throw new Error(`${mapFile}: expected { components: string[] }`);
  }
  return new Set(components as string[]);
}

function namedChildren(node: SgNode<TSX>): readonly SgNode<TSX>[] {
  return node.children().filter((child) => child.isNamed());
}

/** The prop declaration, its terminator and the doc comment directly above it, as whole lines. Offsets are UTF-8 bytes. */
function removeDeclaration(root: SgNode<TSX>, property: SgNode<TSX>): readonly Edit[] {
  const bytes = new TextEncoder().encode(root.text());
  const terminator = property.next();
  const closer = terminator?.text() === ";" || terminator?.text() === "," ? terminator : property;
  const above = property.prev();
  let startPos = (above?.kind() === "comment" ? above : property).range().start.index;
  let endPos = closer.range().end.index;
  while (startPos > 0 && (bytes[startPos - 1] === SPACE || bytes[startPos - 1] === TAB)) {
    startPos -= 1;
  }
  while (bytes[endPos] === SPACE || bytes[endPos] === TAB) {
    endPos += 1;
  }
  if (startPos > 0 && bytes[startPos - 1] !== NEWLINE) {
    return [{ startPos: property.range().start.index, endPos: closer.range().end.index, insertedText: "" }];
  }
  return [{ startPos, endPos: bytes[endPos] === NEWLINE ? endPos + 1 : endPos, insertedText: "" }];
}

const isPropDeclaration = (member: SgNode<TSX>): boolean => member.kind() === "property_signature" && member.field("name")?.text() === PROP;

function propsInterface(root: SgNode<TSX>, name: string): SgNode<TSX> | null {
  return root.find({ rule: { kind: "interface_declaration", has: { field: "name", regex: `^${name}Props$` } } });
}

function propsInterfaceEdits(root: SgNode<TSX>, name: string): readonly Edit[] {
  const declaration = propsInterface(root, name);
  const body = declaration?.field("body");
  if (body === null || body === undefined || emptyInterfaceEdits(root, name).length > 0) {
    return [];
  }
  return namedChildren(body)
    .filter(isPropDeclaration)
    .flatMap((member) => removeDeclaration(root, member));
}

function patternEdit(pattern: SgNode<TSX>): readonly Edit[] {
  const entries = namedChildren(pattern);
  const dropsProp = entries.some((entry) => entry.kind() === "shorthand_property_identifier_pattern" && entry.text() === PROP);
  const kept = entries.filter((entry) => entry.text() !== PROP);
  const [only] = kept;
  // A pattern left holding just its rest binds the whole object: name the object instead of destructuring it.
  if (kept.length === 1 && only?.kind() === "rest_pattern") {
    return [pattern.replace(only.text().replace(/^\.\.\./u, ""))];
  }
  return dropsProp && kept.length > 0 ? [pattern.replace(`{ ${kept.map((entry) => entry.text()).join(", ")} }`)] : [];
}

function argumentEdit(args: SgNode<TSX>): readonly Edit[] {
  const [only, ...rest] = namedChildren(args);
  if (only?.kind() !== "object" || rest.length > 0) {
    return [];
  }
  const members = namedChildren(only);
  return members.length === 1 && members[0]?.kind() === "shorthand_property_identifier" && members[0].text() === PROP ? [args.replace("()")] : [];
}

/** `cn(base, className)` is `base` once there is no className to merge. */
function mergeEdit(call: SgNode<TSX>): readonly Edit[] {
  const [base, last, ...rest] = namedChildren(call.field("arguments") ?? call);
  return call.field("function")?.text() === "cn" && base !== undefined && last?.kind() === "identifier" && last.text() === PROP && rest.length === 0
    ? [call.replace(base.text())]
    : [];
}

function attributeEdit(attribute: SgNode<TSX>): readonly Edit[] {
  const value = attribute.child(2);
  const inner = value?.kind() === "jsx_expression" ? namedChildren(value)[0] : undefined;
  return attribute.child(0)?.text() === PROP && inner?.kind() === "identifier" && inner.text() === PROP ? [attribute.replace("")] : [];
}

/** The comma-separated parents of an `extends` clause, split where no generic is open. */
function splitTopLevel(text: string): readonly string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === "<" || char === "(") {
      depth += 1;
    } else if (char === ">" || char === ")") {
      depth -= 1;
    }
    if (char === "," && depth === 0) {
      parts.push(text.slice(from, at).trim());
      from = at + 1;
    }
  }
  return [...parts, text.slice(from).trim()];
}

/** A seal whose parents already omit `className` is the only one safe to drop it from: a parent that keeps its own `className` would accept it again, and `{...rest}` would let it override the seal's classes. */
function omitsClassName(root: SgNode<TSX>, name: string): boolean {
  return (
    propsInterface(root, name)
      ?.children()
      .find((child) => child.kind() === "extends_type_clause")
      ?.text() ?? ""
  ).includes(`"${PROP}"`);
}

/** An interface left with no members and one parent is that parent's type: `interface X extends T {}` becomes `type X = T;`. */
function emptyInterfaceEdits(root: SgNode<TSX>, name: string): readonly Edit[] {
  const declaration = propsInterface(root, name);
  const body = declaration?.field("body");
  const heritage = declaration?.children().filter((child) => child.kind() === "extends_type_clause") ?? [];
  if (
    declaration === null ||
    body === null ||
    body === undefined ||
    namedChildren(body).some((member) => !isPropDeclaration(member)) ||
    heritage.length !== 1
  ) {
    return [];
  }
  const parents = splitTopLevel((heritage[0]?.text() ?? "").replace(/^extends\s+/u, ""));
  return [declaration.replace(`type ${name}Props = ${parents.join(" & ")};`)];
}

function componentEdits(root: SgNode<TSX>, name: string): readonly Edit[] {
  const fn = root.find({ rule: { kind: "function_declaration", has: { field: "name", regex: `^${name}$` } } });
  if (fn === null || !omitsClassName(root, name)) {
    return [];
  }
  return [
    ...propsInterfaceEdits(root, name),
    ...emptyInterfaceEdits(root, name),
    ...fn.findAll({ rule: { kind: "object_pattern" } }).flatMap(patternEdit),
    ...fn.findAll({ rule: { kind: "arguments" } }).flatMap(argumentEdit),
    ...fn.findAll({ rule: { kind: "call_expression" } }).flatMap(mergeEdit),
    ...fn.findAll({ rule: { kind: "jsx_attribute" } }).flatMap(attributeEdit),
  ];
}

const codemod: Codemod<TSX> = (root, options) => {
  const names = readNames(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  const rootNode = root.root();
  const edits = [...names].flatMap((name) => componentEdits(rootNode, name));
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
