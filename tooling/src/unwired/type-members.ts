// The members of every interface and object type alias in a world's production files, the type half of the field
// declarations the optional inventory reads (field-declarations.ts). A type literal nested in a member is its own home.
import type { Identifier, MethodSignatureDeclaration, Node, NodeArray, PropertySignatureDeclaration, TypeElement } from "@typescript/native/ast";
import {
  isIdentifier,
  isInterfaceDeclaration,
  isMethodSignatureDeclaration,
  isPropertySignatureDeclaration,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  SyntaxKind,
} from "@typescript/native/ast";
import type { Site } from "./classify.ts";
import type { NativeWorld } from "./native.ts";
import { declarationKeys } from "./native.ts";
import { isProduction } from "./worlds.ts";

/** One member of a named object type. `site` is where its name starts; `line` is 1-based. */
interface TypeMember {
  readonly site: Site;
  readonly line: number;
  readonly home: string;
  readonly member: string;
  /** Declared with `?`. */
  readonly optional: boolean;
  readonly keys: readonly string[];
}

type NamedSignature = (PropertySignatureDeclaration | MethodSignatureDeclaration) & { readonly name: Identifier };

interface Found {
  readonly node: NamedSignature;
  readonly home: string;
}

const isNamedSignature = (member: TypeElement): member is NamedSignature =>
  (isPropertySignatureDeclaration(member) || isMethodSignatureDeclaration(member)) && isIdentifier(member.name);

function membersOf(node: Node): { readonly name: Identifier; readonly members: NodeArray<TypeElement> } | null {
  if (isInterfaceDeclaration(node)) {
    return { name: node.name, members: node.members };
  }
  return isTypeAliasDeclaration(node) && isTypeLiteralNode(node.type) ? { name: node.name, members: node.type.members } : null;
}

function collect(found: Found[], home: string, members: NodeArray<TypeElement>): void {
  for (const member of members.filter(isNamedSignature)) {
    found.push({ node: member, home });
    if (isPropertySignatureDeclaration(member) && isTypeLiteralNode(member.type)) {
      collect(found, `${home}.${member.name.text}`, member.type.members);
    }
  }
}

/** Every member of every named object type in the world's production files. */
export function typeMembers(world: NativeWorld): readonly TypeMember[] {
  const found: Found[] = [];
  for (const file of world.files) {
    if (!isProduction(world.siteOf(file).file)) {
      continue;
    }
    const visit = (node: Node): void => {
      const owner = membersOf(node);
      if (owner !== null) {
        collect(found, owner.name.text, owner.members);
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  const symbols = world.symbolsAt(found.map(({ node }) => node.name));
  return found.map(({ node, home }, at) => {
    const site = world.siteOf(node.name);
    const symbol = symbols[at];
    return {
      site,
      line: node.getSourceFile().getLineAndCharacterOfPosition(site.position).line + 1,
      home,
      member: node.name.text,
      optional: node.postfixToken?.kind === SyntaxKind.QuestionToken,
      keys: symbol === undefined ? [] : declarationKeys(symbol),
    };
  });
}
