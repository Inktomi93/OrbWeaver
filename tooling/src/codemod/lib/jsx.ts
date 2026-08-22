// JSX operations: find / rename tag / attributes.
// ── §14 ─ JSX operations ─────────────────────────────────────────────────────

import type { JsxAttribute, Project } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { CodemodContext, JsxLike, OperationOptions, Plan } from "../contract/types.ts";
import { noteSuffix } from "./plans.ts";

/**
 * Find every JSX element with the given tag name across the project. Useful
 * for client codemods: "every <OldButton> → <NewButton>" sweeps. Matches
 * the bare identifier of the tag — `<Foo.Bar />` matches `"Foo"`, NOT
 * `"Foo.Bar"`.
 */
export function findJsxByTag(project: Project, tagName: string): JsxLike[] {
  const out: JsxLike[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
      if (el.getTagNameNode().getText() === tagName) {
        out.push(el);
      }
    }
    for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
      if (el.getTagNameNode().getText() === tagName) {
        out.push(el);
      }
    }
  }
  return out;
}

/**
 * Rename a JSX tag across the project. Updates BOTH the opening tag and
 * its closing tag (when present). Doesn't update the import — pair with
 * `renameNamedImport` if the new component lives at a different name in
 * its source module.
 */
export function renameJsxTag(ctx: CodemodContext, oldTagName: string, newTagName: string, opts: OperationOptions = {}): Plan {
  const matches = findJsxByTag(ctx.project, oldTagName);
  const touched = new Set<string>();
  for (const el of matches) {
    touched.add(el.getSourceFile().getFilePath());
  }
  return {
    description: `Rename JSX <${oldTagName}> → <${newTagName}> (${matches.length} instance${matches.length === 1 ? "" : "s"})${noteSuffix(opts)}`,
    touchedFiles: [...touched],
    transform(): void {
      for (const el of matches) {
        const nameNode = el.getTagNameNode();
        // Set the opening / self-closing tag's name.
        if (Node.isIdentifier(nameNode)) {
          nameNode.replaceWithText(newTagName);
        } else {
          // Property-access tag like <Foo.Bar /> — replace the whole node.
          nameNode.replaceWithText(newTagName);
        }
        // For paired (non-self-closing) elements, also update the closer.
        const parent = el.getParent();
        if (Node.isJsxElement(parent)) {
          parent.getClosingElement().getTagNameNode().replaceWithText(newTagName);
        }
      }
    },
  };
}

/** Find every JSX attribute named `attrName` across the project. Doesn't
 *  filter by parent component — pair with `findJsxByTag` for component-
 *  scoped sweeps. */
export function findJsxAttributes(project: Project, attrName: string): JsxAttribute[] {
  const out: JsxAttribute[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
      const name = attr.getNameNode().getText();
      if (name === attrName) {
        out.push(attr);
      }
    }
  }
  return out;
}
