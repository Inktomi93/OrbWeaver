// Policy: test-hand-shape (docs/law/Spine-Testing.md §10, "Derive types") — e2e code and test support modules may not
// hand-declare an object shape that a production value is bound to. A hand shape is an interface with no `extends`, or
// an alias of a type literal, declared in e2e or a non-test support module. It is bound to production when, at a site
// the checker judges (an argument, an initializer, a return, a property value, an assignment, a cast or `satisfies`),
// one side's type is that hand shape and the other's is declared outside the test tree. Judged by type: the relation
// of the two types decides the wording (copies, narrows, widens, diverges), never a field name or a count. A shape
// bound to no production value passes whatever fields it shares, unless it is a DECLARED COPY: an exported production
// shape (or a database row type) that is assignable to it and either assignable back, has exactly its field names, or
// is overridden by it (the hand shape has an optional field). The smallest such shape, by field count, is reported.
// DECLARED LIMIT: only whole-type bindings are seen; a hand shape reached through a mapped or generic
// wrapper (`Partial<Hand>`) is not unwrapped, and a hand shape that drifted (renamed or retyped a field) is judged
// only where a value binds it.
// FAMILY `contract-derives-not-respells`. Debt: `lib/reviewed-grants-test-hand-shape.ts`.
import type { InterfaceDeclaration, Node, SourceFile, Type, TypeAliasDeclaration } from "ts-morph";
import { Node as N, SyntaxKind, ts } from "ts-morph";
import { readAssignabilityChecker } from "../../floor/code-facts/assignability.ts";
import { classifyTestFilename } from "../../floor/testing/test-kinds.ts";
import { defineGate } from "../contract/policy.ts";
import { declarationHome } from "../lib/declaration-home.ts";

const TESTS = "tests/";
const E2E = "tests/e2e/";
/** The database package is the home of row types (AGENTS.md type homes): its tables carry `$inferSelect` and `$inferInsert`. */
const DB_HOME = "packages/db/";
const LAW = "(docs/law/Spine-Testing.md §10)";
const MESSAGE = `a test support or e2e module hand-declares a shape that a production value is bound to, so a renamed or retyped field still compiles here and drifts silently ${LAW}.`;
const FIX =
  "import the production type, or derive it (`TrpcWireOutput`, `inferOutput`, `z.infer`, `Pick<…>`, an indexed access). A shape with no contract home gets one first. Existing shapes are reviewed-grant rows naming their burn-down item; a new shape derives, never a row.";

const WIRE_CAPTURE_HOME = "packages/server/src/foundation/observability/debug/wire-capture.ts";
const MESSAGES_HOME = "packages/contracts/src/chat/message-pages.ts";
const E2E_HELPER = "tests/e2e/support/trpc.ts";
const WIRE_CAPTURE = (provider: string, extra: string): string =>
  `export interface WireCapture {\n  readonly chatId: string;\n  readonly api: string;\n  readonly ${provider}: string;\n  readonly model: string;\n  readonly body: string;\n  ${extra}}\n`;
const MESSAGES_PAGE = (name: string): string =>
  `export interface ${name} {\n  readonly chatId: string;\n  readonly items: readonly string[];\n  readonly nextCursor: string | null;\n  readonly total: number;\n}\n`;

type HandShape = InterfaceDeclaration | TypeAliasDeclaration;

/** The relation of a hand shape to the production type it is bound to, read from assignability both ways. */
const RELATIONS = {
  copies: "copies",
  narrows: "narrows (projects a subset of)",
  widens: "widens (adds fields to)",
  diverges: "diverges from",
} as const;
type Relation = keyof typeof RELATIONS;

/** e2e specs and helpers, and every test-tree module that is not itself a test: stories, fixtures, harnesses. */
function isJudged(path: string): boolean {
  return path.startsWith(E2E) || (path.startsWith(TESTS) && classifyTestFilename(path) === undefined);
}

/** An interface with no `extends`, or an alias whose body is a type literal: the shape is spelled, not derived. */
function handShape(node: HandShape): boolean {
  return N.isInterfaceDeclaration(node) ? node.getHeritageClauses().length === 0 : node.getTypeNode()?.getKind() === SyntaxKind.TypeLiteral;
}

/** Literals and function expressions have an anonymous type no declaration names, so they bind nothing. */
const ANONYMOUS_VALUE_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ObjectLiteralExpression,
  SyntaxKind.ArrayLiteralExpression,
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateExpression,
  SyntaxKind.NumericLiteral,
  SyntaxKind.TrueKeyword,
  SyntaxKind.FalseKeyword,
  SyntaxKind.NullKeyword,
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
  SyntaxKind.RegularExpressionLiteral,
]);

/** The expressions a node hands to a position the checker compares against a declared type. */
function boundExpressions(node: Node): readonly Node[] {
  if (N.isCallExpression(node) || N.isNewExpression(node)) {
    return node.getArguments();
  }
  if (N.isVariableDeclaration(node) || N.isPropertyAssignment(node)) {
    return [node.getInitializer()].filter((expression) => expression !== undefined);
  }
  if (N.isReturnStatement(node)) {
    return [node.getExpression()].filter((expression) => expression !== undefined);
  }
  if (N.isAsExpression(node) || N.isSatisfiesExpression(node)) {
    return [node.getExpression()];
  }
  if (N.isBinaryExpression(node) && node.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
    return [node.getRight()];
  }
  return [];
}

/** The nominal type a value carries: nullables stripped, array elements opened. A union is left whole, because a
 *  value passed to `A | B` is bound to neither member alone. */
function leaf(type: Type): Type {
  const plain = type.getNonNullableType();
  const element = plain.isArray() || plain.isReadonlyArray() ? plain.getTypeArguments()[0] : undefined;
  return element === undefined ? plain : leaf(element);
}

function declarationsOf(type: Type): readonly Node[] {
  return [type.getAliasSymbol(), type.getSymbol()].flatMap((symbol) => symbol?.getDeclarations() ?? []);
}

/** The name a production type is known by: its own, or for an anonymous literal the declarations that enclose it. */
function nameOf(type: Type, declaration: Node): string {
  const own = (type.getAliasSymbol() ?? type.getSymbol())?.getName();
  if (own !== undefined && !own.startsWith("__")) {
    return own;
  }
  const enclosing: string[] = [];
  for (let parent = declaration.getParent(); parent !== undefined; parent = parent.getParent()) {
    if (N.hasName(parent)) {
      enclosing.unshift(parent.getName());
    }
  }
  return enclosing.join(".") || "anonymous";
}

interface Binding {
  readonly hand: Type;
  readonly handNode: HandShape;
  readonly production: Type;
  readonly productionNode: Node;
  /** The production type's own name when its declaration does not give one (a table's row type). */
  readonly label?: string;
}

/** The judged hand shape a type is, or the one it extends: a value typed by a derived interface keeps its base's fields. */
function handOf(type: Type, candidates: ReadonlyMap<Node, HandShape>): { readonly type: Type; readonly node: HandShape } | undefined {
  const node = declarationsOf(type)
    .map((declaration) => candidates.get(declaration))
    .find((candidate) => candidate !== undefined);
  if (node !== undefined) {
    return { type, node };
  }
  return type
    .getBaseTypes()
    .map((base) => handOf(base, candidates))
    .find((found) => found !== undefined);
}

/** The binding of one direction: `handSide` is where a judged hand shape may sit, `otherSide` where production may. */
function bindingAcross(
  handSide: Type,
  otherSide: Type,
  candidates: ReadonlyMap<Node, HandShape>,
  isProduction: (declaration: Node) => boolean,
): readonly Binding[] {
  const hand = handOf(leaf(handSide), candidates);
  const production = leaf(otherSide);
  const productionNode = hand === undefined ? undefined : declarationsOf(production).find(isProduction);
  return hand === undefined || productionNode === undefined ? [] : [{ hand: hand.type, handNode: hand.node, production, productionNode }];
}

/** Every site whose one side is a judged hand shape and whose other side is a type declared outside the test tree. */
function bindingsOf(sites: readonly Node[], candidates: ReadonlyMap<Node, HandShape>, isProduction: (declaration: Node) => boolean): readonly Binding[] {
  const namedByType = new Map<unknown, boolean>();
  const isNamed = (type: Type): boolean => {
    const plain = leaf(type);
    const known = namedByType.get(plain.compilerType);
    if (known !== undefined) {
      return known;
    }
    const named = handOf(plain, candidates) !== undefined || declarationsOf(plain).some(isProduction);
    namedByType.set(plain.compilerType, named);
    return named;
  };
  return sites
    .filter((node) => N.isExpression(node))
    .flatMap((site) => {
      const value = site.getType();
      const contextual = isNamed(value) ? site.getContextualType() : undefined;
      if (contextual === undefined) {
        return [];
      }
      return [...bindingAcross(value, contextual, candidates, isProduction), ...bindingAcross(contextual, value, candidates, isProduction)];
    });
}

/** Assignability both ways: production into the hand shape, then the hand shape into production. */
const RELATION_BY_DIRECTIONS: Readonly<Record<string, Relation>> = {
  "true:true": "copies",
  "true:false": "narrows",
  "false:true": "widens",
  "false:false": "diverges",
};

interface DeclaredShape {
  readonly node: Node;
  readonly type: Type;
  readonly label?: string;
  readonly names: ReadonlySet<string>;
  /** Some property is optional: a defaults-shaped override or patch. */
  readonly hasOptional: boolean;
}

/** The shape of a plain object type, or undefined for a union, array, tuple, callable or empty type. */
function shapeOfType(node: Node, type: Type, label?: string): DeclaredShape | undefined {
  if (!type.isObject() || type.isArray() || type.isTuple() || type.getCallSignatures().length > 0) {
    return;
  }
  const properties = type.getProperties();
  return properties.length === 0
    ? undefined
    : {
        node,
        type,
        ...(label === undefined ? {} : { label }),
        names: new Set(properties.map((property) => property.getName())),
        hasOptional: properties.some((property) => property.hasFlags(ts.SymbolFlags.Optional)),
      };
}

/** An exported interface or alias, or an exported table of the database package, owns production shapes. */
function ownsProductionShape(node: Node, file: string): boolean {
  if (N.isInterfaceDeclaration(node) || N.isTypeAliasDeclaration(node)) {
    return node.hasExportKeyword();
  }
  return N.isVariableDeclaration(node) && file.startsWith(DB_HOME) && node.isExported();
}

/** The production shapes one exported declaration owns: an interface or alias is one; a database table is its select
 *  and insert row types (the `packages/db` type home). */
function productionShapesOf(node: Node): readonly DeclaredShape[] {
  if (N.isInterfaceDeclaration(node) || N.isTypeAliasDeclaration(node)) {
    return [shapeOfType(node, node.getType())].filter((shape) => shape !== undefined);
  }
  if (!N.isVariableDeclaration(node)) {
    return [];
  }
  return ["$inferSelect", "$inferInsert"].flatMap((key) => {
    const row = node.getType().getProperty(key)?.getTypeAtLocation(node);
    return row === undefined ? [] : [shapeOfType(node, row, `${node.getName()}.${key}`)].filter((shape) => shape !== undefined);
  });
}

/** A hand shape is a second spelling of an exported production shape that is assignable to it and either is
 *  assignable back, has exactly its field names, or is overridden by it (the hand shape has an optional field). Judged by
 *  the two types' relation and field sets. A hand shape that fits several production shapes derives from the smallest
 *  of them, by the production type's own field count. */
function declaredCopies(
  hands: readonly HandShape[],
  productions: readonly Node[],
  assignability: { readonly isTypeAssignableTo: (source: unknown, target: unknown) => boolean },
): readonly Binding[] {
  const postings = new Map<string, DeclaredShape[]>();
  for (const production of productions.flatMap(productionShapesOf)) {
    for (const name of production.names) {
      postings.set(name, [...(postings.get(name) ?? []), production]);
    }
  }
  return hands.flatMap((handNode) => {
    const handType = handNode.getType();
    const hand = shapeOfType(handNode, handType);
    if (hand === undefined) {
      return [];
    }
    const narrowest = [...hand.names].map((name) => postings.get(name) ?? []).reduce((least, list) => (list.length < least.length ? list : least));
    const [smallest] = narrowest
      .filter(
        (production) =>
          [...hand.names].every((name) => production.names.has(name)) &&
          assignability.isTypeAssignableTo(production.type.compilerType, handType.compilerType) &&
          (hand.hasOptional ||
            production.names.size === hand.names.size ||
            assignability.isTypeAssignableTo(handType.compilerType, production.type.compilerType)),
      )
      .toSorted((left, right) => left.names.size - right.names.size || (left.label ?? "").localeCompare(right.label ?? ""));
    return smallest === undefined
      ? []
      : [
          {
            hand: handType,
            handNode,
            production: smallest.type,
            productionNode: smallest.node,
            ...(smallest.label === undefined ? {} : { label: smallest.label }),
          },
        ];
  });
}

export const gate = defineGate({
  id: "test-hand-shape",
  family: "contract-derives-not-respells",
  authority: "reviewed-grant",
  severity: "error",
  // Production roots stay in the population so their declarations resolve; only test paths are judged.
  population: ["@tests", "@client", "@ui", "@server", "@db", "@contracts", "@kit", "@inference", "@showcase", "@plugin-toolchain", "@default-content"],
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates = new Map<Node, HandShape>();
    const sites: Node[] = [];
    const productionShapes: Node[] = [];
    let judgedSites = 0;
    return {
      visitors: [
        {
          kinds: [
            SyntaxKind.InterfaceDeclaration,
            SyntaxKind.TypeAliasDeclaration,
            SyntaxKind.CallExpression,
            SyntaxKind.NewExpression,
            SyntaxKind.VariableDeclaration,
            SyntaxKind.PropertyAssignment,
            SyntaxKind.ReturnStatement,
            SyntaxKind.AsExpression,
            SyntaxKind.SatisfiesExpression,
            SyntaxKind.BinaryExpression,
          ],
          visit: (node, sourceFile: SourceFile) => {
            const file = ctx.relativePath(sourceFile);
            if (!file.startsWith(TESTS)) {
              if (ownsProductionShape(node, file)) {
                productionShapes.push(node);
              }
              return;
            }
            if (N.isInterfaceDeclaration(node) || N.isTypeAliasDeclaration(node)) {
              if (isJudged(file) && handShape(node)) {
                candidates.set(node, node);
              }
              return;
            }
            const bound = boundExpressions(node);
            judgedSites += bound.length;
            sites.push(...bound.filter((expression) => !ANONYMOUS_VALUE_KINDS.has(expression.getKind())));
          },
        },
      ],
      evaluate: () => {
        ctx.receipt({ kind: "population", source: "test-value-binding-sites", members: judgedSites });
        const assignability = readAssignabilityChecker(ctx.checker());
        if (assignability === undefined) {
          throw new Error(
            "test-hand-shape: this TypeScript build exposes no `checker.isTypeAssignableTo`, so a hand shape cannot be compared with its production type.",
          );
        }
        const productionFiles = new Map<SourceFile, boolean>();
        const isProduction = (declaration: Node): boolean => {
          const file = declaration.getSourceFile();
          const known = productionFiles.get(file);
          if (known !== undefined) {
            return known;
          }
          const production = !(file.isDeclarationFile() || file.isInNodeModules() || declarationHome(ctx, file).startsWith(TESTS));
          productionFiles.set(file, production);
          return production;
        };
        const reported = new Set<string>();
        const report = ({ handNode, hand, production, productionNode, label }: Binding, evidence: string): void => {
          const directions = `${String(assignability.isTypeAssignableTo(production.compilerType, hand.compilerType))}:${String(assignability.isTypeAssignableTo(hand.compilerType, production.compilerType))}`;
          const relation = RELATION_BY_DIRECTIONS[directions] ?? "diverges";
          const file = ctx.relativePath(handNode.getSourceFile());
          const productionFile = declarationHome(ctx, productionNode.getSourceFile());
          const productionName = label ?? nameOf(production, productionNode);
          const name = handNode.getName();
          const operation = `${relation}:${name}=${productionFile}#${productionName}`;
          if (!reported.has(`${file}|${operation}`)) {
            reported.add(`${file}|${operation}`);
            ctx.report.node(handNode.getNameNode(), {
              token: name,
              offset: 0,
              message: `\`${name}\` ${RELATIONS[relation]} \`${productionName}\` (${productionFile}), ${evidence}. ${MESSAGE}`,
              subject: file,
              operation,
            });
          }
        };
        for (const binding of bindingsOf(sites, candidates, isProduction)) {
          report(binding, "which a value in the test tree is bound to");
        }
        for (const binding of declaredCopies([...candidates.values()], productionShapes, assignability)) {
          report(binding, "and nothing derives the hand shape from it");
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", "readonly at: number;\n"),
        [E2E_HELPER]: `import type { WireCapture as ServerCapture } from "../../../${WIRE_CAPTURE_HOME}";\n${WIRE_CAPTURE("backend", "")}export declare const served: ServerCapture;\nexport const read = (capture: WireCapture): string => capture.backend;\nexport const seen = read(served);\n`,
      },
      expect: { count: 1, token: "WireCapture", messageIncludes: "diverges from" },
      grant: { subject: E2E_HELPER, operation: `diverges:WireCapture=${WIRE_CAPTURE_HOME}#WireCapture` },
      why: "THE FOUNDING DRIFT: the e2e mirror says `backend` where the server sends `providerId`, and the server value is passed to the mirror's reader. The server type, not a shared field name, is the evidence",
    },
    {
      mode: "types",
      files: {
        [MESSAGES_HOME]: MESSAGES_PAGE("MessagesPage"),
        "tests/client/features/chat/_ct-stories.tsx": `import type { MessagesPage } from "../../../../${MESSAGES_HOME}";\n${MESSAGES_PAGE("PageRows")}export declare const served: MessagesPage;\nexport const rows: PageRows = served;\n`,
      },
      expect: { count: 1, token: "PageRows", messageIncludes: "copies" },
      why: "THE RENAMED COPY: a story module declares a contract's fields under a name production never exports, and annotates the contract's value with it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/contract/cursor.ts": "export interface Cursor {\n  readonly id: string;\n  readonly at: number;\n}\n",
        "tests/e2e/rpg-lite-loop.spec.ts": `import type { Cursor } from "../../packages/server/src/domain/x/contract/cursor.ts";\ntype Seen = { readonly id: string; readonly at: number };\nexport declare const served: Cursor;\nexport const seen: Seen = served;\n`,
      },
      expect: { count: 1, token: "Seen", messageIncludes: "copies" },
      why: "no field-count floor: a two-field type-literal alias in an e2e spec is the same hand shape once a production value annotates it",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", ""),
        "tests/support/node/capture-head.ts": `import type { WireCapture } from "../../../${WIRE_CAPTURE_HOME}";\nexport interface Head {\n  readonly chatId: string;\n  readonly api: string;\n}\nexport declare const served: WireCapture;\nexport const head = served as Head;\n`,
      },
      expect: { count: 1, token: "Head", messageIncludes: "narrows" },
      why: "A CAST IS A BINDING: a hand projection of a production type that the production value is cast to still compiles after the server renames a field the projection keeps, so it takes `Pick`",
    },
    {
      mode: "types",
      files: {
        [MESSAGES_HOME]: MESSAGES_PAGE("MessagesPage"),
        "tests/client/features/chat/_ct-stories.tsx": `import type { MessagesPage } from "../../../../${MESSAGES_HOME}";\n${MESSAGES_PAGE("PageRows")}export interface ScopedRows extends PageRows {\n  readonly scope: string;\n}\nexport declare const served: MessagesPage;\nexport declare const scoped: ScopedRows;\nexport const asServed: MessagesPage = scoped;\n`,
      },
      expect: { count: 1, token: "PageRows", messageIncludes: "copies" },
      why: "A DERIVED INTERFACE KEEPS ITS BASE'S FIELDS: a value typed by an interface that extends the hand shape is bound to production through the shape it extends",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/contract/summary.ts":
          'export interface Summary {\n  readonly id: "a" | "b";\n  readonly title: string;\n  readonly starred: boolean;\n}\n',
        "tests/server/domain/x/_support.ts":
          'export interface SummaryFixture {\n  readonly id: string;\n  readonly title: string;\n  readonly starred: boolean;\n}\nexport const fixture: SummaryFixture = { id: "a", title: "t", starred: false };\n',
      },
      expect: { count: 1, token: "SummaryFixture", messageIncludes: "narrows" },
      why: "A LOOSENED COPY: the hand shape has the production shape's field names with wider types, so the production type is assignable to it and a retyped field still compiles. No value need bind it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/contract/view.ts":
          "export interface AccountView {\n  readonly id: string;\n  readonly handle: string;\n  readonly role: string;\n  readonly createdAt: number;\n  readonly disabled: boolean;\n}\n",
        "tests/server/domain/x/_support.ts":
          'export interface SeedAccountOverrides {\n  readonly id: string;\n  readonly handle?: string;\n  readonly role?: string;\n}\nexport const overrides: SeedAccountOverrides = { id: "a", role: "owner" };\n',
      },
      expect: { count: 1, token: "SeedAccountOverrides", messageIncludes: "narrows" },
      why: "AN OVERRIDE PROJECTION: the hand shape has optional fields and one production shape carries them all, so the overrides restate that shape's fields without `Partial<Pick<…>>`",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/contract/params.ts":
          "export interface LookupParams {\n  readonly handle: string;\n  readonly scope: string;\n  readonly limit?: number;\n}\n",
        "tests/server/domain/x/_support.ts":
          'export interface LookupCall {\n  readonly handle: string;\n  readonly scope: string;\n}\nexport const call: LookupCall = { handle: "h", scope: "s" };\n',
      },
      expect: { count: 1, token: "LookupCall", messageIncludes: "copies" },
      why: "MUTUAL ASSIGNABILITY: the production shape differs only by an optional field, so each type is assignable to the other and the hand shape is the same type spelled twice",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/contract/a.ts":
          "export interface AView {\n  readonly id: string;\n  readonly name: string;\n  readonly extra: string;\n}\n",
        "packages/server/src/domain/x/contract/b.ts": "export interface BView {\n  readonly id: string;\n  readonly label: string;\n}\n",
        "tests/server/domain/x/_support.ts": 'export interface IdOnly {\n  readonly id?: string;\n}\nexport const row: IdOnly = { id: "a" };\n',
      },
      expect: { count: 1, token: "IdOnly", messageIncludes: "`BView`" },
      why: "SEVERAL FITS DERIVE FROM THE SMALLEST: a hand shape that fits several production shapes is still a copy, reported against the production type with the fewest fields",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/users.ts":
          "export declare const users: {\n  readonly $inferSelect: {\n    readonly id: string;\n    readonly handle: string;\n    readonly role: string;\n    readonly passwordHash: string | null;\n  };\n};\n",
        "tests/server/domain/admin/_support.ts":
          'export interface SeedUserOverrides {\n  readonly id?: string;\n  readonly handle?: string;\n  readonly passwordHash?: string | null;\n}\nexport const overrides: SeedUserOverrides = { id: "a" };\n',
      },
      expect: { count: 1, token: "SeedUserOverrides", messageIncludes: "users.$inferSelect" },
      why: "A ROW TYPE IS A PRODUCTION SHAPE: the database package is the home of row types, so an override shape that restates a table's columns copies that table's `$inferSelect`",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", ""),
        "tests/e2e/support/trpc.ts": `import type { WireCapture } from "../../../${WIRE_CAPTURE_HOME}";\nexport interface Marker {\n  readonly kind: string;\n}\nexport declare const marker: Marker;\nexport declare function take(value: WireCapture | Marker): void;\ntake(marker);\n`,
      },
      why: "A UNION IS NOT A BINDING: a value passed to `Production | Hand` is bound to neither member alone",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", ""),
        [E2E_HELPER]: `import type { WireCapture as ServerCapture } from "../../../${WIRE_CAPTURE_HOME}";\nexport type WireCapture = Pick<ServerCapture, "providerId">;\nexport interface Capture extends ServerCapture {\n  readonly seen: boolean;\n}\nexport declare const served: ServerCapture;\nexport const seen: Capture = { ...served, seen: true };\n`,
      },
      why: "DERIVED SHAPES PASS: an alias over the production type and an interface extending it follow every production change",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", ""),
        [E2E_HELPER]:
          'export interface WireCapture {\n  readonly id: string;\n  readonly title: string;\n  readonly accent: string;\n  readonly custom: boolean;\n}\nexport const row: WireCapture = { id: "a", title: "b", accent: "c", custom: false };\n',
      },
      why: "A NAME IS NOT A SHAPE: the helper reuses a production type's name for an unrelated row, and no value ties it to the export",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/contract/user.ts":
          "export interface UserRow {\n  readonly id: string;\n  readonly name: string;\n  readonly createdAt: number;\n  readonly updatedAt: number;\n  readonly email: string;\n}\n",
        "tests/server/domain/x/_support.ts":
          'export interface Row {\n  readonly id: string;\n  readonly name: string;\n  readonly createdAt: number;\n  readonly updatedAt: number;\n}\nexport const row: Row = { id: "a", name: "b", createdAt: 1, updatedAt: 2 };\n',
      },
      why: "GENERIC FIELDS ARE NOT A COPY: a row sharing id, name, createdAt and updatedAt with an unrelated production row is bound to no production value, so nothing says it copies that row",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", ""),
        "tests/client/features/chat/capture.ct.tsx": `import type { WireCapture as ServerCapture } from "../../../../${WIRE_CAPTURE_HOME}";\n${WIRE_CAPTURE("backend", "")}export declare const served: ServerCapture;\nexport const read = (capture: WireCapture): string => capture.backend;\nexport const seen = read(served);\n`,
      },
      why: "POPULATION: a test file outside e2e is not a support module; this policy judges the shared helpers many tests import",
    },
  ],
});
