// Shared floorless-control evidence for occurrence and vocabulary-health policies.
// The dispatcher visits each size attribute and Stack once. Ancestor counts replace repeated subtree
// walks; a row/component query reads its precomputed count. Same-file, one-hop component resolution and
// literal size/class limits intentionally match the legacy detector. No independent descendant traversal or parser is introduced here.
import type { CallExpression, JsxElement, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import { blankTsComments } from "./comment-spans.ts";

const FLOORLESS = ["inline", "glyph-xs", "glyph-sm", "glyph-md", "glyph-lg"] as const;
const FLOORLESS_SET: ReadonlySet<string> = new Set(FLOORLESS);
const BUTTON_VARIANTS = "packages/ui/src/primitives/button/variants.ts";
const FLEX_WRAP_RE = /\bflex-wrap\b/u;
const MAP_CALLEE_RE = /\.map$/u;
export const floorlessControlFact = defineFact({
  id: "floorless-control",
  population: ["@client", "@ui"],
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const counts = new Map<Node, number>();
    const sizes: Node[] = [];
    const stacks: JsxElement[] = [];
    /** The nearest enclosing JsxElement whose OPENING tag carries `flex-wrap` (same-file JSX tree only). */
    function wrapContainerOf(node: Node): JsxElement | undefined {
      // ONE return path (the pass.ts accumulator idiom) — biome and noImplicitReturns disagree otherwise.
      let found: JsxElement | undefined;
      let cur: Node | undefined = node.getParent();
      while (cur !== undefined && found === undefined) {
        if (cur.isKind(SyntaxKind.JsxElement) && FLEX_WRAP_RE.test(cur.getOpeningElement().getText())) {
          found = cur;
        }
        cur = cur.getParent();
      }
      return found;
    }

    /** A property-call spelling ending in .map, preserving the legacy syntax boundary. */
    function mapCall(node: Node | undefined): CallExpression | undefined {
      let found: CallExpression | undefined;
      if (node?.isKind(SyntaxKind.CallExpression) === true) {
        const callee = node.getExpression();
        if (callee.isKind(SyntaxKind.PropertyAccessExpression) && MAP_CALLEE_RE.test(callee.getText())) {
          found = node;
        }
      }
      return found;
    }
    /** A map callback inside the nearest wrap supplies runtime siblings. */
    function isMappedWithin(el: Node, container: JsxElement): boolean {
      let cur: Node | undefined = el.getParent();
      while (cur !== undefined && cur !== container) {
        if ((cur.isKind(SyntaxKind.ArrowFunction) || cur.isKind(SyntaxKind.FunctionExpression)) && mapCall(cur.getParent()) !== undefined) {
          return true;
        }
        cur = cur.getParent();
      }
      return false;
    }

    /** Source-level count of floorless-size Buttons in the container's subtree (literal siblings arm). */
    function floorlessCountIn(container: JsxElement): number {
      return counts.get(container) ?? 0;
    }

    function ownerIsButton(attr: Node): boolean {
      const owner = attr.getFirstAncestor((a) => a.isKind(SyntaxKind.JsxSelfClosingElement) || a.isKind(SyntaxKind.JsxOpeningElement));
      if (owner === undefined || !(owner.isKind(SyntaxKind.JsxSelfClosingElement) || owner.isKind(SyntaxKind.JsxOpeningElement))) {
        return false;
      }
      return owner.getTagNameNode().getText() === "Button";
    }

    // ─── the VERTICAL-PITCH arm (#884 C3) ───────────────────────────────────────────────────────────────

    /** Does this subtree hold a floorless-size Button (literal size attr, Button tag)? */
    function floorlessButtonIn(root: Node): boolean {
      return (counts.get(root) ?? 0) > 0;
    }

    /** One level of SAME-FILE component indirection: `<AttributeRow/>` → the body of a same-file
     *  `function AttributeRow(...)` or `const AttributeRow = (...) => …`. Cross-file tags resolve to nothing
     *  (declared limit). */
    function sameFileComponentBody(sf: SourceFile, tagName: string): Node | undefined {
      const fn = sf.getFunction(tagName);
      if (fn !== undefined) {
        return fn.getBody();
      }
      const decl = sf.getVariableDeclaration(tagName);
      const init = decl?.getInitializer();
      return init !== undefined && (init.isKind(SyntaxKind.ArrowFunction) || init.isKind(SyntaxKind.FunctionExpression)) ? init.getBody() : undefined;
    }

    const RowFloorRe = /\bmin-h-touch-target\b|\bmin-h-control-[a-z]+\b|pointer-coarse:min-h-[a-z-]+/u;

    /** The row's OWN literal className carries a floor fence. Only the direct child's opening tag is read —
     *  a resolved component's root cannot be fenced from here (its escape is the Stack's `rows="control"`). */
    function rowCarriesFloor(el: Node): boolean {
      const opening = el.isKind(SyntaxKind.JsxElement) ? el.getOpeningElement() : el;
      if (!(opening.isKind(SyntaxKind.JsxOpeningElement) || opening.isKind(SyntaxKind.JsxSelfClosingElement))) {
        return false;
      }
      const attr = opening.getAttribute("className");
      if (attr === undefined || !attr.isKind(SyntaxKind.JsxAttribute)) {
        return false;
      }
      return RowFloorRe.test(attr.getText());
    }

    /** A direct JsxExpression child that is `{xs.map((x) => <El …/>)}` → the produced element, or undefined. */
    function mappedElementOf(child: Node): Node | undefined {
      if (!child.isKind(SyntaxKind.JsxExpression)) {
        return;
      }
      const call = mapCall(child.getExpression());
      if (call === undefined) {
        return;
      }
      const cb = call.getArguments()[0];
      if (cb === undefined || !(cb.isKind(SyntaxKind.ArrowFunction) || cb.isKind(SyntaxKind.FunctionExpression))) {
        return;
      }
      const body = cb.getBody();
      const produced = body.isKind(SyntaxKind.ParenthesizedExpression) ? body.getExpression() : body;
      return produced.isKind(SyntaxKind.JsxElement) || produced.isKind(SyntaxKind.JsxSelfClosingElement) ? produced : undefined;
    }

    /** Does this row element (or its same-file component resolution) hold a floorless Button, unfenced? */
    function countsAsFloorlessRow(sf: SourceFile, el: Node): boolean {
      if (rowCarriesFloor(el)) {
        return false;
      }
      if (floorlessButtonIn(el)) {
        return true;
      }
      const opening = el.isKind(SyntaxKind.JsxElement) ? el.getOpeningElement() : el;
      if (!(opening.isKind(SyntaxKind.JsxOpeningElement) || opening.isKind(SyntaxKind.JsxSelfClosingElement))) {
        return false;
      }
      const body = sameFileComponentBody(sf, opening.getTagNameNode().getText());
      return body !== undefined && floorlessButtonIn(body);
    }

    /** The pitch weight of one Stack: literal element children count 1, a `.map` child counts 2 (N runtime
     *  rows). ≥2 unfenced floorless rows = a sub-floor pitch population. */
    function floorlessRowWeight(sf: SourceFile, stack: JsxElement): number {
      let weight = 0;
      for (const child of stack.getJsxChildren()) {
        if (child.isKind(SyntaxKind.JsxElement) || child.isKind(SyntaxKind.JsxSelfClosingElement)) {
          weight += countsAsFloorlessRow(sf, child) ? 1 : 0;
          continue;
        }
        const produced = mappedElementOf(child);
        if (produced !== undefined && countsAsFloorlessRow(sf, produced)) {
          weight += 2;
        }
      }
      return weight;
    }

    const StackRowsControlRe = /rows\s*=\s*(?:\{\s*)?["']control["']/u;

    function wrapOccurrence(node: Node): { node: Node; token: string; offset: number } | undefined {
      if (!node.isKind(SyntaxKind.JsxAttribute)) {
        return;
      }
      const owner = node.getFirstAncestor((a) => a.isKind(SyntaxKind.JsxSelfClosingElement) || a.isKind(SyntaxKind.JsxOpeningElement));
      const container = owner === undefined ? undefined : wrapContainerOf(owner);
      if (owner === undefined || container === undefined || (!isMappedWithin(owner, container) && floorlessCountIn(container) < 2)) {
        return;
      }
      const init = node.getInitializer();
      if (init?.isKind(SyntaxKind.StringLiteral) !== true) {
        return;
      }
      const token = init.getLiteralText();
      return { node, token, offset: Math.max(node.getText().indexOf(token), 0) };
    }
    function readOccurrences() {
      const occurrences: { node: Node; token: string; offset: number }[] = [];
      for (const stack of stacks) {
        const opening = stack.getOpeningElement();
        if (!StackRowsControlRe.test(opening.getText()) && floorlessRowWeight(stack.getSourceFile(), stack) >= 2) {
          occurrences.push({ node: opening, token: "Stack", offset: Math.max(opening.getText().indexOf("Stack"), 0) });
        }
      }
      for (const node of sizes) {
        const hit = wrapOccurrence(node);
        if (hit !== undefined) {
          occurrences.push(hit);
        }
      }
      return occurrences;
    }
    function readHealth() {
      const variants = ctx.files.find((file) => ctx.relativePath(file) === BUTTON_VARIANTS);
      const health: { node: SourceFile; message: string }[] = [];
      if (variants !== undefined) {
        const text = blankTsComments(variants);
        for (const key of FLOORLESS) {
          if (!(text.includes(`${key}:`) || text.includes(`"${key}":`))) {
            health.push({
              node: variants,
              message: `Button size arm ${key} is no longer declared in ${BUTTON_VARIANTS}; rederive the floorless vocabulary.`,
            });
          }
        }
        if (!text.includes("touch-target")) {
          health.push({
            node: variants,
            message: `${BUTTON_VARIANTS} no longer spells the touch-target overflow pseudo; rederive the floorless vocabulary.`,
          });
        }
      }
      return health;
    }
    return {
      visitors: [
        {
          kinds: [SyntaxKind.JsxAttribute, SyntaxKind.JsxElement],
          visit: (node) => {
            if (node.isKind(SyntaxKind.JsxElement) && node.getOpeningElement().getTagNameNode().getText() === "Stack") {
              stacks.push(node);
            }
            if (!node.isKind(SyntaxKind.JsxAttribute) || node.getNameNode().getText() !== "size") {
              return;
            }
            const init = node.getInitializer();
            if (init?.isKind(SyntaxKind.StringLiteral) !== true || !FLOORLESS_SET.has(init.getLiteralText()) || !ownerIsButton(node)) {
              return;
            }
            sizes.push(node);
            let ancestor: Node | undefined = node.getParent();
            while (ancestor !== undefined) {
              counts.set(ancestor, (counts.get(ancestor) ?? 0) + 1);
              ancestor = ancestor.getParent();
            }
          },
        },
      ],
      finish: () => {
        ctx.receipt({ kind: "population", source: "floorless-control-sources", members: ctx.files.length });
        return { sources: ctx.files.length, occurrences: readOccurrences(), health: readHealth() };
      },
    };
  },
});
