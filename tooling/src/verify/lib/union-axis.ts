// Shared reader: the STRING-UNION AXIS identity reader. Given one delivered node it answers the three
// questions `Spine-TypeScript-and-Patterns.md` §7.5 asks about a string axis — is this an inline union
// ALIAS, is this a CANONICAL `as const` tuple home, and is this inline literal SET a re-spell candidate —
// plus the two identity fences a caller cannot re-derive without re-implementing the same AST walk: the
// `satisfies` CO-DECLARATION a registered tuple derives from, and whether a candidate's package can even
// IMPORT the home it would have to derive from.
//
// ── WHY THESE FACTS ARE READER-LEVEL AND NOT POLICY-LEVEL ───────────────────────────────────────────────
// Every one of them is AST/binding identity — `as const` unwrapping through a `satisfies` wrapper, the
// indexed-access resolution `Interface["prop"]` → the declaring union node, static string-array reading,
// and the package-cake reach rank. `docs/law/gate-runtime-standardization.md` §3 puts exactly that layer here
// ("binding identity, static-value unwrapping ... are shared primitives") and leaves the INTENT — which
// arm reports, what it says, and where the waiver anchors — to the consuming policy. The split is the same
// one `schema-branding` has against `schema-fact`: the reader owns identity, the policy owns intent.
//
// ── THE TWO MEMBER FLOORS, AND WHY THEY DIFFER ──────────────────────────────────────────────────────────
// An ALIAS floor of 3 (`ALIAS_MIN_MEMBERS`): a bare `"ok" | "error"` type alias is not noise-worthy, and
// flagging it would price every two-state result type as a defect. A canonical-tuple REGISTRATION floor of
// 3 by default, dropping to 2 for a tuple homed in `packages/contracts/` or `packages/kit/`: a two-member
// exact-set match is only a low-false-positive signal when the home demonstrably IS the axis home, and
// those two packages are where a cross-boundary axis lives by law. A coincidental generic pair (`'x' | 'y'`)
// homed in `server/` stays below the floor and is not matched.
//
// ── THE CAKE REACH FENCE ────────────────────────────────────────────────────────────────────────────────
// A re-spell in package P against a tuple homed in H is only a REAL re-spell when P can import H
// (`kit ← contracts ← db ← server ← client`; `ui` deps `kit` ONLY, D54). A kit function returning
// `"always" | "keyword"` physically cannot derive from a contracts-homed `WORLD_INFO_SCOPES`, so flagging
// it would demand an illegal import — the opposite of the law it enforces.
//
// No Project, no workspace cache, no filesystem, no marker parser: every door takes a node the caller was
// handed, and the one type read (`coDeclarationUnionNode`) is the compiler-resolved identity its consumer
// declares `analysis: "types"` for.
import type { ArrayLiteralExpression, CallExpression, Expression, Node, TypeAliasDeclaration, UnionTypeNode, VariableDeclaration } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";

/** The node kinds a consumer must subscribe to for BOTH arms to see their subjects. */
export const UNION_AXIS_VISITOR_KINDS = [
  SyntaxKind.VariableDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.UnionType,
  SyntaxKind.CallExpression,
] as const;

/** The inline-ALIAS floor: below this a one-off union is not an axis worth homing. */
export const ALIAS_MIN_MEMBERS = 3;
/** The canonical-tuple REGISTRATION floor, and the lower floor for a contracts/kit home (see the header). */
const TUPLE_MIN_MEMBERS = 3;
const TUPLE_MIN_MEMBERS_HOMED = 2;
const SIGNATURE_SEPARATOR = " ";
/** The package homes where a 2-member tuple is trusted enough to register as a canonical axis. */
const TRUSTED_TUPLE_HOMES: readonly string[] = ["packages/contracts/", "packages/kit/"];

/** Import reach by package, for the cake fence. `tests/` and anything unrecognised reach everything. */
const PACKAGE_IMPORT_RANK: Readonly<Record<string, number>> = { kit: 0, contracts: 1, ui: 1, db: 2, server: 3, client: 4 };
const PACKAGE_RE = /^packages\/(?<pkg>[^/]+)\//u;
const UNRANKED = 5;

/** Order-independent identity of a string-literal set: two sets are the same axis iff these match. */
function axisSignature(members: readonly string[]): string {
  return [...new Set(members)].toSorted().join(SIGNATURE_SEPARATOR);
}

/** The string members of an array literal, or undefined when any element is not a string literal. */
function stringArrayMembers(array: ArrayLiteralExpression): readonly string[] | undefined {
  const members: string[] = [];
  for (const element of array.getElements()) {
    if (!TsNode.isStringLiteral(element)) {
      return;
    }
    members.push(element.getLiteralText());
  }
  return members.length > 0 ? members : undefined;
}

/** The string members of an all-string-literal union, or undefined otherwise. */
function unionStringMembers(node: UnionTypeNode): readonly string[] | undefined {
  const members: string[] = [];
  for (const part of node.getTypeNodes()) {
    if (!TsNode.isLiteralTypeNode(part)) {
      return;
    }
    const literal = part.getLiteral();
    if (!TsNode.isStringLiteral(literal)) {
      return;
    }
    members.push(literal.getLiteralText());
  }
  return members.length > 0 ? members : undefined;
}

/** The `z.enum([...])` string-array argument of a call, or undefined when it is not that shape. */
function zEnumArray(call: CallExpression): ArrayLiteralExpression | undefined {
  if (!call.getExpression().getText().endsWith(".enum")) {
    return;
  }
  const [argument] = call.getArguments();
  return argument !== undefined && TsNode.isArrayLiteralExpression(argument) ? argument : undefined;
}

/** Peel `readonly X[]` → the element type node `X` (the axis's co-declaration reference). */
function satisfiesElementType(typeNode: Node | undefined): Node | undefined {
  let element = typeNode;
  if (element !== undefined && TsNode.isTypeOperatorTypeNode(element)) {
    element = element.getTypeNode();
  }
  return element !== undefined && TsNode.isArrayTypeNode(element) ? element.getElementTypeNode() : element;
}

/** Unwrap an initializer to its `as const` array literal, tolerating a `satisfies` wrapper, and return the
 *  `satisfies` element TYPE NODE alongside it — the co-declaration the tuple derives from. */
function unwrapAsConstTuple(initializer: Expression): { readonly array: ArrayLiteralExpression; readonly satisfiesElement: Node | undefined } | undefined {
  let node: Expression = initializer;
  let satisfiesElement: Node | undefined;
  if (TsNode.isSatisfiesExpression(node)) {
    satisfiesElement = satisfiesElementType(node.getTypeNode());
    node = node.getExpression();
  }
  if (!TsNode.isAsExpression(node) || node.getTypeNode()?.getText() !== "const") {
    return;
  }
  const expression = node.getExpression();
  return TsNode.isArrayLiteralExpression(expression) ? { array: expression, satisfiesElement } : undefined;
}

/** The union declaration node an `Interface["prop"]` indexed access refers to — the SOURCE a
 *  `satisfies readonly Interface["prop"][]` tuple derives from — or undefined when it does not resolve to
 *  a single interface property whose type IS a literal union. The one compiler-resolved read here. */
function coDeclarationUnionNode(elementType: Node): UnionTypeNode | undefined {
  if (!TsNode.isIndexedAccessTypeNode(elementType)) {
    return;
  }
  const indexLiteral = elementType.getIndexTypeNode();
  if (!TsNode.isLiteralTypeNode(indexLiteral)) {
    return;
  }
  const indexName = indexLiteral.getLiteral();
  if (!TsNode.isStringLiteral(indexName)) {
    return;
  }
  const property = indexName.getLiteralText();
  const symbol = elementType.getObjectTypeNode().getType().getSymbol();
  const propertyType = (symbol?.getDeclarations() ?? [])
    .filter((declaration) => TsNode.isInterfaceDeclaration(declaration))
    .map((declaration) => declaration.getProperty(property)?.getTypeNode())
    .find((typeNode) => typeNode !== undefined && TsNode.isUnionTypeNode(typeNode));
  return propertyType !== undefined && TsNode.isUnionTypeNode(propertyType) ? propertyType : undefined;
}

/** A registered canonical axis home: the tuple's name, its repo-relative file, its set identity, and the
 *  co-declaration union node (when the tuple derives from one) that must never be read as a re-spell. */
export interface CanonicalAxisTuple {
  readonly name: string;
  readonly file: string;
  readonly signature: string;
  readonly coDeclaration: UnionTypeNode | undefined;
}

/** `const X = [...] as const [satisfies readonly Y[]]` as a canonical axis home, when it clears the member
 *  floor its package earns. Undefined for every other declaration shape. */
export function canonicalAxisTuple(declaration: VariableDeclaration, relFile: string): CanonicalAxisTuple | undefined {
  const initializer = declaration.getInitializer();
  const unwrapped = initializer === undefined ? undefined : unwrapAsConstTuple(initializer);
  if (unwrapped === undefined) {
    return;
  }
  const members = stringArrayMembers(unwrapped.array);
  const floor = TRUSTED_TUPLE_HOMES.some((home) => relFile.startsWith(home)) ? TUPLE_MIN_MEMBERS_HOMED : TUPLE_MIN_MEMBERS;
  if (members === undefined || members.length < floor) {
    return;
  }
  return {
    name: declaration.getName(),
    file: relFile,
    signature: axisSignature(members),
    coDeclaration: unwrapped.satisfiesElement === undefined ? undefined : coDeclarationUnionNode(unwrapped.satisfiesElement),
  };
}

/** An inline string-literal union TYPE ALIAS of at least `ALIAS_MIN_MEMBERS` members — the arm-A subject.
 *  `nameNode` is the alias's own identifier: the waiver anchor, and the thing a reader would call it. */
export interface InlineUnionAlias {
  readonly alias: TypeAliasDeclaration;
  readonly nameNode: Node;
}

export function inlineUnionAlias(node: Node): InlineUnionAlias | undefined {
  if (!TsNode.isTypeAliasDeclaration(node)) {
    return;
  }
  const typeNode = node.getTypeNode();
  if (typeNode === undefined || !TsNode.isUnionTypeNode(typeNode)) {
    return;
  }
  const members = unionStringMembers(typeNode);
  return members !== undefined && members.length >= ALIAS_MIN_MEMBERS ? { alias: node, nameNode: node.getNameNode() } : undefined;
}

/** An inline literal SET that may re-spell a canonical tuple — the arm-B subject. `reported` is the SET
 *  itself (the union type node, or the `z.enum` ARRAY literal), which is what an author has to delete. */
export interface AxisRespellCandidate {
  readonly reported: Node;
  readonly signature: string;
  readonly kind: "union" | "zenum";
}

export function axisRespellCandidate(node: Node): AxisRespellCandidate | undefined {
  if (TsNode.isUnionTypeNode(node)) {
    // An alias's own union is arm A's subject; reading it here too would double-report the same site.
    if (node.getParent().getKind() === SyntaxKind.TypeAliasDeclaration) {
      return;
    }
    const members = unionStringMembers(node);
    return members === undefined ? undefined : { reported: node, signature: axisSignature(members), kind: "union" };
  }
  if (!TsNode.isCallExpression(node)) {
    return;
  }
  const array = zEnumArray(node);
  const members = array === undefined ? undefined : stringArrayMembers(array);
  return array === undefined || members === undefined ? undefined : { reported: array, signature: axisSignature(members), kind: "zenum" };
}

/** The import-reach rank of the package a repo-relative file lives in. */
function importRank(relFile: string): number {
  const pkg = PACKAGE_RE.exec(relFile)?.groups?.["pkg"];
  return pkg === undefined ? UNRANKED : (PACKAGE_IMPORT_RANK[pkg] ?? UNRANKED);
}

/** Can a re-spell in `candidateFile` legally import a tuple homed in `homeFile` (same-or-down the cake)?
 *  `ui` (rank 1) may reach only `kit` (rank 0), never its rank-peer `contracts` — D54, encoded explicitly. */
export function canReachAxisHome(candidateFile: string, homeFile: string): boolean {
  const candidatePackage = PACKAGE_RE.exec(candidateFile)?.groups?.["pkg"];
  const homePackage = PACKAGE_RE.exec(homeFile)?.groups?.["pkg"];
  if (candidatePackage === "ui" && homePackage === "contracts") {
    return false;
  }
  return importRank(homeFile) <= importRank(candidateFile);
}
