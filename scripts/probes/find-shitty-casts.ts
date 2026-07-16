#!/usr/bin/env tsx
import { SyntaxKind } from "ts-morph";
import { getWorkspace } from "../ts-workspace.ts";

const REPO_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/u, "");
const project = getWorkspace({ root: REPO_ROOT, types: false });

for (const sf of project.getSourceFiles()) {
  const fp = sf.getFilePath();
  if (fp.includes("/tests/") || fp.includes("/scripts/")) {
    continue;
  }

  for (const expr of sf.getDescendantsOfKind(SyntaxKind.AsExpression)) {
    const typeText = expr.getTypeNode()?.getText();
    const isDoubleCast = expr.getExpression().getKind() === SyntaxKind.AsExpression;

    if (typeText === "any" || typeText === "never" || isDoubleCast) {
      const label = isDoubleCast ? `Double Cast (as unknown as ${typeText})` : `as ${typeText}`;
      console.log(`\n=== [${label}] ${fp.slice(REPO_ROOT.length + 1)}:${expr.getStartLineNumber()} ===`);
      const BEFORE_LINES = 3;
      const AFTER_LINES = 2;
      console.log(
        sf
          .getText()
          .split("\n")
          .slice(Math.max(0, expr.getStartLineNumber() - BEFORE_LINES), expr.getEndLineNumber() + AFTER_LINES)
          .join("\n"),
      );
    }
  }
}
