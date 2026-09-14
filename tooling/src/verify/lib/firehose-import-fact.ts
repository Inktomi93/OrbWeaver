// One typed fact for the D79 firehose's named-symbol boundary. Candidate spelling stays deliberately
// narrow (named import/re-export and namespace dot/bracket), while the shared origin reader proves that
// the candidate reaches the canonical chat-events-bus declaration rather than an unrelated same-name export.

import { readMemberReference, resolveModuleMemberOrigin } from "@orb/tooling/_shared/reference-fact";
import type { Node } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";

export const FIREHOSE_SYMBOL = "subscribeAllChatEvents";
const FIREHOSE_HOME = "/packages/server/src/transport/trpc/chat-events-bus.ts";

interface FirehoseReference {
  readonly node: Node;
  readonly file: string;
  readonly name: string;
  readonly unreadable: boolean;
}

function candidateName(node: Node): string | undefined {
  let name: string | undefined;
  if (MorphNode.isImportSpecifier(node) || MorphNode.isExportSpecifier(node)) {
    name = node.getName();
  } else if (MorphNode.isPropertyAccessExpression(node) || MorphNode.isElementAccessExpression(node)) {
    const member = readMemberReference(node);
    name = member.kind === "resolved" ? member.value.name : undefined;
  }
  return name;
}

export const firehoseImportFact = defineFact({
  id: "firehose-import",
  population: ["@server"],
  analysis: "types",
  resources: [],
  create: (ctx) => {
    let declared = false;
    const references: FirehoseReference[] = [];
    return {
      visitFile: (source) => {
        if (source.getFilePath().replaceAll("\\", "/").endsWith(FIREHOSE_HOME)) {
          declared ||= source.getFunction(FIREHOSE_SYMBOL) !== undefined;
        }
      },
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.ExportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node, source) => {
            if (candidateName(node) !== FIREHOSE_SYMBOL) {
              return;
            }
            const origin = resolveModuleMemberOrigin(node);
            if (origin.kind === "resolved") {
              const canonical = origin.value.canonical;
              if (
                canonical.kind === "project" &&
                canonical.exportedName === FIREHOSE_SYMBOL &&
                canonical.sourceFile.getFilePath().replaceAll("\\", "/").endsWith(FIREHOSE_HOME)
              ) {
                references.push({ node, file: ctx.relativePath(source), name: FIREHOSE_SYMBOL, unreadable: false });
              }
              return;
            }
            if (classifyOriginRefusal(origin.reason, node) === "unreadable") {
              references.push({ node, file: ctx.relativePath(source), name: FIREHOSE_SYMBOL, unreadable: true });
            }
          },
        },
      ],
      finish: () => {
        ctx.receipt({ kind: "population", source: "firehose-import-source-files", members: ctx.files.length });
        return { declared, references };
      },
    };
  },
});
