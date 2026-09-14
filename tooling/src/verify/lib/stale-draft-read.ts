// The draft family consumes the dispatcher's node stream. Branch membership is an indexed
// source interval, not a new descendant traversal per comparison. Textual seed identity
// deliberately preserves the frozen detector; it does not claim binding or write provenance.

import type { BinaryExpression, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext, GatePolicyHooks } from "../contract/policy.ts";
import { unwrapExpression } from "./ast-read.ts";

export const DRAFT_DECISION_HOME = "packages/client/src/lib/edit-session.ts";
export const DRAFT_TREE_ANCHOR = "packages/db/src/schema/index.ts";

export function draftDecisionHomeMissing(paths: ReadonlySet<string>): boolean {
  return paths.has(DRAFT_TREE_ANCHOR) && !paths.has(DRAFT_DECISION_HOME);
}

interface DraftFile {
  readonly seeds: Map<string, string>;
  readonly comparisons: BinaryExpression[];
  readonly identifiers: Map<string, Node[]>;
  readonly outwardCalls: Node[];
}

function collectSeed(declaration: VariableDeclaration, seeds: Map<string, string>): void {
  const call = declaration.getInitializer();
  const name = declaration.getNameNode();
  if (call === undefined || !Node.isCallExpression(call) || !/(^|\.)useState$/u.test(call.getExpression().getText()) || !Node.isArrayBindingPattern(name)) {
    return;
  }
  const draft = name.getElements()[0]?.getText();
  const seed = call.getArguments()[0];
  if (draft === undefined || seed === undefined) {
    return;
  }
  const inner = unwrapExpression(seed);
  const body = Node.isArrowFunction(inner) ? unwrapExpression(inner.getBody()) : inner;
  if (Node.isIdentifier(body) || Node.isPropertyAccessExpression(body)) {
    const text = body.getText();
    if (!/^[A-Z0-9_]+$/u.test(text.split(".")[0] ?? text)) {
      seeds.set(draft, text);
    }
  }
}

function comparedText(node: Node): string {
  const text = node.getText().trim();
  return text.endsWith(".trim()") ? text.slice(0, -".trim()".length) : text;
}

/** Dispatcher traversal is source ordered. Include descendants sharing their parent's start,
 * but exclude the branch node itself, as the legacy getDescendantsOfKind did. */
function containsDescendant(nodes: readonly Node[], branch: Node): boolean {
  const start = branch.getStart();
  const end = branch.getEnd();
  let low = 0;
  let high = nodes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const node = nodes[middle];
    if (node !== undefined && node.getStart() < start) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  for (let index = low; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node === undefined || node.getStart() >= end) {
      break;
    }
    if (node !== branch && node.getEnd() <= end) {
      return true;
    }
  }
  return false;
}

export function createDraftCommitHooks(ctx: GatePolicyContext): GatePolicyHooks {
  const files = new Map<SourceFile, DraftFile>();
  return {
    visitFile: (source): void => {
      files.set(source, { seeds: new Map(), comparisons: [], identifiers: new Map(), outwardCalls: [] });
    },
    visitors: [
      {
        kinds: [SyntaxKind.VariableDeclaration, SyntaxKind.BinaryExpression, SyntaxKind.Identifier, SyntaxKind.CallExpression],
        visit: (node, source): void => {
          const file = files.get(source);
          if (file === undefined) {
            throw new Error("draft-commit reader received a node before its file");
          }
          if (Node.isVariableDeclaration(node)) {
            collectSeed(node, file.seeds);
          } else if (Node.isBinaryExpression(node)) {
            file.comparisons.push(node);
          } else if (Node.isIdentifier(node)) {
            const name = node.getText();
            const nodes = file.identifiers.get(name) ?? [];
            nodes.push(node);
            file.identifiers.set(name, nodes);
          } else if (Node.isCallExpression(node)) {
            const callee = node.getExpression().getText();
            if (!/^set[A-Z]/u.test(callee.split(".").at(-1) ?? callee)) {
              file.outwardCalls.push(node);
            }
          }
        },
      },
    ],
    evaluate: (): void => {
      for (const file of files.values()) {
        for (const comparison of file.comparisons) {
          const draft = staleDraft(comparison, file);
          if (draft !== undefined) {
            ctx.report.node(comparison, { token: draft, offset: Math.max(comparison.getText().indexOf(draft), 0) });
          }
        }
      }
      ctx.receipt({ kind: "population", source: "draft-commit-source-files", members: files.size });
    },
  };
}

function staleDraft(comparison: BinaryExpression, file: DraftFile): string | undefined {
  const op = comparison.getOperatorToken().getText();
  if (op !== "!==" && op !== "===") {
    return;
  }
  const left = comparedText(comparison.getLeft());
  const right = comparedText(comparison.getRight());
  const match = [...file.seeds].find(([name, live]) => (left === name && right === live) || (right === name && left === live));
  const draft = match?.[0];
  const branch = comparison.getFirstAncestorByKind(SyntaxKind.IfStatement)?.getThenStatement();
  return draft !== undefined &&
    branch !== undefined &&
    containsDescendant(file.identifiers.get(draft) ?? [], branch) &&
    containsDescendant(file.outwardCalls, branch)
    ? draft
    : undefined;
}
