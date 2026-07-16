#!/usr/bin/env tsx
import { SyntaxKind } from "ts-morph";
import { getWorkspace } from "../ts-workspace.ts";

const REPO_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/u, "");
const project = getWorkspace({ root: REPO_ROOT, types: false });

const SNIPPET_MAX_LEN = 100;

let totalCasts = 0;

for (const sf of project.getSourceFiles()) {
  const fp = sf.getFilePath();
  if (!(fp.includes("/packages/client/src/") || fp.includes("/packages/ui/src/"))) {
    continue;
  }

  for (const expr of sf.getDescendantsOfKind(SyntaxKind.AsExpression)) {
    const typeText = expr.getTypeNode()?.getText();
    if (typeText === "ReactElement" || typeText === "JSX.Element" || typeText === "ReactNode") {
      totalCasts++;
      console.log(`[Cast to ${typeText}] ${fp.slice(REPO_ROOT.length + 1)}:${expr.getStartLineNumber()}`);
      console.log(`    ${expr.getText().replace(/\n/g, " ").slice(0, SNIPPET_MAX_LEN)}...`);
    }
  }
}

console.log(`\nFound ${totalCasts} suspicious React type casts.`);
