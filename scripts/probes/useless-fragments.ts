#!/usr/bin/env tsx
import { Node, SyntaxKind } from "ts-morph";
import { getWorkspace } from "../ts-workspace.ts";

const REPO_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/u, "");
const project = getWorkspace({ root: REPO_ROOT, types: false });

let totalFragments = 0;
let uselessFragments = 0;

for (const sf of project.getSourceFiles()) {
  const fp = sf.getFilePath();
  if (!(fp.includes("/packages/client/src/") || fp.includes("/packages/ui/src/"))) {
    continue;
  }

  // Find <>...</>
  for (const frag of sf.getDescendantsOfKind(SyntaxKind.JsxFragment)) {
    totalFragments++;
    const children = frag.getJsxChildren().filter((c) => {
      if (Node.isJsxText(c)) {
        return c.getText().trim().length > 0;
      }
      return true;
    });
    if (children.length <= 1) {
      uselessFragments++;
      console.log(`[Useless <>] ${fp.slice(REPO_ROOT.length + 1)}:${frag.getStartLineNumber()}`);
    }
  }

  // Find <Fragment>...</Fragment>
  for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    if (el.getOpeningElement().getTagNameNode().getText() === "Fragment") {
      totalFragments++;
      const children = el.getJsxChildren().filter((c) => {
        if (Node.isJsxText(c)) {
          return c.getText().trim().length > 0;
        }
        return true;
      });
      if (children.length <= 1) {
        uselessFragments++;
        console.log(`[Useless <Fragment>] ${fp.slice(REPO_ROOT.length + 1)}:${el.getStartLineNumber()}`);
      }
    }
  }
}

console.log(`\nFound ${totalFragments} total fragments, of which ${uselessFragments} appear useless (<= 1 real child).`);
