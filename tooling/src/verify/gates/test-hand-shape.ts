// Policy: test-hand-shape (docs/law/Spine-Testing.md §10, "Derive types") — e2e code and test support modules may not
// hand-declare an object shape production owns: an interface or type-literal alias named as a type a production module
// exports, or whose fields copy one exported shape (`lib/contract-structural-copy.ts`). Derived aliases pass.
// FAMILY `contract-derives-not-respells`: the structural arm is that family's reader, over the test tree.
// Existing hand shapes are reviewed-grant rows in `lib/reviewed-grants-test-hand-shape.ts`.
import type { InterfaceDeclaration, SourceFile, TypeAliasDeclaration } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { classifyTestFilename } from "../../floor/testing/test-kinds.ts";
import { defineGate } from "../contract/policy.ts";
import type { ContractFieldShape } from "../lib/contract-structural-copy.ts";
import { bestCopyMatch, candidateFields, contractFields, indexByField } from "../lib/contract-structural-copy.ts";

const TESTS = "tests/";
const E2E = "tests/e2e/";
const NAME_OPERATION = "respells";
const COPY_OPERATION = "copies";
const LAW = "(docs/law/Spine-Testing.md §10)";
const MESSAGE = `a test support or e2e module hand-declares a shape production owns, so a renamed or retyped field still compiles here and drifts silently ${LAW}.`;
const FIX =
  "import the production type, or derive it (`TrpcWireOutput`, `inferOutput`, `z.infer`, `Pick<…>`, an indexed access). A shape with no contract home gets one first. Existing shapes are reviewed-grant rows naming their burn-down item; a new shape derives, never a row.";

const WIRE_CAPTURE_HOME = "packages/server/src/foundation/observability/debug/wire-capture.ts";
const MESSAGES_HOME = "packages/contracts/src/chat/message-pages.ts";
const E2E_HELPER = "tests/e2e/support/trpc.ts";
const MESSAGES_PAGE = (name: string): string =>
  `export interface ${name} {\n  readonly chatId: string;\n  readonly items: readonly string[];\n  readonly nextCursor: string | null;\n  readonly total: number;\n}\n`;

type HandShape = InterfaceDeclaration | TypeAliasDeclaration;

/** e2e specs and helpers, and every test-tree module that is not itself a test: stories, fixtures, harnesses. */
function isJudged(path: string): boolean {
  return path.startsWith(E2E) || (path.startsWith(TESTS) && classifyTestFilename(path) === undefined);
}

/** An interface with no `extends`, or an alias whose body is a type literal: the shape is spelled, not derived. */
function handShape(node: HandShape): boolean {
  return N.isInterfaceDeclaration(node) ? node.getHeritageClauses().length === 0 : node.getTypeNode()?.getKind() === SyntaxKind.TypeLiteral;
}

function exportedShapes(sourceFile: SourceFile): readonly (readonly [string, HandShape])[] {
  return [...sourceFile.getExportedDeclarations()].flatMap(([name, declarations]) =>
    declarations.flatMap((declaration) =>
      (N.isInterfaceDeclaration(declaration) || N.isTypeAliasDeclaration(declaration)) && declaration.getSourceFile() === sourceFile
        ? [[name, declaration] as const]
        : [],
    ),
  );
}

export const gate = defineGate({
  id: "test-hand-shape",
  family: "contract-derives-not-respells",
  authority: "reviewed-grant",
  severity: "error",
  // Production roots are read for the index of exported shapes and never judged.
  population: ["@tests", "@client", "@ui", "@server", "@db", "@contracts", "@kit", "@inference", "@showcase", "@plugin-toolchain", "@default-content"],
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // Every production file exporting a type under one name; the first, in corpus order, keys the grant.
    const byName = new Map<string, string[]>();
    const fields: ContractFieldShape[] = [];
    const candidates: { readonly node: HandShape; readonly file: string }[] = [];
    return {
      visitFile: (sourceFile) => {
        const file = ctx.relativePath(sourceFile);
        if (file.startsWith(TESTS)) {
          return;
        }
        for (const [name, declaration] of exportedShapes(sourceFile)) {
          byName.set(name, [...(byName.get(name) ?? []), file]);
          const shape = contractFields(declaration);
          if (shape !== undefined) {
            fields.push({ name, file, fields: shape });
          }
        }
      },
      visitors: [
        {
          kinds: [SyntaxKind.InterfaceDeclaration, SyntaxKind.TypeAliasDeclaration],
          visit: (node, sourceFile) => {
            const file = ctx.relativePath(sourceFile);
            if ((N.isInterfaceDeclaration(node) || N.isTypeAliasDeclaration(node)) && isJudged(file) && handShape(node)) {
              candidates.push({ node, file });
            }
          },
        },
      ],
      evaluate: () => {
        ctx.receipt({ kind: "population", source: "production-exported-shapes", members: byName.size });
        const index = indexByField(fields);
        for (const { node, file } of candidates) {
          const name = node.getName();
          const anchor = { token: name, offset: 0 } as const;
          const [owner, ...others] = byName.get(name) ?? [];
          if (owner !== undefined) {
            ctx.report.node(node.getNameNode(), {
              ...anchor,
              message: `\`${name}\` is the name of a type ${[owner, ...others].join(", ")} exports. ${MESSAGE}`,
              subject: file,
              operation: `${NAME_OPERATION}:${name}=${owner}`,
            });
            continue;
          }
          const own = N.isInterfaceDeclaration(node) ? node : node.getTypeNodeOrThrow().asKindOrThrow(SyntaxKind.TypeLiteral);
          const ownFields = candidateFields(own);
          const match = ownFields === undefined ? undefined : bestCopyMatch(ownFields, index);
          if (match !== undefined) {
            ctx.report.node(node.getNameNode(), {
              ...anchor,
              message: `\`${name}\` declares ${String(match.shared)} of the fields of \`${match.contract.name}\` (${match.contract.file}). ${MESSAGE}`,
              subject: file,
              operation: `${COPY_OPERATION}:${name}=${match.contract.file}#${match.contract.name}`,
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
        [WIRE_CAPTURE_HOME]: "export interface WireCapture {\n  readonly providerId: string;\n  readonly url: string;\n}\n",
        [E2E_HELPER]: "export interface WireCapture {\n  readonly backend: string;\n  readonly url: string;\n}\n",
      },
      expect: { count: 1, token: "WireCapture", messageIncludes: "is the name of a type" },
      grant: { subject: E2E_HELPER, operation: `respells:WireCapture=${WIRE_CAPTURE_HOME}` },
      why: "THE FOUNDING DRIFT: the e2e mirror of the server's capture says `backend` where the server sends `providerId`, so no field-set comparison sees it. The declared name owned by a production export is the evidence",
    },
    {
      mode: "types",
      files: {
        [MESSAGES_HOME]: MESSAGES_PAGE("MessagesPage"),
        "tests/client/features/chat/_ct-stories.tsx": MESSAGES_PAGE("PageRows"),
      },
      expect: { count: 1, token: "PageRows", messageIncludes: "of the fields of `MessagesPage`" },
      why: "THE RENAMED COPY: a story module declares a contract's fields under a name production never exports, which only the structural arm sees",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: "export interface WireCapture {\n  readonly providerId: string;\n}\n",
        "tests/e2e/rpg-lite-loop.spec.ts":
          "type WireCapture = { readonly backend: string };\nexport const read = (capture: WireCapture): string => capture.backend;\n",
      },
      expect: { count: 1, token: "WireCapture", messageIncludes: "is the name of a type" },
      why: "a local type-literal alias inside an e2e spec is the same hand shape as an interface in its helper",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: "export interface WireCapture {\n  readonly providerId: string;\n}\n",
        [E2E_HELPER]: `import type { WireCapture as ServerCapture } from "../../../${WIRE_CAPTURE_HOME}";\nexport type WireCapture = Pick<ServerCapture, "providerId">;\nexport interface Capture extends ServerCapture {\n  readonly seen: boolean;\n}\n`,
      },
      why: "DERIVED SHAPES PASS: an alias over the production type and an interface extending it follow every production change",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: "export interface WireCapture {\n  readonly providerId: string;\n}\n",
        "tests/client/features/chat/capture.ct.tsx":
          "interface WireCapture {\n  readonly backend: string;\n}\nexport const read = (capture: WireCapture): string => capture.backend;\n",
      },
      why: "POPULATION: a test file outside e2e is not a support module; this policy judges the shared helpers many tests import",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]:
          "interface WireCapture {\n  readonly providerId: string;\n}\nexport interface CaptureUrl {\n  readonly url: string;\n}\nexport const capture = (row: WireCapture): string => row.providerId;\n",
        [E2E_HELPER]: "export interface WireCapture {\n  readonly backend: string;\n}\n",
      },
      why: "a production type the module never exports owns no name a test could import",
    },
  ],
});
