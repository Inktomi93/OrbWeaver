// Gate: test-world-browser-contracts — a Node-intent test/helper cannot compile only because React's
// global.d.ts supplies empty DOM interfaces, nor consume browser-authored UI/client contracts.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { BrowserContractIssue } from "../lib/browser-contract-reader.ts";
import {
  browserContractIssue,
  directBaseUiDoor,
  isConsumedReference,
  isNodeTestContractRoot,
  isPotentialModuleReference,
} from "../lib/browser-contract-reader.ts";

const MESSAGE =
  "a Node-intent test consumes a browser-only contract. Node-green is insufficient here because React's " +
  "global.d.ts declares empty DOM names that let DOM-coupled types compile without the real DOM library.";
const FIX =
  "Rename the test to its `.dom.*` kind when it exercises a browser contract. Keep Node tests on DOM-free " +
  "lib/state/data/forms/UI-lib contracts; move a mixed helper behind tests/support/browser rather than adding a path exemption.";
interface PassState {
  readonly reportedSites: Set<string>;
  readonly candidateBindings: WeakMap<object, ReadonlySet<string>>;
}
const states = new WeakMap<object, PassState>();

function stateFor(ctx: GateRunCtx): PassState {
  if (ctx.passIdentity === undefined) {
    throw new Error("browser contract checks require a dispatcher invocation identity");
  }
  let state = states.get(ctx.passIdentity);
  if (state === undefined) {
    state = { reportedSites: new Set(), candidateBindings: new WeakMap() };
    states.set(ctx.passIdentity, state);
  }
  return state;
}

export const gate: GateDescriptor = {
  name: "test-world-browser-contracts",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Spine-Testing.md §1",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: isNodeTestContractRoot,
  kinds: [
    SyntaxKind.ImportDeclaration,
    SyntaxKind.TypeReference,
    SyntaxKind.ExpressionWithTypeArguments,
    SyntaxKind.Identifier,
    SyntaxKind.PropertyAccessExpression,
    SyntaxKind.ElementAccessExpression,
  ],
  visit: (node, _sf, ctx) => {
    const { reportedSites, candidateBindings } = stateFor(ctx);
    let issue: BrowserContractIssue | undefined;
    if (Node.isImportDeclaration(node)) {
      issue = directBaseUiDoor(node);
    } else if (
      Node.isTypeReference(node) ||
      Node.isExpressionWithTypeArguments(node) ||
      (isConsumedReference(node) && isPotentialModuleReference(node, candidateBindings))
    ) {
      issue = browserContractIssue(node);
    }
    if (issue !== undefined) {
      const site =
        issue.kind === "unreadable"
          ? `${node.getSourceFile().getFilePath()}:unreadable:${issue.detail}`
          : `${node.getSourceFile().getFilePath()}:${node.getStart()}`;
      if (reportedSites.has(site)) {
        return;
      }
      reportedSites.add(site);
      if (issue.kind === "unreadable") {
        throw new Error(issue.detail);
      }
      ctx.report(node, { token: node.getText(), offset: 0 });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/ui/src/input.tsx": "export interface InputProps { readonly value?: string }\n",
        "packages/ui/src/index.ts": 'export type { InputProps } from "./input.tsx";\n',
        "tests/ui/input.test-d.ts": 'import type { InputProps as Props } from "../../packages/ui/src/index.ts";\nexport type Subject = Props;\n',
      },
      expect: { count: 1, messageIncludes: "browser-only contract" },
      why: "the founding defect: a Node type test consumes a re-exported type canonically authored in browser TSX",
    },
    {
      files: { "tests/ui/base.test.ts": 'import { Button } from "@base-ui/react/button";\nexport const unused = 1;\n' },
      expect: { count: 1 },
      why: "a direct Base UI door is browser-only even when its binding is currently unused",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/ui/src/items.tsx": "export interface Item { readonly name: string }\n",
        "packages/client/src/mapper.ts": 'import type { Item } from "../../ui/src/items.tsx"; export function items(): Item[] { return [{ name: "item" }]; }\n',
        "tests/client/mapper.test.ts": 'import { items } from "../../packages/client/src/mapper.ts"; export const names = items().map(item => item.name);\n',
      },
      why: "reading a scalar data field does not become a browser contract merely because its interface was declared beside a component",
    },
    {
      files: {
        "packages/ui/src/pure.ts": "export function mark(): number { return 1; }\n",
        "tests/ui/pure.test.ts":
          'import { mark } from "../../packages/ui/src/pure.ts";\nexport const used = mark();\nexport function shadow(mark: string): string { return mark; }\nexport const record = { mark: 1 };\n',
      },
      why: "a same-named local parameter or object key is not the imported binding and cannot manufacture an unreadable browser origin",
    },
    {
      files: {
        "packages/ui/src/contracts.ts": "export interface VariantAttrs { readonly tone?: string }\n",
        "tests/ui/contracts.test-d.ts": 'import type { VariantAttrs } from "../../packages/ui/src/contracts.ts";\nexport type Subject = VariantAttrs;\n',
      },
      why: "a DOM-free pure contract authored in a browser package's .ts module remains available to Node tests",
    },
    {
      files: {
        "packages/ui/src/input.tsx": "export interface InputProps { readonly value?: string }\n",
        "tests/ui/input.dom.test-d.ts": 'import type { InputProps } from "../../packages/ui/src/input.tsx";\nexport type Subject = InputProps;\n',
      },
      why: "the explicit browser test kind owns browser contracts",
    },
  ],
};
