// The members of every interface and object type alias in a world's production files, as engine one sees them: the
// member scan reads the callable ones, the fields scan the rest. A type literal nested in a member is its own home.
import type {
  Identifier,
  MethodSignatureDeclaration,
  Node,
  NodeArray,
  ParameterDeclaration,
  PropertySignatureDeclaration,
  TypeElement,
} from "@typescript/native/ast";
import {
  isFunctionTypeNode,
  isIdentifier,
  isInterfaceDeclaration,
  isMethodSignatureDeclaration,
  isPropertySignatureDeclaration,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  SyntaxKind,
} from "@typescript/native/ast";
import { SignatureKind } from "@typescript/native/sync";
import type { Site } from "./classify.ts";
import type { NativeWorld } from "./native.ts";
import { declarationKeys } from "./native.ts";
import { isProduction } from "./worlds.ts";

/** One member of a named object type. `site` is where its name starts; `line` and `character` are 1- and 0-based. */
export interface TypeMember {
  readonly name: Identifier;
  readonly site: Site;
  readonly line: number;
  readonly character: number;
  readonly home: string;
  readonly member: string;
  /** Declared with `?`. */
  readonly optional: boolean;
  /** A method, or a property whose non-nullable type has a call signature. */
  readonly callable: boolean;
  /** Inside a type literal that is itself a member's type. */
  readonly nested: boolean;
  readonly keys: readonly string[];
  /** The keys of the named type the member belongs to, a nested literal's included. */
  readonly homeKeys: readonly string[];
  /** A method's parameters, or those of a function type written on the property; empty otherwise. */
  readonly parameters: readonly ParameterDeclaration[];
}

function parametersOf(node: NamedSignature): readonly ParameterDeclaration[] {
  if (isMethodSignatureDeclaration(node)) {
    return node.parameters;
  }
  return isFunctionTypeNode(node.type) ? node.type.parameters : [];
}

type NamedSignature = (PropertySignatureDeclaration | MethodSignatureDeclaration) & { readonly name: Identifier };

interface Found {
  readonly node: NamedSignature;
  readonly home: string;
  readonly homeName: Identifier;
  readonly nested: boolean;
}

const isNamedSignature = (member: TypeElement): member is NamedSignature =>
  (isPropertySignatureDeclaration(member) || isMethodSignatureDeclaration(member)) && isIdentifier(member.name);

function membersOf(node: Node): { readonly name: Identifier; readonly members: NodeArray<TypeElement> } | null {
  if (isInterfaceDeclaration(node)) {
    return { name: node.name, members: node.members };
  }
  return isTypeAliasDeclaration(node) && isTypeLiteralNode(node.type) ? { name: node.name, members: node.type.members } : null;
}

function collect(found: Found[], owner: Omit<Found, "node">, members: NodeArray<TypeElement>): void {
  for (const member of members.filter(isNamedSignature)) {
    found.push({ node: member, ...owner });
    if (isPropertySignatureDeclaration(member) && isTypeLiteralNode(member.type)) {
      collect(found, { home: `${owner.home}.${member.name.text}`, homeName: owner.homeName, nested: true }, member.type.members);
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
        collect(found, { home: owner.name.text, homeName: owner.name, nested: false }, owner.members);
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  const { checker } = world;
  const facts = world.batch(
    found.map(function* ({ node, homeName }) {
      const symbol = yield* checker.getSymbolAtLocation.gen(node.name);
      const home = yield* checker.getSymbolAtLocation.gen(homeName);
      if (isMethodSignatureDeclaration(node)) {
        return { symbol, home, callable: true };
      }
      const type = yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(node));
      return { symbol, home, callable: (yield* checker.getSignaturesOfType.gen(type, SignatureKind.Call)).length > 0 };
    }),
  );
  return found.map(({ node, home, nested }, at) => {
    const site = world.siteOf(node.name);
    const position = node.getSourceFile().getLineAndCharacterOfPosition(site.position);
    const fact = facts[at];
    return {
      name: node.name,
      site,
      line: position.line + 1,
      character: position.character,
      home,
      member: node.name.text,
      optional: node.postfixToken?.kind === SyntaxKind.QuestionToken,
      callable: fact?.callable === true,
      nested,
      keys: fact?.symbol === undefined ? [] : declarationKeys(fact.symbol),
      homeKeys: fact?.home === undefined ? [] : declarationKeys(fact.home),
      parameters: parametersOf(node),
    };
  });
}
