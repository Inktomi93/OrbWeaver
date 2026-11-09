// The published plugin SDK as a receiver: third-party guests compile against its declarations, so a plugin contract field
// the SDK publishes is read outside the tree. The SDK mirrors `packages/contracts/src/plugin/` by type name, or by slot
// where it spells a contract type inline (a function's return or parameter, a member's type).
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const SDK_FILES = [
  "packages/plugin-sdk/shared.d.ts",
  "packages/plugin-sdk/main.d.ts",
  "packages/plugin-sdk/ui.d.ts",
  "packages/plugin-sdk/frame.d.ts",
] as const;

// The guest-facing plugin contract the SDK mirrors.
const PLUGIN_CONTRACT = "packages/contracts/src/plugin/";

// Generic types that hold a value without naming its shape: a slot through them is the slot of their arguments.
const HOLDERS: ReadonlySet<string> = new Set(["Promise", "PromiseLike", "Array", "ReadonlyArray", "Readonly"]);

/** The type a schema home mirrors by name: `pluginManifestSchema` is `PluginManifest`. */
export const typeNameOf = (home: string): string => {
  const [head = "", ...rest] = home.split(".");
  const named = head.endsWith("Schema") ? `${head.charAt(0).toUpperCase()}${head.slice(1, -"Schema".length)}` : head;
  return [named, ...rest].join(".");
};

/** What the SDK publishes, and where the plugin contract puts each of its named types. */
export interface SdkSurface {
  /** `Home.member` (a nested literal as `Home.outer.member`, a slot as `Home.fn().member`) to its SDK `file:line`. */
  readonly published: ReadonlyMap<string, string>;
  /** Each contract type name to the slots that hold it, `Home.fn()` or `Home.fn(0)` or `Home.member`. */
  readonly slots: ReadonlyMap<string, readonly string[]>;
}

type NamedMember = (ts.PropertySignature | ts.MethodSignature) & { readonly name: ts.Identifier | ts.StringLiteral };

const isNamedMember = (member: ts.TypeElement): member is NamedMember =>
  (ts.isPropertySignature(member) || ts.isMethodSignature(member)) && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name));

// The types a slot holds, through parentheses, unions, `readonly`, arrays and the holder generics.
function heldTypes(type: ts.TypeNode): readonly ts.TypeNode[] {
  if (ts.isParenthesizedTypeNode(type) || ts.isTypeOperatorNode(type)) {
    return heldTypes(type.type);
  }
  if (ts.isUnionTypeNode(type)) {
    return type.types.flatMap(heldTypes);
  }
  if (ts.isArrayTypeNode(type)) {
    return heldTypes(type.elementType);
  }
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && HOLDERS.has(type.typeName.text)) {
    return (type.typeArguments ?? []).flatMap(heldTypes);
  }
  return [type];
}

type SlotVisitor = (slot: string, type: ts.TypeNode) => void;

function walkSignature(slot: string, signature: ts.SignatureDeclarationBase, visit: SlotVisitor): void {
  if (signature.type !== undefined) {
    walkSlot(`${slot}()`, signature.type, visit);
  }
  for (const [at, parameter] of signature.parameters.entries()) {
    if (parameter.type !== undefined) {
      walkSlot(`${slot}(${String(at)})`, parameter.type, visit);
    }
  }
}

function walkSlot(slot: string, type: ts.TypeNode, visit: SlotVisitor): void {
  for (const held of heldTypes(type)) {
    if (ts.isFunctionTypeNode(held)) {
      walkSignature(slot, held, visit);
    } else {
      visit(slot, held);
    }
  }
}

// Each named member of a home, then the slots its type and signature hold.
function walkMembers(home: string, members: ts.NodeArray<ts.TypeElement>, onMember: (key: string, member: NamedMember) => void, visit: SlotVisitor): void {
  for (const member of members.filter(isNamedMember)) {
    const key = `${home}.${member.name.text}`;
    onMember(key, member);
    if (ts.isMethodSignature(member)) {
      walkSignature(key, member, visit);
    } else if (member.type !== undefined) {
      walkSlot(key, member.type, visit);
    }
  }
}

// Every interface and object type alias of a file, by name.
function walkHomes(source: ts.SourceFile, walk: (home: string, members: ts.NodeArray<ts.TypeElement>) => void): void {
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node)) {
      walk(node.name.text, node.members);
    } else if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
      walk(node.name.text, node.type.members);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const parse = (root: string, file: string): ts.SourceFile => ts.createSourceFile(file, readFileSync(join(root, file), "utf8"), ts.ScriptTarget.Latest, true);

function published(root: string): ReadonlyMap<string, string> {
  const surface = new Map<string, string>();
  for (const file of SDK_FILES.filter((sdk) => existsSync(join(root, sdk)))) {
    const source = parse(root, file);
    const onMember = (key: string, member: NamedMember): void => {
      surface.set(key, surface.get(key) ?? `${file}:${String(source.getLineAndCharacterOfPosition(member.name.getStart(source)).line + 1)}`);
    };
    const visit: SlotVisitor = (slot, type) => {
      if (ts.isTypeLiteralNode(type)) {
        walkMembers(slot, type.members, onMember, visit);
      }
    };
    walkHomes(source, (home, members) => walkMembers(home, members, onMember, visit));
  }
  return surface;
}

function contractSlots(root: string): ReadonlyMap<string, readonly string[]> {
  const slots = new Map<string, string[]>();
  const visit: SlotVisitor = (slot, type) => {
    if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
      const list = slots.get(type.typeName.text) ?? [];
      list.push(slot);
      slots.set(type.typeName.text, list);
    } else if (ts.isTypeLiteralNode(type)) {
      walkMembers(slot, type.members, () => undefined, visit);
    }
  };
  for (const file of globSync(`${PLUGIN_CONTRACT}*.ts`, { cwd: root }).sort()) {
    walkHomes(parse(root, file), (home, members) => walkMembers(home, members, () => undefined, visit));
  }
  return slots;
}

/** Every member the SDK publishes, and every slot of the plugin contract that holds a named type. */
export function sdkSurface(root: string): SdkSurface {
  return { published: published(root), slots: contractSlots(root) };
}

/** Where the SDK publishes a plugin contract field, by its type name or by a slot that holds its home, or null when
 *  the field is not on the guest surface. */
export function publishedAt(surface: SdkSurface, field: { readonly file: string; readonly home: string; readonly member: string }): string | null {
  if (!field.file.startsWith(PLUGIN_CONTRACT)) {
    return null;
  }
  const [head = "", ...rest] = typeNameOf(field.home).split(".");
  const paths = [head, ...(surface.slots.get(head) ?? [])].map((path) => [path, ...rest, field.member].join("."));
  return paths.map((path) => surface.published.get(path)).find((at) => at !== undefined) ?? null;
}
