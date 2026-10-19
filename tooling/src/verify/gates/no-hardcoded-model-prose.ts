// Policy: no-hardcoded-model-prose, dead-catalog arm (PROSE-1 §7, D132): a prose catalog const that nothing references
// (no in-file use, no importer anywhere) is dead prose. The seam arm, hardcoded model prose at a prompt-assembly seam,
// is the native `orb/no-hardcoded-model-prose` rule in eslint.config.js. Population is @authored so the import census sees
// client importers; a barrel re-export does not make a const alive.
import type { CallExpression, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

/** The sanctioned authoring homes (the landed PROSE-1 registry + the two legacy-adapted catalogs). */
const CATALOGS = [
  "packages/contracts/src/prose/index.ts",
  "packages/contracts/src/prose-slot/index.ts",
  "packages/contracts/src/chat/prose.ts",
  "packages/contracts/src/preset/prose.ts",
  "packages/contracts/src/automation/prose.ts",
  "packages/contracts/src/discovery/prose.ts",
  "packages/contracts/src/imagery/index.ts",
  "packages/contracts/src/preset/index.ts",
] as const;
const CATALOG_SET: ReadonlySet<string> = new Set(CATALOGS);

const PROSE_MIN_WORDS = 12;
const WORD_RE = /\S+/gu;
const LOWER_RUN_RE = /[a-z]{3,}/u;

const MESSAGE = "DEAD catalog prose: authored, referenced by nothing (no in-file use, no importer). It is the RPG_STATE_TRACKING_GUIDE class (D132).";
const FIX =
  "wire it into a slot row of the domain's prose catalog (packages/contracts/src/*/prose.ts) or delete it. A deliberate exception waives with `@orb-waive no-hardcoded-model-prose(<const name>): <reason + end condition>`.";

function wordCount(text: string): number {
  return (text.match(WORD_RE) ?? []).length;
}

/** Ordered literal text of a string-producing expression: literals + template statics; `${…}`/identifier
 *  parts contribute nothing (a gap, like the spec's evaluator). */
function unitText(node: Node): string {
  if (node.isKind(SyntaxKind.StringLiteral) || node.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return node.getLiteralText();
  }
  if (node.isKind(SyntaxKind.TemplateExpression)) {
    return [node.getHead().getLiteralText(), ...node.getTemplateSpans().map((s) => s.getLiteral().getLiteralText())].join(" ");
  }
  if (node.isKind(SyntaxKind.ParenthesizedExpression)) {
    return unitText(node.getExpression());
  }
  if (node.isKind(SyntaxKind.BinaryExpression)) {
    return `${unitText(node.getLeft())} ${unitText(node.getRight())}`;
  }
  if (node.isKind(SyntaxKind.CallExpression)) {
    return joinCallText(node);
  }
  if (node.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return node.getElements().map(unitText).join(" ");
  }
  return "";
}

function joinCallText(node: CallExpression): string {
  const callee = node.getExpression();
  const arr = callee.isKind(SyntaxKind.PropertyAccessExpression) ? callee.getExpression() : undefined;
  return arr?.isKind(SyntaxKind.ArrayLiteralExpression) === true ? arr.getElements().map(unitText).join(" ") : "";
}

interface CatalogCandidate {
  readonly decl: VariableDeclaration;
  readonly file: string;
  readonly name: string;
}

export const gate = defineGate({
  id: "no-hardcoded-model-prose",
  family: "no-hardcoded-model-prose",
  authority: "ordinary",
  severity: "error",
  population: "@authored",
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const freqByFile = new Map<string, Map<string, number>>();
    const importedNameFiles = new Map<string, Set<string>>();
    const catalogCandidates: CatalogCandidate[] = [];

    return {
      visitors: [
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node, sourceFile) => {
            const rel = ctx.relativePath(sourceFile);
            const freq = freqByFile.get(rel) ?? new Map<string, number>();
            const text = node.getText();
            freq.set(text, (freq.get(text) ?? 0) + 1);
            freqByFile.set(rel, freq);
          },
        },
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node, sourceFile) => {
            if (!Node.isImportSpecifier(node)) {
              return;
            }
            const rel = ctx.relativePath(sourceFile);
            const name = node.getName();
            const files = importedNameFiles.get(name) ?? new Set<string>();
            files.add(rel);
            importedNameFiles.set(name, files);
          },
        },
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile) => {
            if (!Node.isVariableDeclaration(node)) {
              return;
            }
            const rel = ctx.relativePath(sourceFile);
            if (!CATALOG_SET.has(rel)) {
              return;
            }
            const init = node.getInitializer();
            if (init === undefined) {
              return;
            }
            const text = unitText(init);
            if (wordCount(text) < PROSE_MIN_WORDS || !LOWER_RUN_RE.test(text)) {
              return;
            }
            catalogCandidates.push({ decl: node, file: rel, name: node.getName() });
          },
        },
      ],
      evaluate: () => {
        for (const candidate of catalogCandidates) {
          const inFileRefs = freqByFile.get(candidate.file)?.get(candidate.name) ?? 0;
          if (inFileRefs > 1) {
            continue;
          }
          const importers = importedNameFiles.get(candidate.name);
          const importedElsewhere = importers !== undefined && [...importers].some((f) => f !== candidate.file);
          if (importedElsewhere) {
            continue;
          }
          const nameNode = candidate.decl.getNameNode();
          ctx.report.node(candidate.decl, {
            token: nameNode.getText(),
            offset: nameNode.getStart() - candidate.decl.getStart(),
            message: MESSAGE,
            fix: FIX,
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/contracts/src/chat/prose.ts":
          "export const DEAD_GUIDE =\n" +
          '  "Track every plane the beat changes and restate the current values so the panel reflects the story.";\n' +
          "export const USED = { text: DEAD_GUIDE_OTHER };\nconst DEAD_GUIDE_OTHER = 'x';\n",
      },
      expect: { count: 1, token: "DEAD_GUIDE", messageIncludes: "DEAD catalog prose" },
      why: "a catalog prose const referenced by nothing (the RPG_STATE_TRACKING_GUIDE row-27 class)",
    },
    {
      mode: "source",
      files: {
        "packages/contracts/src/discovery/prose.ts":
          "export const DEAD_TWO =\n" +
          '  "This second dead prose line also has enough words to trip the twelve word floor for the catalog.";\n' +
          'export const OTHER = { note: "short" };\n',
      },
      expect: { count: 1, token: "DEAD_TWO", messageIncludes: "DEAD catalog prose" },
      why: "a SECOND catalog file's dead prose — proves the identifier-frequency/import-liveness censuses are per-file/per-name, not accidentally global-singleton state left over from the first candidate",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/contracts/src/chat/prose.ts":
          'export const REMOTE_TEACH =\n  "This teach line stays in the catalog with no local reference at all in this file whatsoever.";\n',
        "packages/client/src/features/chat/lib/uses-it.ts":
          'import { REMOTE_TEACH } from "../../../../contracts/src/chat/prose.ts";\nexport const t = REMOTE_TEACH;\n',
      },
      why: "a catalog const with zero in-file references is ALIVE because a CLIENT file imports it: the importer census must see the whole authored population, not only the catalogs",
    },
    {
      mode: "source",
      files: {
        "packages/contracts/src/chat/prose.ts":
          "export const SLOT = {\n" +
          "  id: 'chat.recovery.narrativeContinuation',\n" +
          '  text: "Continue the story naturally from where it left off and keep the same narrative voice throughout.",\n' +
          "};\nexport const TABLE = { slot: SLOT };\n",
      },
      why: "prose authored in its CATALOG and referenced by the table — the sanctioned home",
    },
  ],
});
