// Gate: modal-body-not-placeholder (design-enforcement.md §3.2) — a MODAL_SLOTS entry
// (features/**/lib/modal-slots.tsx) whose `render` still returns a `<SectionPlaceholder>` must carry an
// explicit `placeholder: true` flag — without it a placeholder ships silently instead of as a visible,
// greppable, COUNTED state. Walks every `**/lib/modal-slots.tsx`'s `MODAL_SLOTS` entries for this mismatch.
import type { ObjectLiteralExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const PLACEHOLDER_TAG = "SectionPlaceholder";

/** `packages/...`-relative path for a violation location. */
function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Does this subtree render a `<SectionPlaceholder …>` (open or self-closing) JSX element? */
function rendersPlaceholder(node: Node): boolean {
  for (const el of node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    if (el.getTagNameNode().getText() === PLACEHOLDER_TAG) {
      return true;
    }
  }
  for (const el of node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    if (el.getTagNameNode().getText() === PLACEHOLDER_TAG) {
      return true;
    }
  }
  return false;
}

/** Is `placeholder: true` present on the entry object? */
function hasPlaceholderFlag(entry: ObjectLiteralExpression): boolean {
  const prop = entry.getProperty("placeholder");
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return false;
  }
  return prop.getInitializer()?.getKind() === SyntaxKind.TrueKeyword;
}

// The `MODAL_SLOTS` object's entries whose `render` returns a <SectionPlaceholder> without a
// `placeholder: true` flag. The message names the offending entry.
export const gate: GateDescriptor = {
  name: "modal-body-not-placeholder",
  docRow: "design-enforcement.md §3.2",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a MODAL_SLOTS entry renders <SectionPlaceholder> but is missing `placeholder: true` — an unbuilt " +
    "modal must be an explicit, counted state, not a silent sparkle. Add the flag, or route-compose a " +
    "real body (design-enforcement.md §3.2).",
  fix: "add `placeholder: true` to the entry (making the unbuilt modal a counted state), or route-compose a real body.",
  scanRoot: (p) => p.endsWith("/lib/modal-slots.tsx"),
  kinds: [SyntaxKind.VariableDeclaration],
  visit: (node, sf, ctx) => {
    if (!Node.isVariableDeclaration(node) || node.getName() !== "MODAL_SLOTS") {
      return;
    }
    const init = node.getInitializer();
    if (init === undefined || !Node.isObjectLiteralExpression(init)) {
      return;
    }
    for (const prop of init.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) {
        continue;
      }
      const entry = prop.getInitializer();
      if (entry === undefined || !Node.isObjectLiteralExpression(entry)) {
        continue;
      }
      const render = entry.getProperty("render");
      if (render === undefined || !rendersPlaceholder(render) || hasPlaceholderFlag(entry)) {
        continue;
      }
      // No per-occurrence message: the reason lives once on the descriptor (owner ruling 2); the
      // offending entry name rides as the token, so the grouped output still names it.
      ctx.report({
        file: rel(sf.getFilePath()),
        line: prop.getStartLineNumber(),
        column: prop.getSourceFile().getLineAndColumnAtPos(prop.getStart()).column,
        token: `entry "${prop.getName()}"`,
      });
    }
  },
  mustFlag: [
    {
      files:
        "export const MODAL_SLOTS = {\n  theme: { render: () => <SectionPlaceholder /> },\n};\n",
      at: "packages/client/src/features/x/lib/modal-slots.tsx",
      why: "a MODAL_SLOTS entry rendering <SectionPlaceholder> with no placeholder:true — a silent sparkle",
    },
  ],
  mustPass: [
    {
      files:
        "export const MODAL_SLOTS = {\n  theme: { placeholder: true, render: () => <SectionPlaceholder /> },\n};\n",
      at: "packages/client/src/features/x/lib/modal-slots.tsx",
      why: "the same placeholder render WITH placeholder:true — an explicit, counted state, passes",
    },
    {
      files: "export const MODAL_SLOTS = {\n  theme: { render: () => <ThemePanel /> },\n};\n",
      at: "packages/client/src/features/x/lib/modal-slots.tsx",
      why: "an entry rendering a REAL body (no <SectionPlaceholder>) with no flag — the rendersPlaceholder false branch, passes",
    },
  ],
};
