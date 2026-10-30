// A type exported from a module inside an area but not from the area's door, while another file spells the same
// shape again: the copy exists because the door forgot the export. Shapes compare by their printed signature, so a
// function alias matches a hand-typed member and an interface matches an interface with the same members.
import { relative } from "node:path";
import ts from "typescript";
import type { LoadedWorld } from "./doors.ts";
import { doorsOf, exportNameOf } from "./doors.ts";
import { isHandTyped, placementOf } from "./restated-port.ts";
import { isProduction } from "./worlds.ts";

export interface ForgottenExport {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly door: string | null;
  readonly doorFile: string | null;
  /** `file:line Label` of each same-shape copy. */
  readonly copies: readonly string[];
  /** A copy sits in another server domain, so the shape moves to contracts instead of out through the door. */
  readonly crossDomain: boolean;
}

// Interfaces this small match by accident; a copy is a shape with at least this many members.
const MIN_INTERFACE_MEMBERS = 2;

const lineOf = (node: ts.Node): number => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;

function signatureKey(checker: ts.TypeChecker, type: ts.Type): string | null {
  const [signature, ...more] = checker.getNonNullableType(type).getCallSignatures();
  if (signature === undefined || more.length > 0) {
    return null;
  }
  const parameters = signature.getParameters().map((parameter) => checker.typeToString(checker.getTypeOfSymbol(parameter)));
  return `(${parameters.join(", ")}) => ${checker.typeToString(signature.getReturnType())}`;
}

function membersKey(checker: ts.TypeChecker, type: ts.Type): string | null {
  const properties = checker.getPropertiesOfType(type);
  if (properties.length < MIN_INTERFACE_MEMBERS) {
    return null;
  }
  return properties
    .map((property) => `${property.name}:${checker.typeToString(checker.getTypeOfSymbol(property))}`)
    .sort()
    .join(";");
}

interface Shape {
  readonly key: string;
  readonly at: string;
  readonly file: string;
  readonly node: ts.Node;
}

type Declared = Shape & { readonly declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration };

function memberShape(checker: ts.TypeChecker, file: string, node: ts.Node): Shape | null {
  if (!((ts.isPropertySignature(node) || ts.isMethodSignature(node)) && isHandTyped(node))) {
    return null;
  }
  const key = signatureKey(checker, checker.getTypeAtLocation(node));
  return key === null ? null : { key, at: `${file}:${lineOf(node)} ${node.name.getText()}`, file, node };
}

function declaredShape(checker: ts.TypeChecker, file: string, node: ts.Node): Declared | null {
  if (!(ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) || node.typeParameters !== undefined) {
    return null;
  }
  const type = checker.getTypeAtLocation(node.name);
  const key = ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node.type) ? membersKey(checker, type) : signatureKey(checker, type);
  return key === null ? null : { key, at: `${file}:${lineOf(node)} ${node.name.text}`, file, node, declaration: node };
}

const isExported = (declaration: Declared["declaration"]): boolean =>
  declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true &&
  !declaration.getSourceFile().fileName.endsWith("/index.ts");

function shapesOf(world: LoadedWorld): { readonly exported: readonly Declared[]; readonly all: readonly Shape[] } {
  const checker = world.program.getTypeChecker();
  const all: Shape[] = [];
  const exported: Declared[] = [];
  for (const source of world.program.getSourceFiles()) {
    const file = relative(world.root, source.fileName);
    if (source.isDeclarationFile || !isProduction(file)) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      const member = memberShape(checker, file, node);
      const declared = declaredShape(checker, file, node);
      all.push(...(member === null ? [] : [member]), ...(declared === null ? [] : [declared]));
      if (declared !== null && isExported(declared.declaration)) {
        exported.push(declared);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { exported, all };
}

/** Every exported shape its area's door leaves out while another file spells it again, in one world. */
export function forgottenDoorExports(world: LoadedWorld): readonly ForgottenExport[] {
  const checker = world.program.getTypeChecker();
  const { exported, all } = shapesOf(world);
  const byKey = new Map<string, Shape[]>();
  for (const shape of all) {
    byKey.set(shape.key, [...(byKey.get(shape.key) ?? []), shape]);
  }
  const found: ForgottenExport[] = [];
  for (const shape of exported) {
    const symbol = checker.getSymbolAtLocation(shape.declaration.name);
    const [door] = doorsOf(world.root, shape.file);
    if (symbol === undefined || (door !== undefined && exportNameOf(world, door.file, symbol) !== null)) {
      continue;
    }
    const copies = (byKey.get(shape.key) ?? []).filter((other) => other.node !== shape.node && other.file !== shape.file);
    if (copies.length === 0) {
      continue;
    }
    const domain = placementOf(`/${shape.file}`)?.domain ?? null;
    const crossDomain = copies.some((copy) => {
      const other = placementOf(`/${copy.file}`)?.domain ?? null;
      return domain !== null && other !== null && other !== domain;
    });
    found.push({
      file: shape.file,
      line: lineOf(shape.declaration),
      name: shape.declaration.name.text,
      door: door?.specifier ?? null,
      doorFile: door?.file ?? null,
      copies: copies.map((copy) => copy.at),
      crossDomain,
    });
  }
  return found;
}
