// Closed vocabularies: string-typed kind, status and role fields, and the literal values the code gives or tests them
// against. A value is observed when an object literal sets the field, an assignment writes it, a comparison tests it,
// or a switch on it has a `case`. Nothing here judges a field closed; it reports the values so a person can.
import type { Node, SourceFile } from "@typescript/native/ast";
import {
  isBinaryExpression,
  isCaseClause,
  isIdentifier,
  isNoSubstitutionTemplateLiteral,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isStringLiteral,
  isSwitchStatement,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator } from "@typescript/native/sync";
import type { NativeWorld } from "../unwired/index.ts";
import { isProduction, propertiesNamed } from "../unwired/index.ts";
import type { DeclInfo } from "./decl.ts";
import { declInfo, shortText, siteKey, symbolInfo, whereOf } from "./decl.ts";
import { fieldDeclared } from "./declared.ts";
import type { TypeFacts, TypeReader } from "./facts.ts";
import { takesAnyString } from "./facts.ts";
import { COMPARISONS, nameOf, ownerOf } from "./syntax.ts";
import type { VocabField, VocabObservation, Where } from "./types.ts";

// `kind`, `status`, `role`, and a name that ends in one of them (`sourceKind`, `roomRole`).
const VOCAB_NAME = /^(?:kind|status|role)$|[a-z](?:Kind|Status|Role)$/u;

/** A kind, status or role field declared as a string, before its observed values are joined. */
export interface VocabDeclaration extends Where {
  readonly site: string;
  readonly name: string;
  readonly declKind: string;
  readonly owner: string | null;
}

export interface VocabRecords {
  readonly declarations: readonly VocabDeclaration[];
  readonly observations: readonly VocabObservation[];
}

interface Seen {
  readonly at: Node;
  readonly name: Node;
  readonly value: string;
  readonly how: VocabObservation["how"];
}

const literalText = (node: Node): string | undefined => (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node) ? node.text : undefined);

// The field a property read names, when it is a kind, status or role.
const vocabName = (node: Node): Node | undefined => (isPropertyAccessExpression(node) && VOCAB_NAME.test(node.name.text) ? node.name : undefined);

function observedAt(node: Node): Seen | undefined {
  if (isPropertyAssignment(node) && isIdentifier(node.name) && VOCAB_NAME.test(node.name.text)) {
    const value = literalText(node.initializer);
    return value === undefined ? undefined : { at: node, name: node.name, value, how: "assigned" };
  }
  if (isBinaryExpression(node)) {
    return observedBinary(node);
  }
  if (isCaseClause(node) && isSwitchStatement(node.parent.parent)) {
    const name = vocabName(node.parent.parent.expression);
    const value = literalText(node.expression);
    return name === undefined || value === undefined ? undefined : { at: node, name, value, how: "case" };
  }
  return undefined;
}

function observedBinary(node: Node & { readonly left: Node; readonly right: Node; readonly operatorToken: Node }): Seen | undefined {
  const assigned = node.operatorToken.kind === SyntaxKind.EqualsToken;
  if (!(assigned || COMPARISONS.has(node.operatorToken.kind))) {
    return undefined;
  }
  const sides: readonly (readonly [Node, Node])[] = assigned
    ? [[node.left, node.right]]
    : [
        [node.left, node.right],
        [node.right, node.left],
      ];
  for (const [field, literal] of sides) {
    const name = vocabName(field);
    const value = literalText(literal);
    if (name !== undefined && value !== undefined) {
      return { at: node, name, value, how: assigned ? "assigned" : "compared" };
    }
  }
  return undefined;
}

const isVocabDeclaration = (node: Node): boolean =>
  (isPropertySignatureDeclaration(node) || isPropertyDeclaration(node) || isPropertyAssignment(node)) &&
  isIdentifier(node.name) &&
  VOCAB_NAME.test(node.name.text);

function gatherVocab(files: readonly SourceFile[]): { readonly declarations: Node[]; readonly seen: Seen[] } {
  const declarations: Node[] = [];
  const seen: Seen[] = [];
  const visit = (node: Node): void => {
    const observed = observedAt(node);
    if (observed !== undefined) {
      seen.push(observed);
    }
    if (isVocabDeclaration(node)) {
      declarations.push(node);
    }
    node.forEachChild(visit);
  };
  for (const file of files) {
    file.forEachChild(visit);
  }
  return { declarations, seen };
}

// A type-position property is a string when its type says so; a schema field is one when built from `z.string()`.
function stringFields(world: NativeWorld, reader: TypeReader, declarations: readonly Node[]): Node[] {
  const typed = declarations.filter((node) => !isPropertyAssignment(node));
  const schema = declarations.filter(isPropertyAssignment);
  const facts = reader.read(world.typesAt(typed.map(nameOf)));
  const built = world.batch(schema.map((field) => fieldDeclared(world, field)));
  const isString = (fact: TypeFacts | undefined): boolean => fact !== undefined && takesAnyString(fact) && !fact.other;
  return [...typed.filter((_, at) => isString(facts[at])), ...schema.filter((_, at) => built[at] === "plain")];
}

/** Every production field with the values seen against it across the worlds; a value seen only in tests is kept apart. */
export function joinVocab(records: readonly VocabRecords[]): VocabField[] {
  const observed = new Map<string, VocabObservation[]>();
  for (const observation of records.flatMap((record) => record.observations)) {
    observed.set(observation.field, [...(observed.get(observation.field) ?? []), observation]);
  }
  const fields = new Map(records.flatMap((record) => record.declarations).map((field) => [field.site, field]));
  const distinct = (values: Iterable<string>): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));
  return [...fields.values()]
    .filter((field) => isProduction(field.file))
    .map((field): VocabField => {
      const seen = observed.get(field.site) ?? [];
      const production = distinct(seen.filter((site) => isProduction(site.file)).map((site) => site.value));
      const testValues = distinct(seen.map((site) => site.value).filter((value) => !production.includes(value)));
      const count = (how: VocabObservation["how"]): number => seen.filter((site) => site.how === how).length;
      return { ...field, values: production, testValues, assigned: count("assigned"), compared: count("compared"), cased: count("case") };
    })
    .sort((a, b) => b.values.length - a.values.length || a.file.localeCompare(b.file) || a.line - b.line);
}

// The field an observation is about. An object literal's own property resolves to itself, so it is read through the
// contextual type the literal is held to; a property read resolves to the declaration directly.
function* declarationOf(world: NativeWorld, { at, name }: Seen): APIRequestGenerator<DeclInfo> {
  if (!(isPropertyAssignment(at) && isObjectLiteralExpression(at.parent))) {
    return yield* symbolInfo(world, name);
  }
  const contextual = yield* world.checker.getContextualType.gen(at.parent);
  const [property] = contextual === undefined ? [] : yield* propertiesNamed(world.checker, contextual, name.getText());
  return yield* declInfo(world, property);
}

/** The string-typed kind, status and role fields of a world's home files, and every literal seen against one. */
export function collectVocab(world: NativeWorld, reader: TypeReader, files: readonly SourceFile[]): VocabRecords {
  const { declarations, seen } = gatherVocab(files);
  const fields = stringFields(world, reader, declarations);
  const resolved = world.batch(seen.map((one) => declarationOf(world, one)));
  return {
    declarations: fields.map((node) => ({
      ...whereOf(world, node),
      site: siteKey(world, nameOf(node)),
      name: shortText(nameOf(node)),
      declKind: SyntaxKind[node.kind],
      owner: ownerOf(node),
    })),
    observations: seen.flatMap(({ at, value, how }, index): VocabObservation[] => {
      const site = resolved[index]?.site ?? null;
      return site === null ? [] : [{ ...whereOf(world, at), field: site, value, how }];
    }),
  };
}
