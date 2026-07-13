// Gate: modal-body-not-placeholder (design-enforcement.md §3.2 — the placeholder-honesty half of the
// registry belt). A MODAL_SLOTS body (features/**/lib/modal-slots.tsx) whose `render` still returns a
// `<SectionPlaceholder>` MUST carry an explicit `placeholder: true` flag on its entry. Without the flag a
// placeholder ships SILENTLY (theme / command / account modals sat as sparkles for weeks in neo,
// unnoticed) — the flag makes an unbuilt modal a visible, greppable, COUNTED state. When a real surface
// is route-composed over a slot (AppShellProps.modals), the flag is dropped and the check stays green
// because the render here is no longer the live body.
//
// SHAPE (fixture-able, the `__g_*` pattern): for every `**/lib/modal-slots.tsx` it walks the `MODAL_SLOTS`
// object's entries; an entry whose `render` body contains a `<SectionPlaceholder>` JSX tag but whose
// entry object lacks `placeholder: true` is a violation.
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

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (b)) ──────────────────────────────────────────────
// The legacy predicate as a VariableDeclaration subscription: the `MODAL_SLOTS` object's entries whose
// `render` returns a <SectionPlaceholder> without a `placeholder: true` flag. scanRoot mirrors the legacy
// `**/lib/modal-slots.tsx` filter. The message names the offending entry (varies per entry), so each
// finding carries a per-occurrence message override. Per-occurrence.
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
