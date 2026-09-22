// Policy: no-legacy-react-api — pre-hooks React APIs and non-boundary class components are retired.
// Import doors, namespace/default members, aliases and class bases are resolved to canonical module origin.
// The sole live library compatibility site uses the central positional @orb-waive authority; the duplicate
// marker parser and stale-marker state from the legacy descriptor are deleted.
//
// POPULATION PORT: the legacy descriptor had no scanRoot and was dispatched over the harness workspace.
// `@authored` includes every shipped workspace the predecessor harness admitted.
import type { ClassDeclaration, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal, referenceNamesExport } from "../lib/origin-verdict.ts";
import { createReactExportMatcher, isReactOrigin, reactExportPath } from "../lib/react-origin.ts";
import { declaredByPackage } from "../lib/type-member-origin.ts";
import { REACT_LOOKALIKE_HOME, REACT_TYPES_HOME, reactLookalikeProofModule, reactProofModule } from "./_proof/react.ts";

const BANNED_REACT_IMPORTS = ["cloneElement", "createRef", "Children", "PureComponent"] as const;
const BANNED_REACT_DOM_IMPORTS: ReadonlySet<string> = new Set(["useFormState", "flushSync"]);
const BOUNDARY_MEMBERS: ReadonlySet<string> = new Set(["componentDidCatch", "getDerivedStateFromError"]);
const REACT_MATCHERS = new Map(BANNED_REACT_IMPORTS.map((name) => [name, createReactExportMatcher(name)] as const));
const COMPONENT = createReactExportMatcher("Component");
const PURE_COMPONENT = createReactExportMatcher("PureComponent");

const MESSAGE =
  "a legacy React API: cloneElement, createRef, Children.*, PureComponent, a non-boundary class component, or react-dom useFormState/flushSync. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const FIX =
  "replace the legacy API with the React 19 function-component equivalent. Error boundaries remain classes and pass structurally. A deliberate library compatibility site uses @orb-waive no-legacy-react-api(<position>): <reason>.";

function report(ctx: GatePolicyContext, node: MorphNode, token?: string): void {
  if (token === undefined) {
    ctx.report.node(node);
    return;
  }
  const offset = node.getText().lastIndexOf(token);
  ctx.report.node(node, offset < 0 ? undefined : { token, offset });
}

function isErrorBoundary(node: ClassDeclaration): boolean {
  return node.getMembers().some((member) => {
    const name = Node.isMethodDeclaration(member) || Node.isPropertyDeclaration(member) ? member.getName() : undefined;
    return name !== undefined && BOUNDARY_MEMBERS.has(name);
  });
}

function reactMemberCandidate(node: MorphNode): boolean {
  if (referenceNamesExport(node, "cloneElement") || referenceNamesExport(node, "createRef")) {
    return true;
  }
  return (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) && referenceNamesExport(node.getExpression(), "Children");
}

function judgeReactMember(node: MorphNode): { readonly banned: boolean; readonly token?: string; readonly unreadable?: boolean } {
  if (!reactMemberCandidate(node)) {
    return { banned: false };
  }
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, node) === "unreadable" ? { banned: true, unreadable: true } : { banned: false };
  }
  if (!isReactOrigin(origin.value)) {
    return { banned: false };
  }
  const path = reactExportPath(origin.value);
  const first = path[0];
  if ((first === "cloneElement" || first === "createRef") && path.length === 1) {
    return { banned: true, token: first };
  }
  return first === "Children" && path.length >= 2 ? { banned: true, token: "Children" } : { banned: false };
}

function reactDomImport(node: MorphNode): "react-dom" | "other" | "unreadable" {
  if (!(Node.isImportSpecifier(node) && BANNED_REACT_DOM_IMPORTS.has(node.getName()))) {
    return "other";
  }
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, node.getNameNode()) === "unreadable" ? "unreadable" : "other";
  }
  const canonical = origin.value.canonical;
  const fromReactDom = canonical.kind === "external-door" ? canonical.moduleSpecifier === "react-dom" : declaredByPackage([canonical.declaration], "react-dom");
  return fromReactDom ? "react-dom" : "other";
}

function classVerdict(node: ClassDeclaration): { readonly banned: boolean; readonly token?: string; readonly unreadable?: boolean } {
  if (isErrorBoundary(node)) {
    return { banned: false };
  }
  const base = node.getExtends()?.getExpression();
  if (base === undefined) {
    return { banned: false };
  }
  const namedComponent = referenceNamesExport(base, "Component");
  const namedPure = referenceNamesExport(base, "PureComponent");
  if (!(namedComponent || namedPure)) {
    return { banned: false };
  }
  const token = namedPure ? "PureComponent" : "Component";
  const verdict = namedPure ? PURE_COMPONENT.reference(base) : COMPONENT.reference(base);
  if (verdict === "react") {
    return { banned: true, token };
  }
  return verdict === "unreadable" ? { banned: true, token, unreadable: true } : { banned: false };
}

export const gate = defineGate({
  id: "no-legacy-react-api",
  family: "react-origin",
  authority: "ordinary",
  severity: "error",
  population: "@authored",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.ImportSpecifier],
        visit: (node): void => {
          if (!Node.isImportSpecifier(node)) {
            return;
          }
          const name = node.getName();
          const reactVerdict = REACT_MATCHERS.get(name as (typeof BANNED_REACT_IMPORTS)[number])?.importDoor(node);
          const domVerdict = reactDomImport(node);
          if (reactVerdict === "react" || reactVerdict === "unreadable" || domVerdict === "react-dom" || domVerdict === "unreadable") {
            report(ctx, node, name);
          }
        },
      },
      {
        kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
        visit: (node): void => {
          if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
            return;
          }
          const verdict = judgeReactMember(node);
          if (verdict.banned) {
            report(ctx, node, verdict.token);
          }
        },
      },
      {
        kinds: [SyntaxKind.ClassDeclaration],
        visit: (node): void => {
          if (!Node.isClassDeclaration(node)) {
            return;
          }
          const verdict = classVerdict(node);
          if (verdict.banned) {
            report(ctx, node.getExtends()?.getExpression() ?? node, verdict.token);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/showcase-plugins/src/index.ts": 'import { cloneElement } from "react"; export const copy = cloneElement;',
      },
      expect: { count: 1 },
      why: "showcase remains in the predecessor harness population even when its current source is clean",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import { cloneElement } from "react";\nexport const c = cloneElement;\n',
      },
      expect: { count: 1, token: "cloneElement" },
      why: "the named React import door for cloneElement",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import { Children, createRef, PureComponent } from "react";\nexport const c = [Children, createRef, PureComponent];\n',
      },
      expect: { count: 3 },
      why: "every banned named React import reports independently",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import * as R from "react";\nexport const a = R.Children.toArray([]);\n',
      },
      expect: { count: 1, token: "Children" },
      why: "a namespace Children member resolves canonically and reports only the outer access",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import React from "react";\nexport const r = React.createRef();\n',
      },
      expect: { count: 1, token: "createRef" },
      why: "the default-object createRef spelling",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import { Component as Base } from "react";\nexport class Legacy extends Base { render() { return null; } }\n',
      },
      expect: { count: 1 },
      why: "an aliased React Component base is still a non-boundary class component",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/x/x.tsx": "export class Legacy extends Component<P, S> { render() { return null; } }\n",
      },
      expect: { count: 1 },
      why: "the legacy bare Component class shape fails closed when its origin cannot be established",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import React from "react";\nexport class LegacyPure extends React.PureComponent { render() { return null; } }\n',
      },
      expect: { count: 1, token: "PureComponent" },
      why: "the React-qualified PureComponent class base remains covered",
    },
    {
      mode: "types",
      files: {
        "node_modules/react-dom/index.d.ts": "export declare function flushSync(fn: () => void): void;\nexport declare function useFormState(): unknown;\n",
        "packages/client/src/features/x/components/x.tsx":
          'import { flushSync, useFormState } from "react-dom";\nexport const c = [flushSync, useFormState];\n',
      },
      expect: { count: 2 },
      why: "both retired react-dom import doors",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/near-names.ts": "export const x = [Missing.ChildrenWidget, Missing.cloneElementFactory, Missing.createReference];",
      },
      why: "unresolved near-name members are not candidates for a banned React export",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx":
          'import { Component } from "react";\nexport class Boundary extends Component { static getDerivedStateFromError() { return {}; } render() { return null; } }\n',
      },
      why: "an error boundary remains a class and passes structurally",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import type { Component } from "react";\nexport type C = Component;\n',
      },
      why: "Component itself is not a banned import because error boundaries need its value form",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx":
          'import type { Component } from "react";\nexport interface Props extends Record<string, unknown> { component?: Component; }\n',
      },
      why: "type-level React component composition is outside the ClassDeclaration arm",
    },
    {
      mode: "types",
      files: {
        [REACT_LOOKALIKE_HOME]: reactLookalikeProofModule(),
        "packages/ui/src/x/x.tsx": 'import { createRef } from "not-react";\nexport const r = createRef();\n',
      },
      why: "a same-named export from another package is a different identity",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/x/x.tsx": "class Component {}\nexport class Local extends Component { render() { return null; } }\n",
      },
      why: "a local same-named base is not React Component",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx":
          '// @orb-waive no-legacy-react-api(Children): the library interface is children; ends when the interface changes.\nimport { Children } from "react";\nexport const a = Children;\n',
      },
      why: "the central positional ordinary waiver suppresses the live compatibility site",
    },
  ],
});
