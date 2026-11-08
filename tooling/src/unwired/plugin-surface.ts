// The published plugin SDK as a receiver: third-party guests compile against its declarations, so a plugin contract field
// the SDK publishes is read outside the tree. The SDK mirrors `packages/contracts/src/plugin/` by type name.
import { existsSync, readFileSync } from "node:fs";
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

// `pluginManifestSchema` mirrors the SDK's `PluginManifest`.
const typeNameOf = (home: string): string => {
  const [head = "", ...rest] = home.split(".");
  const named = head.endsWith("Schema") ? `${head.charAt(0).toUpperCase()}${head.slice(1, -"Schema".length)}` : head;
  return [named, ...rest].join(".");
};

type NamedMember = (ts.PropertySignature | ts.MethodSignature) & { readonly name: ts.Identifier | ts.StringLiteral };

const isNamedMember = (member: ts.TypeElement): member is NamedMember =>
  (ts.isPropertySignature(member) || ts.isMethodSignature(member)) && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name));

/** Every member the SDK publishes, `Home.member` (a nested literal as `Home.outer.member`) to its `file:line`. */
export function sdkSurface(root: string): ReadonlyMap<string, string> {
  const surface = new Map<string, string>();
  // A tree without the SDK publishes nothing to guests.
  for (const file of SDK_FILES.filter((sdk) => existsSync(join(root, sdk)))) {
    const source = ts.createSourceFile(file, readFileSync(join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
    const collect = (home: string, members: ts.NodeArray<ts.TypeElement>): void => {
      for (const member of members.filter(isNamedMember)) {
        const key = `${home}.${member.name.text}`;
        surface.set(key, surface.get(key) ?? `${file}:${source.getLineAndCharacterOfPosition(member.name.getStart(source)).line + 1}`);
        if (ts.isPropertySignature(member) && member.type !== undefined && ts.isTypeLiteralNode(member.type)) {
          collect(key, member.type.members);
        }
      }
    };
    const visit = (node: ts.Node): void => {
      if (ts.isInterfaceDeclaration(node)) {
        collect(node.name.text, node.members);
      } else if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) {
        collect(node.name.text, node.type.members);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return surface;
}

/** Where the SDK publishes a plugin contract field, or null when the field is not on the guest surface. */
export function publishedAt(
  surface: ReadonlyMap<string, string>,
  field: { readonly file: string; readonly home: string; readonly member: string },
): string | null {
  return field.file.startsWith(PLUGIN_CONTRACT) ? (surface.get(`${typeNameOf(field.home)}.${field.member}`) ?? null) : null;
}
