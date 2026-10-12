// Policy: test-hand-shape (docs/law/Spine-Testing.md §10, "Derive types") — e2e code and test support modules may not
// hand-declare an object shape that a production value is bound to. A hand shape is an interface with no `extends`, or
// an alias of a type literal, declared in e2e or a non-test support module. It is bound to production when, at a site
// the checker judges (an argument, an initializer, a return, a property value, an assignment, a cast or `satisfies`),
// one side's type is that hand shape and the other's is declared outside the test tree. Judged by type: the relation
// of the two types decides the wording (copies, narrows, widens, diverges), never a field name or a count. A shape
// bound to no production value passes whatever fields it shares. DECLARED LIMIT: only whole-type bindings are seen;
// a hand shape reached through a mapped or generic wrapper (`Partial<Hand>`) is not unwrapped.
// FAMILY `contract-derives-not-respells`. Debt: `lib/reviewed-grants-test-hand-shape.ts`.
import type { InterfaceDeclaration, Node, SourceFile, Type, TypeAliasDeclaration } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { readAssignabilityChecker } from "../../floor/code-facts/assignability.ts";
import { classifyTestFilename } from "../../floor/testing/test-kinds.ts";
import { defineGate } from "../contract/policy.ts";
import { declarationHome } from "../lib/declaration-home.ts";

const TESTS = "tests/";
const E2E = "tests/e2e/";
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
  return sites
    .filter((node) => N.isExpression(node))
    .flatMap((site) => {
      const value = site.getType();
      const named =
        declarationsOf(leaf(value)).some((declaration) => candidates.has(declaration) || isProduction(declaration)) || leaf(value).getBaseTypes().length > 0;
      const contextual = named ? site.getContextualType() : undefined;
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
        const isProduction = (declaration: Node): boolean => {
          const file = declaration.getSourceFile();
          return !(file.isDeclarationFile() || file.isInNodeModules() || declarationHome(ctx, file).startsWith(TESTS));
        };
        const reported = new Set<string>();
        for (const { hand, handNode, production, productionNode } of bindingsOf(sites, candidates, isProduction)) {
          const directions = `${String(assignability.isTypeAssignableTo(production.compilerType, hand.compilerType))}:${String(assignability.isTypeAssignableTo(hand.compilerType, production.compilerType))}`;
          const relation = RELATION_BY_DIRECTIONS[directions] ?? "diverges";
          const file = ctx.relativePath(handNode.getSourceFile());
          const productionFile = declarationHome(ctx, productionNode.getSourceFile());
          const productionName = nameOf(production, productionNode);
          const name = handNode.getName();
          const operation = `${relation}:${name}=${productionFile}#${productionName}`;
          if (!reported.has(`${file}|${operation}`)) {
            reported.add(`${file}|${operation}`);
            ctx.report.node(handNode.getNameNode(), {
              token: name,
              offset: 0,
              message: `\`${name}\` ${RELATIONS[relation]} \`${productionName}\` (${productionFile}), which a value in the test tree is bound to. ${MESSAGE}`,
              subject: file,
              operation,
            });
          }
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
