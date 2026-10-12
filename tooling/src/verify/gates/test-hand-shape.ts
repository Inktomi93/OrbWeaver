// Policy: test-hand-shape (docs/law/Spine-Testing.md §10, "Derive types") — e2e code and test support modules may not
// hand-declare an object shape production owns: an interface or type-literal alias whose fields copy one exported
// shape, or that kept most of its field names after drifting. Judged by fields, never by name. DECLARED LIMIT: the
// drift test (4 shared names, 80 %, one retype) is calibrated, and a row of generic field names can trip it. FAMILY
// `contract-derives-not-respells` (`lib/contract-structural-copy.ts`). Debt: `lib/reviewed-grants-test-hand-shape.ts`.
import type { InterfaceDeclaration, SourceFile, TypeAliasDeclaration } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { classifyTestFilename } from "../../floor/testing/test-kinds.ts";
import { defineGate } from "../contract/policy.ts";
import type { ContractFieldShape, StructuralCopyMatch } from "../lib/contract-structural-copy.ts";
import { bestCopyMatch, bestOverlapMatch, candidateFields, contractFields, indexByField } from "../lib/contract-structural-copy.ts";

const TESTS = "tests/";
const E2E = "tests/e2e/";
const OVERLAP_OPERATION = "overlaps";
const COPY_OPERATION = "copies";
const LAW = "(docs/law/Spine-Testing.md §10)";
const MESSAGE = `a test support or e2e module hand-declares a shape production owns, so a renamed or retyped field still compiles here and drifts silently ${LAW}.`;
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

interface HandShapeVerdict {
  readonly match: StructuralCopyMatch;
  readonly relation: string;
  readonly operation: string;
}

/** A whole-field copy first; failing that, a drifted copy that kept most of an export's field names. */
function handShapeVerdict(node: HandShape, index: ReadonlyMap<string, readonly ContractFieldShape[]>): HandShapeVerdict | undefined {
  const own = candidateFields(N.isInterfaceDeclaration(node) ? node : node.getTypeNodeOrThrow().asKindOrThrow(SyntaxKind.TypeLiteral));
  if (own === undefined) {
    return;
  }
  const copy = bestCopyMatch(own, index);
  if (copy !== undefined) {
    return { match: copy, relation: `declares ${String(copy.shared)} of the fields of`, operation: COPY_OPERATION };
  }
  const overlap = bestOverlapMatch(own, index);
  return overlap === undefined
    ? undefined
    : { match: overlap, relation: `shares ${String(overlap.shared)} of its ${String(own.size)} field names with`, operation: OVERLAP_OPERATION };
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
    const fields: ContractFieldShape[] = [];
    const candidates: { readonly node: HandShape; readonly file: string }[] = [];
    return {
      visitFile: (sourceFile) => {
        const file = ctx.relativePath(sourceFile);
        if (file.startsWith(TESTS)) {
          return;
        }
        for (const [name, declaration] of exportedShapes(sourceFile)) {
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
        ctx.receipt({ kind: "population", source: "production-exported-shapes", members: fields.length });
        const index = indexByField(fields);
        for (const { node, file } of candidates) {
          const verdict = handShapeVerdict(node, index);
          if (verdict !== undefined) {
            const name = node.getName();
            ctx.report.node(node.getNameNode(), {
              token: name,
              offset: 0,
              message: `\`${name}\` ${verdict.relation} \`${verdict.match.contract.name}\` (${verdict.match.contract.file}). ${MESSAGE}`,
              subject: file,
              operation: `${verdict.operation}:${name}=${verdict.match.contract.file}#${verdict.match.contract.name}`,
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
        [E2E_HELPER]: WIRE_CAPTURE("backend", ""),
      },
      expect: { count: 1, token: "WireCapture", messageIncludes: "shares 4 of its 5 field names with `WireCapture`" },
      grant: { subject: E2E_HELPER, operation: `overlaps:WireCapture=${WIRE_CAPTURE_HOME}#WireCapture` },
      why: "THE FOUNDING DRIFT: the e2e mirror of the server's capture says `backend` where the server sends `providerId`, so the subset match misses it. Four of its five field names are the export's, and that overlap, not the shared name, is the evidence",
    },
    {
      mode: "types",
      files: {
        [MESSAGES_HOME]: MESSAGES_PAGE("MessagesPage"),
        "tests/client/features/chat/_ct-stories.tsx": MESSAGES_PAGE("PageRows"),
      },
      expect: { count: 1, token: "PageRows", messageIncludes: "of the fields of `MessagesPage`" },
      why: "THE RENAMED COPY: a story module declares a contract's fields under a name production never exports",
    },
    {
      mode: "types",
      files: {
        [WIRE_CAPTURE_HOME]: WIRE_CAPTURE("providerId", ""),
        "tests/e2e/rpg-lite-loop.spec.ts":
          "type Capture = { readonly chatId: string; readonly api: string; readonly backend: string; readonly model: string; readonly body: string };\nexport const read = (capture: Capture): string => capture.backend;\n",
      },
      expect: { count: 1, token: "Capture", messageIncludes: "shares 4 of its 5 field names" },
      why: "a local type-literal alias inside an e2e spec is the same hand shape as an interface in its helper, whatever it is called",
    },
  ],
  mustPass: [
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
