// The published plugin SDK as a receiver: third-party guests compile against its declarations, so a plugin contract field
// the SDK publishes is read outside the tree. The SDK mirrors `packages/contracts/src/plugin/` by type name, or by slot
// where it spells a contract type inline (a function's return or parameter, a member's type).
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  FunctionTypeNode,
  Identifier,
  MethodSignatureDeclaration,
  Node,
  PropertySignatureDeclaration,
  SourceFile,
  StringLiteral,
  TypeElement,
  TypeNode,
} from "@typescript/native/ast";
import {
  isArrayTypeNode,
  isFunctionTypeNode,
  isIdentifier,
  isInterfaceDeclaration,
  isMethodSignatureDeclaration,
  isParenthesizedTypeNode,
  isPropertySignatureDeclaration,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isTypeOperatorNode,
  isTypeReferenceNode,
  isUnionTypeNode,
} from "@typescript/native/ast";
import type { RetainedSourceFile } from "@typescript/native/sync";
import { z } from "zod";
import { editorLineOf } from "../floor/typescript/editor-lines.ts";
import type { WorldFiles } from "./native.ts";
import { NativeWorld } from "./native.ts";
import { isProduction as isAppSource } from "./worlds.ts";

/** The guest-facing plugin contract the SDK mirrors: the wire types it publishes are declared here. */
export const PLUGIN_CONTRACT = "packages/contracts/src/plugin/";
/** The published plugin SDK: its declarations are a door this module reads, never walked as code. */
export const PUBLISHED_SDK = "packages/plugin-sdk/";

// The SDK package ships the files its manifest lists; the declarations among them are what guests compile against.
const SdkManifest = z.looseObject({ files: z.array(z.string()).readonly() });
const DECLARATION = ".d.ts";

/** The published SDK's declaration files, repository-relative, as the SDK's own manifest ships them; empty for a tree
 *  with no SDK package. */
export function publishedSdkSources(root: string): ReadonlySet<string> {
  const manifest = join(root, PUBLISHED_SDK, "package.json");
  if (!existsSync(manifest)) {
    return new Set();
  }
  const { files } = SdkManifest.parse(JSON.parse(readFileSync(manifest, "utf8")));
  return new Set(files.filter((file) => file.endsWith(DECLARATION)).map((file) => `${PUBLISHED_SDK}${file}`));
}

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
  /** Every interface and type alias name the SDK declares: a contract type of the same name is published whole. */
  readonly names: ReadonlySet<string>;
}

type NamedMember = (PropertySignatureDeclaration | MethodSignatureDeclaration) & { readonly name: Identifier | StringLiteral };

const isNamedMember = (member: TypeElement): member is NamedMember =>
  (isPropertySignatureDeclaration(member) || isMethodSignatureDeclaration(member)) && (isIdentifier(member.name) || isStringLiteral(member.name));

// The types a slot holds, through parentheses, unions, `readonly`, arrays and the holder generics.
function heldTypes(type: TypeNode): readonly TypeNode[] {
  if (isParenthesizedTypeNode(type) || isTypeOperatorNode(type)) {
    return heldTypes(type.type);
  }
  if (isUnionTypeNode(type)) {
    return type.types.flatMap(heldTypes);
  }
  if (isArrayTypeNode(type)) {
    return heldTypes(type.elementType);
  }
  if (isTypeReferenceNode(type) && isIdentifier(type.typeName) && HOLDERS.has(type.typeName.text)) {
    return (type.typeArguments ?? []).flatMap(heldTypes);
  }
  return [type];
}

type SlotVisitor = (slot: string, type: TypeNode) => void;

function walkSignature(slot: string, signature: MethodSignatureDeclaration | FunctionTypeNode, visit: SlotVisitor): void {
  if (signature.type !== undefined) {
    walkSlot(`${slot}()`, signature.type, visit);
  }
  for (const [at, parameter] of signature.parameters.entries()) {
    if (parameter.type !== undefined) {
      walkSlot(`${slot}(${String(at)})`, parameter.type, visit);
    }
  }
}

function walkSlot(slot: string, type: TypeNode, visit: SlotVisitor): void {
  for (const held of heldTypes(type)) {
    if (isFunctionTypeNode(held)) {
      walkSignature(slot, held, visit);
    } else {
      visit(slot, held);
    }
  }
}

// Each named member of a home, then the slots its type and signature hold.
function walkMembers(home: string, members: readonly TypeElement[], onMember: (key: string, member: NamedMember) => void, visit: SlotVisitor): void {
  for (const member of members.filter(isNamedMember)) {
    const key = `${home}.${member.name.text}`;
    onMember(key, member);
    if (isMethodSignatureDeclaration(member)) {
      walkSignature(key, member, visit);
    } else if (isPropertySignatureDeclaration(member)) {
      walkSlot(key, member.type, visit);
    }
  }
}

// Every interface and object type alias of a file, by name.
function walkHomes(source: SourceFile, walk: (home: string, members: readonly TypeElement[]) => void): void {
  const visit = (node: Node): void => {
    if (isInterfaceDeclaration(node)) {
      walk(node.name.text, node.members);
    } else if (isTypeAliasDeclaration(node) && isTypeLiteralNode(node.type)) {
      walk(node.name.text, node.type.members);
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
}

interface PublishedFile {
  readonly members: readonly (readonly [string, string])[];
  readonly names: readonly string[];
}

// One SDK declaration file's members, each with its `file:line`, and its declared type names.
function publishedIn(file: string, source: SourceFile): PublishedFile {
  const found: (readonly [string, string])[] = [];
  const names: string[] = [];
  const declared = (node: Node): void => {
    if (isInterfaceDeclaration(node) || isTypeAliasDeclaration(node)) {
      names.push(node.name.text);
    }
    node.forEachChild(declared);
  };
  source.forEachChild(declared);
  const onMember = (key: string, member: NamedMember): void => {
    found.push([key, `${file}:${String(editorLineOf(source, member.name.getStart(source)))}`]);
  };
  const visit: SlotVisitor = (slot, type) => {
    if (isTypeLiteralNode(type)) {
      walkMembers(slot, type.members, onMember, visit);
    }
  };
  walkHomes(source, (home, members) => walkMembers(home, members, onMember, visit));
  return { members: found, names };
}

// One contract file's slots that hold a named type, by the type's name.
function slotsIn(source: SourceFile): readonly (readonly [string, string])[] {
  const slots: (readonly [string, string])[] = [];
  const visit: SlotVisitor = (slot, type) => {
    if (isTypeReferenceNode(type) && isIdentifier(type.typeName)) {
      slots.push([type.typeName.text, slot]);
    } else if (isTypeLiteralNode(type)) {
      walkMembers(slot, type.members, () => undefined, visit);
    }
  };
  walkHomes(source, (home, members) => walkMembers(home, members, () => undefined, visit));
  return slots;
}

/** Every member the SDK publishes, and every slot of the plugin contract that holds a named type. Each file is parsed
 *  on its own through the world's compiler: the SDK is the text guests compile against, never part of the walked program.
 *  Every parse is one batch (`NativeWorld.parseAlone`), released once read. */
export function sdkSurface(root: string, world: NativeWorld): SdkSurface {
  const sdk = [...publishedSdkSources(root)];
  const contract = globSync(`${PLUGIN_CONTRACT}*.ts`, { cwd: root }).sort();
  const leases = world.parseAlone([...sdk, ...contract]);
  const published = new Map<string, string>();
  const names = new Set<string>();
  const slots = new Map<string, string[]>();
  try {
    // The manifest's file order holds, so the first SDK file to publish a key keeps it.
    for (const [at, file] of sdk.entries()) {
      const found = publishedIn(file, (leases[at] as RetainedSourceFile).sourceFile);
      for (const [key, line] of found.members) {
        published.set(key, published.get(key) ?? line);
      }
      for (const name of found.names) {
        names.add(name);
      }
    }
    for (const lease of leases.slice(sdk.length)) {
      for (const [type, slot] of slotsIn(lease.sourceFile)) {
        slots.getOrInsert(type, []).push(slot);
      }
    }
  } finally {
    for (const lease of leases) {
      lease[Symbol.dispose]();
    }
  }
  return { published, slots, names };
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

// Authored plugin programs exercise the published ambient SDK. Neither lives under a package's src directory, so the
// author tsconfigs' programs say which files are which, never a path pattern: the author files are the own sources a
// program holds, and the SDK's are the declaration files it keeps (the published SDK's, which the world keeps by
// `NativeWorld`'s declaration filter).
const AUTHOR_WORLDS = "packages/showcase-plugins/tsconfig.author-*.json";

/** The plugin author source and the published SDK's declarations, repository-relative. */
export interface PluginSources {
  readonly author: ReadonlySet<string>;
  readonly sdk: ReadonlySet<string>;
}

const NO_PLUGIN_SOURCES: PluginSources = { author: new Set(), sdk: new Set() };

/** Whether a file is product source, plugin author source or an SDK declaration. */
export function isPluginProduction(file: string, plugins: PluginSources): boolean {
  return isAppSource(file) || plugins.author.has(file) || plugins.sdk.has(file);
}

export function pluginAuthorWorlds(root: string): string[] {
  return globSync(AUTHOR_WORLDS, { cwd: root }).sort();
}

/** The plugin sources the programs of `authorWorlds` hold, from the file lists of `lists` (a world's own files, its
 *  declaration files kept only where {@link NativeWorld.fileLists} was asked to keep them). */
export function pluginSources(lists: ReadonlyMap<string, WorldFiles>, authorWorlds: readonly string[]): PluginSources {
  const held = authorWorlds.flatMap((config) => [...(lists.get(config)?.held ?? [])]);
  return {
    author: new Set(held.filter((file) => !file.endsWith(DECLARATION))),
    sdk: new Set(held.filter((file) => file.endsWith(DECLARATION))),
  };
}

/** The plugin sources of `root`'s author worlds, read from their programs; empty for a tree with no author world. */
export function readPluginSources(root: string): PluginSources {
  const worlds = pluginAuthorWorlds(root);
  return worlds.length === 0 ? NO_PLUGIN_SOURCES : pluginSources(NativeWorld.fileLists(root, worlds, publishedSdkSources(root)), worlds);
}
