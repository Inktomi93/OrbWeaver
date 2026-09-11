// Gate: test-world-browser-contracts — a Node-intent test/helper cannot compile only because React's
// global.d.ts supplies empty DOM interfaces, nor consume browser-authored UI/client contracts.
//
// CARRY-FORWARD (gate-runtime-standardization.md, "World-program changes that must survive cutover" —
// "Browser contracts require the real DOM world"): canonical browser components, aliases, and React DOM
// contracts still reject in Node-intent tests; pure data, ReactNode, and genuine Node globals stay legal;
// the unreadable-origin refusal is preserved verbatim (an unreadable relevant import still throws a tool
// error rather than silently passing).
//
// FAMILY DECISION: singleton. `verify/lib/browser-contract-reader.ts` has exactly one consumer — this
// policy — so there is no sibling to share a family with (design doc: "not that their filenames share a
// prefix or their prose mentions the same topic").
//
// AUTHORITY: `hard`. The legacy descriptor carried no suppression mechanism at all — a Node-intent test
// consuming a browser contract is never a legitimate exception, only a mis-filed test kind (the fix is
// renaming it to `.dom.*`, not waiving the finding).
//
// SHAPE NOTE: `isNodeTestContractRoot` (world-aware: `tests/` and world `node`/`iso`, excluding CT/e2e/
// story/browser-suffixed files) is a table-driven classifier (`_shared/test-kinds.ts`), not a path glob the
// population algebra's `named`/`ext`/`under` can re-derive without duplicating that canonical table by
// hand. `population` therefore stays coarse (`@tests`, loadable extensions) and the exact admission check
// runs INSIDE the shared per-node walk by calling the same shared function the population algebra cannot
// express — the identical computation, just at the per-file dispatch site instead of the coarse candidate
// filter, which the final contract permits ("call shared readers").
//
// The legacy module's `stateFor`/`states` WeakMap-by-`ctx.passIdentity` indirection existed only because
// the old contract had no per-invocation `create()`; that whole mechanism disappears — `create(ctx)` now
// closes over the dedup state directly, once per invocation, exactly as the final contract requires.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
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

/** One node's browser-contract verdict, or undefined when it is out of the class this policy judges. */
function nodeIssue(node: import("ts-morph").Node, candidateBindings: WeakMap<object, ReadonlySet<string>>): BrowserContractIssue | undefined {
  if (Node.isImportDeclaration(node)) {
    return directBaseUiDoor(node);
  }
  const isTypedUse = Node.isTypeReference(node) || Node.isExpressionWithTypeArguments(node);
  const isBoundValueUse = isConsumedReference(node) && isPotentialModuleReference(node, candidateBindings);
  return isTypedUse || isBoundValueUse ? browserContractIssue(node) : undefined;
}

export const gate = defineGate({
  id: "test-world-browser-contracts",
  family: "test-world-browser-contracts",
  authority: "hard",
  severity: "error",
  population: { in: ["@tests"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const reportedSites = new Set<string>();
    const candidateBindings = new WeakMap<object, ReadonlySet<string>>();
    return {
      visitors: [
        {
          kinds: [
            SyntaxKind.ImportDeclaration,
            SyntaxKind.TypeReference,
            SyntaxKind.ExpressionWithTypeArguments,
            SyntaxKind.Identifier,
            SyntaxKind.PropertyAccessExpression,
            SyntaxKind.ElementAccessExpression,
          ],
          visit: (node, sf) => {
            if (!isNodeTestContractRoot(ctx.relativePath(sf))) {
              return;
            }
            const issue = nodeIssue(node, candidateBindings);
            if (issue === undefined) {
              return;
            }
            const site = issue.kind === "unreadable" ? `${sf.getFilePath()}:unreadable:${issue.detail}` : `${sf.getFilePath()}:${node.getStart()}`;
            if (reportedSites.has(site)) {
              return;
            }
            reportedSites.add(site);
            if (issue.kind === "unreadable") {
              throw new Error(issue.detail);
            }
            ctx.report.node(node, { token: node.getText(), offset: 0 });
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/ui/src/input.tsx": "export interface InputProps { readonly value?: string }\n",
        "packages/ui/src/index.ts": 'export type { InputProps } from "./input.tsx";\n',
        "tests/ui/input.test-d.ts": 'import type { InputProps as Props } from "../../packages/ui/src/index.ts";\nexport type Subject = Props;\n',
      },
      expect: { count: 1, messageIncludes: "browser-only contract" },
      why: "the founding defect: a Node type test consumes a re-exported type canonically authored in browser TSX",
    },
    {
      mode: "types",
      files: { "tests/ui/base.test.ts": 'import { Button } from "@base-ui/react/button";\nexport const unused = 1;\n' },
      expect: { count: 1 },
      why: "a direct Base UI door is browser-only even when its binding is currently unused",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/input.tsx": "export interface InputProps { readonly value?: string }\n",
        "packages/ui/src/index.ts": 'export type { InputProps as PublicProps } from "./input.tsx";\n',
        "tests/ui/namespace.test-d.ts": 'import type * as UI from "../../packages/ui/src/index.ts";\nexport type Subject = UI.PublicProps;\n',
      },
      expect: { count: 1 },
      why: "a browser-authored type survives a renamed barrel export reached through a NAMESPACE import, not just a named one",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/button.tsx": "export function Button(): string { return 'button' }\n",
        "packages/ui/src/index.ts": 'export { Button as Action } from "./button.tsx";\n',
        "tests/ui/renamed-runtime.test.ts":
          'import { Action as renderAction } from "../../packages/ui/src/index.ts";\nexport const subject = renderAction();\n',
      },
      expect: { count: 1 },
      why: "a consumed RUNTIME binding (not a type) survives a renamed barrel export",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/button.tsx": "export function Button(): string { return 'button'; }",
        "packages/ui/src/index.ts": "import { Button } from './button.tsx'; export const Action = Button;",
        "tests/ui/const-facade.test.ts": "import { Action } from '../../packages/ui/src/index.ts'; export const subject = Action();",
      },
      expect: { count: 1, token: "Action" },
      why: "a callable exposed through a renamed const facade retains browser ownership",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/button.tsx": "export function Button(): string { return 'button'; }",
        "packages/ui/src/index.ts": "import { Button } from './button.tsx'; export const API = { Button };",
        "tests/ui/object-facade.test.ts": "import { API } from '../../packages/ui/src/index.ts'; export const subject = API.Button();",
      },
      expect: { count: 1, token: "API.Button" },
      why: "a callable exposed as an OBJECT-LITERAL facade member retains browser ownership",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/button.tsx": "export function Button(): string { return 'button'; }",
        "packages/ui/src/index.ts": "import { Button } from './button.tsx'; export const API = { Button };",
        "tests/ui/aliased-object-facade.test.ts":
          "import { API } from '../../packages/ui/src/index.ts'; const local = API; export const subject = local.Button();",
      },
      expect: { count: 1, token: "local.Button" },
      why: "the same object-facade member reached through a LOCAL alias still resolves to the same callable identity",
    },
    // The canonical-React-DOM-generic shapes (ComponentProps/Ref/DOMAttributes/SyntheticEvent/the React
    // global.d.ts fallback and namespace-door identity) need the REAL @types/react + lib.dom resolution —
    // an isolated in-memory fixture cannot resolve a bare `"react"` import, so those proofs stay in the
    // dedicated `tests/tooling/verify/gates/test-world-browser-contracts.repo.int.test.ts`, which runs them
    // through the real workspace `tsconfig.json` the way this class of finding actually depends on.
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/ui/src/items.tsx": "export interface Item { readonly name: string }\n",
        "packages/client/src/mapper.ts": 'import type { Item } from "../../ui/src/items.tsx"; export function items(): Item[] { return [{ name: "item" }]; }\n',
        "tests/client/mapper.test.ts": 'import { items } from "../../packages/client/src/mapper.ts"; export const names = items().map(item => item.name);\n',
      },
      why: "reading a scalar data field does not become a browser contract merely because its interface was declared beside a component",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/pure.ts": "export function mark(): number { return 1; }\n",
        "tests/ui/pure.test.ts":
          'import { mark } from "../../packages/ui/src/pure.ts";\nexport const used = mark();\nexport function shadow(mark: string): string { return mark; }\nexport const record = { mark: 1 };\n',
      },
      why: "a same-named local parameter or object key is not the imported binding and cannot manufacture an unreadable browser origin",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/contracts.ts": "export interface VariantAttrs { readonly tone?: string }\n",
        "tests/ui/contracts.test-d.ts": 'import type { VariantAttrs } from "../../packages/ui/src/contracts.ts";\nexport type Subject = VariantAttrs;\n',
      },
      why: "a DOM-free pure contract authored in a browser package's .ts module remains available to Node tests",
    },
    // The React-generics negative proof (ReactNode/arbitrary generics/an application ref target) and the
    // Event/EventTarget merged-declaration proof are the mustPass twins of the react-dependent rows above —
    // same real-resolution requirement, same successor home.
    {
      mode: "types",
      files: {
        "packages/ui/src/input.tsx": "export interface InputProps { readonly value?: string }\n",
        "tests/ui/input.dom.test-d.ts": 'import type { InputProps } from "../../packages/ui/src/input.tsx";\nexport type Subject = InputProps;\n',
      },
      why: "the explicit browser test kind owns browser contracts",
    },
  ],
});
