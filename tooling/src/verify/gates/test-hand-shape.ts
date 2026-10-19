// Handwritten e2e/support shapes must derive at direct annotated initializers, assignments, arguments and returns, judged by canonical native declarations (D328).
// Boundaries resolve through aliases and a bounded walk of wrappers, containers, unions and intersections; function values and generic production parameters are UNKNOWN.
// No-owner is clean only when no production declaration can own the site; an unseen identity or constructor argument is UNKNOWN, never a finding.
// Limits: object literals and their properties, test classes, and workspace production .d.ts types are never judged or owners.
// Singleton: direct boundary ownership is not the structural-copy family's field-fit judgment.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { baseReferences, readShapeAssociation, shapeAssociationQuestions, shapeAssociationSites } from "../../floor/code-facts/shape-association.ts";
import type { ShapeAssociation, ShapeAssociationSite } from "../../floor/code-facts/shape-association-contract.ts";
import { classifyTestFilename } from "../../floor/testing/test-kinds.ts";
import { isLegacyTestPath } from "../../floor/testing/test-population.ts";
import { defineGate } from "../contract/policy.ts";
import { declarationHome } from "../lib/declaration-home.ts";
import { typeObservationPlan, typeObservationReaders } from "../lib/type-observation-context.ts";

const TESTS = "tests/";
const E2E = "tests/e2e/";
const LAW = "(docs/law/Spine-Testing.md §10)";
const MESSAGE = `a test support or e2e module hand-declares a production boundary type instead of deriving it ${LAW}.`;
const FIX =
  "import the production type, or derive it (`TrpcWireOutput`, `inferOutput`, `z.infer`, `Pick<…>`, an indexed access). A shape with no contract home gets one first. A hand shape derives; it never takes a grant row.";

const WIRE_CAPTURE_HOME = "packages/server/src/foundation/observability/debug/wire-capture.ts";
const MESSAGES_HOME = "packages/contracts/src/chat/message-pages.ts";
const E2E_HELPER = "tests/e2e/support/trpc.ts";
const WIRE_CAPTURE = (provider: string, extra: string): string =>
  `export interface WireCapture {\n  readonly chatId: string;\n  readonly api: string;\n  readonly ${provider}: string;\n  readonly model: string;\n  readonly body: string;\n  ${extra}}\n`;
const MESSAGES_PAGE = (name: string): string =>
  `export interface ${name} {\n  readonly chatId: string;\n  readonly items: readonly string[];\n  readonly nextCursor: string | null;\n  readonly total: number;\n}\n`;

/** e2e specs and helpers, and every test-tree module that is not itself a test: stories, fixtures, harnesses. */
function isJudged(path: string): boolean {
  return !isLegacyTestPath(path) && (path.startsWith(E2E) || (path.startsWith(TESTS) && classifyTestFilename(path) === undefined));
}

export const gate = defineGate({
  id: "test-hand-shape",
  family: "test-hand-shape",
  authority: "reviewed-grant",
  severity: "error",
  // Production declarations supply boundary ownership and are never judged.
  population: ["@tests", "@client", "@ui", "@server", "@db", "@contracts", "@kit", "@inference", "@showcase", "@plugin-toolchain", "@default-content"],
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const sites: ShapeAssociationSite[] = [];
    const heritage: Node[] = [];
    let sources: readonly SourceFile[] = [];
    let plan: InventoryInvocationPlan | undefined;
    if (ctx.nativeTypes === undefined) {
      throw new Error("native shape context is unavailable");
    }
    const native = ctx.nativeTypes;
    const isHand = (node: ShapeAssociation["hand"]): boolean => {
      const home = declarationHome(ctx, node.getSourceFile());
      return ctx.includesSubject(home) && isJudged(home);
    };
    const isProduction = (node: Node): boolean =>
      !(node.getSourceFile().isDeclarationFile() || node.getSourceFile().isInNodeModules()) &&
      declarationHome(ctx, node.getSourceFile()).startsWith("packages/");
    const reported = new Set<string>();
    const reportAssociation = ({ hand, production }: ShapeAssociation): void => {
      const name = hand.getName();
      const file = declarationHome(ctx, hand.getSourceFile());
      const home = declarationHome(ctx, production.getSourceFile());
      const operation = `boundary:${name}=${home}#${production.getName()}`;
      const key = `${file}#${operation}`;
      if (reported.has(key)) {
        return;
      }
      reported.add(key);
      ctx.report.node(hand.getNameNode(), {
        token: name,
        offset: 0,
        message: `\`${name}\` hand-declares the production boundary \`${production.getName()}\` (${home}). ${MESSAGE}`,
        subject: file,
        operation,
      });
    };
    return {
      visitors: [
        {
          kinds: [
            SyntaxKind.VariableDeclaration,
            SyntaxKind.PropertyDeclaration,
            SyntaxKind.Parameter,
            SyntaxKind.BinaryExpression,
            SyntaxKind.CallExpression,
            SyntaxKind.NewExpression,
            SyntaxKind.ReturnStatement,
            SyntaxKind.ArrowFunction,
            SyntaxKind.InterfaceDeclaration,
            SyntaxKind.TypeAliasDeclaration,
          ],
          visit: (node, sourceFile) => {
            const file = ctx.relativePath(sourceFile);
            if (file.startsWith(TESTS)) {
              sites.push(...shapeAssociationSites(node));
              heritage.push(...baseReferences(node));
            }
          },
        },
      ],
      prepare: () => {
        sources = [...new Set(sites.map((site) => site.boundary.getSourceFile()))];
        if (sources.length > 0) {
          plan = typeObservationPlan(sources, [], shapeAssociationQuestions(sites, heritage));
          native.request({ kind: "invocation-evidence", nodes: sources, plan });
        }
      },
      evaluate: () => {
        ctx.receipt({ kind: "population", source: "shape-boundary-syntax-population", members: ctx.files.length });
        if (plan === undefined) {
          return;
        }
        const readers = typeObservationReaders(native.invocationEvidence(sources, plan));
        for (const site of sites) {
          const reader = readers.get(site.boundary.getSourceFile());
          if (reader === undefined) {
            throw new Error("test-hand-shape native boundary reader is unavailable");
          }
          const verdict = readShapeAssociation(site, reader, isHand, isProduction);
          if (verdict.kind === "unknown") {
            ctx.report.analysis(site.value, verdict);
            continue;
          }
          ctx.report.analysis(site.value, { kind: "supported" });
          if (verdict.kind === "associated") {
            reportAssociation(verdict.value);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [MESSAGES_HOME]: MESSAGES_PAGE("MessagesPage"),
        [E2E_HELPER]: `import type { MessagesPage } from "../../../${MESSAGES_HOME}";\ninterface Head { readonly chatId: string; readonly total: number; }\ndeclare const head: Head;\nexport const page: MessagesPage = head;`,
      },
      expect: { count: 1, token: "Head", messageIncludes: "production boundary" },
      why: "a direct explicit production annotation witnesses a handwritten declaration even below the former field-count floor",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", "readonly at: number;\n"),
        [E2E_HELPER]: `${WIRE_CAPTURE("backend", "")}import type { WireCapture as ServerCapture } from "../../../${WIRE_CAPTURE_HOME}";\ndeclare const capture: WireCapture;\nexport const seen: ServerCapture = capture;`,
      },
      expect: { count: 1, token: "WireCapture", messageIncludes: "production boundary `WireCapture`" },
      grant: { subject: E2E_HELPER, operation: `boundary:WireCapture=${WIRE_CAPTURE_HOME}#WireCapture` },
      why: "the founding backend/providerId drift retains its original fields and gains a direct explicit production boundary",
    },
    {
      mode: "types",
      files: {
        [MESSAGES_HOME]: MESSAGES_PAGE("MessagesPage"),
        "tests/client/features/chat/_ct-stories.tsx": `${MESSAGES_PAGE("PageRows")}import type { MessagesPage as Page } from "../../../../${MESSAGES_HOME}";\ndeclare const rows: PageRows;\nexport function page(): Page { return rows; }`,
      },
      expect: { count: 1, token: "PageRows", messageIncludes: "production boundary `MessagesPage`" },
      why: "a renamed copy crosses an explicitly annotated production return boundary through an import alias",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: `${WIRE_CAPTURE("providerId", "")}export function take(capture: WireCapture): void { void capture; }`,
        "tests/e2e/rpg-lite-loop.spec.ts": `type Capture = { readonly chatId: string; readonly api: string; readonly backend: string; readonly model: string; readonly body: string };\nexport const read = (capture: Capture): string => capture.backend;\nimport { take as accept } from "../../${WIRE_CAPTURE_HOME}";\ndeclare const capture: Capture;\naccept(capture);`,
      },
      expect: { count: 1, token: "Capture", messageIncludes: "production boundary `WireCapture`" },
      why: "the original e2e type-literal drift crosses the actual resolved production parameter through an import alias",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [MESSAGES_HOME]: MESSAGES_PAGE("MessagesPage"),
        "tests/legacy/support/hand.ts": `${MESSAGES_PAGE("LegacyHand")}export declare const hand: LegacyHand;`,
        [E2E_HELPER]: `import type { MessagesPage } from "../../../${MESSAGES_HOME}";\nimport { hand } from "../../legacy/support/hand.ts";\nexport const seen: MessagesPage = hand;`,
      },
      why: "D320 excludes a legacy handwritten origin from judgment even when it remains in the native dependency closure",
    },
    {
      mode: "types",
      files: { [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", "readonly at: number;\n"), [E2E_HELPER]: WIRE_CAPTURE("backend", "") },
      why: "the historical unconnected founding drift has no witnessed boundary; untyped transport mirrors are no longer statically certified",
    },
    {
      mode: "types",
      files: { [MESSAGES_HOME]: MESSAGES_PAGE("MessagesPage"), "tests/client/features/chat/_ct-stories.tsx": MESSAGES_PAGE("PageRows") },
      why: "the historical renamed declaration alone supplies no production association, even when structurally identical",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", ""),
        "tests/e2e/rpg-lite-loop.spec.ts":
          "type Capture = { readonly chatId: string; readonly api: string; readonly backend: string; readonly model: string; readonly body: string };\nexport const read = (capture: Capture): string => capture.backend;\n",
      },
      why: "the historical local alias and reader retain their source, but no production boundary witnesses ownership",
    },
    {
      mode: "types",
      files: {
        [MESSAGES_HOME]: `${MESSAGES_PAGE("MessagesPage")}export const unrelated = (): number => 1;`,
        [E2E_HELPER]: `import { unrelated as other } from "../../../${MESSAGES_HOME}";\n${MESSAGES_PAGE("Options")}export const n = other();`,
      },
      why: "importing another production value does not associate an independently declared options shape with a production boundary",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", ""),
        [E2E_HELPER]: `import type { WireCapture as ServerCapture } from "../../../${WIRE_CAPTURE_HOME}";\nexport type WireCapture = Pick<ServerCapture, "providerId">;\nexport interface Capture extends ServerCapture {\n  readonly seen: boolean;\n}\n`,
      },
      why: "DERIVED SHAPES PASS: an alias over the production type and an interface extending it follow every production change",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", ""),
        [E2E_HELPER]:
          "export interface WireCapture {\n  readonly id: string;\n  readonly title: string;\n  readonly accent: string;\n  readonly custom: boolean;\n}\n",
      },
      why: "A NAME IS NOT A SHAPE: the helper reuses a production type's name for an unrelated row, and no field ties it to the export",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", ""),
        "tests/client/features/chat/capture.ct.tsx": `${WIRE_CAPTURE("backend", "")}export const read = (capture: WireCapture): string => capture.backend;\n`,
      },
      why: "POPULATION: a test file outside e2e is not a support module; this policy judges the shared helpers many tests import",
    },
  ],
});
