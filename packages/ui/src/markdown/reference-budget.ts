// The copy budget for Markdown reference links. A reference copies its definition's address and title into the link it
// resolves, so one long title reused by many short `[x][a]` references renders an output many times the source's size:
// a reply of 100,000 characters rendered 358 MB of markup. Each render tree may copy at most
// `REFERENCE_COPY_BUDGET` characters this way, in document order; a reference past it draws as its own text (an image as
// its alt text), which is what Markdown draws for a reference with no definition.
import type { StreamdownProps } from "streamdown";

/** The address and title characters one render tree may copy into its reference links. An honest reply's links copy a
 *  few kilobytes; this stops a shape that copies one definition thousands of times. */
export const REFERENCE_COPY_BUDGET = 65_536;

// The mdast fields this pass reads, declared locally as `dice-inline.tsx` does: the tree types are not a dependency.
interface MarkdownNode {
  type: string;
  value?: string;
  identifier?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  children?: MarkdownNode[];
}

type PluggableList = NonNullable<StreamdownProps["remarkPlugins"]>;

function definitionCosts(root: MarkdownNode): ReadonlyMap<string, number> {
  const costs = new Map<string, number>();
  const visit = (node: MarkdownNode): void => {
    // The first definition of a label wins, as Markdown resolves it.
    if (node.type === "definition" && node.identifier !== undefined && !costs.has(node.identifier)) {
      costs.set(node.identifier, (node.url ?? "").length + (node.title ?? "").length);
    }
    node.children?.forEach(visit);
  };
  visit(root);
  return costs;
}

// A reference past the budget, as the text Markdown draws for an unresolved one: a link's own children, an image's alt.
function asText(node: MarkdownNode): readonly MarkdownNode[] {
  return node.type === "imageReference" ? [{ type: "text", value: node.alt ?? "" }] : (node.children ?? []);
}

function isReference(node: MarkdownNode): boolean {
  return node.type === "linkReference" || node.type === "imageReference";
}

function remarkReferenceBudget(): (root: MarkdownNode) => void {
  return (root) => {
    const costs = definitionCosts(root);
    let spent = 0;
    const visit = (node: MarkdownNode): void => {
      const children = node.children;
      if (children === undefined) {
        return;
      }
      node.children = children.flatMap((child) => {
        const cost = isReference(child) && child.identifier !== undefined ? costs.get(child.identifier) : undefined;
        if (cost !== undefined) {
          spent += cost;
          if (spent > REFERENCE_COPY_BUDGET) {
            const text = asText(child);
            text.forEach(visit);
            return text;
          }
        }
        visit(child);
        return [child];
      });
    };
    visit(root);
  };
}

/** The remark pass that holds reference links to {@link REFERENCE_COPY_BUDGET}. */
export const REFERENCE_BUDGET_REMARK_PLUGINS: PluggableList = [remarkReferenceBudget];
