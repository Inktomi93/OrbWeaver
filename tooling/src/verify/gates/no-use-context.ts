// React 19 replaced `useContext(Context)` with the `use(Context)` hook; keeping the legacy reader splits one
// read into two spellings and forfeits `use`'s conditional/suspense-aware call position, which is what the
// migration was for. Sibling of no-forward-ref / no-context-provider, and ARM-FOR-ARM IDENTICAL to
// no-forward-ref by construction (`reactExportVisitors`): both are the same law applied to one export, so a
// coverage difference between them would be an accident.
//
// TWO ARMS: the import DOOR React's `useContext` enters through, and the CALL whose callee resolves to it.
// The legacy gate compared `expr.getText()` against "useContext" / "React.useContext", so an import alias
// and a namespace member were silent greens and a local `useContext` helper was a false red.
// No exemptions — the replacement is total. Unresolvable origin is REPORTED, never passed (§5, #944).
//
// FAMILY `react-origin` — the shared reader is `lib/react-origin.ts` (canonical React export identity),
// consumed here through `reactExportVisitors(EXPORT, …)`. That shared entry is WHY this module and
// `no-forward-ref` are arm-for-arm identical: the coverage cannot diverge without the reader diverging.
// POPULATION PORT: NOT byte-identical, and it moves in both directions. The legacy descriptor declared no
// `scanRoot` at all (`7ed48eca8^`), so its population was the legacy harness fileset (`packages/*/src` plus
// `tests/`); the final is `@authored` — a NARROWING by `packages/showcase-plugins/src` and a WIDENING by
// `tooling/src` + `scripts/`, both measured empty of subjects. The derivation and its planted control have
// ONE home, in the shared reader's own header, rather than three copies across this family.
// SUPERSEDED 2026-09-13 (lane cb-b-header-residue), the refuted text kept above: "it moves in both directions",
// "(`packages/*/src` plus `tests/`)" and "a WIDENING by `tooling/src` + `scripts/`" are REFUTED. The live legacy pass
// at `7ed48eca8^` loaded `_shared/ts-workspace.ts#harnessGlobs` (`lib/pass.ts:434`, `getWorkspace({ root })`), which
// already carried `tooling/src` and `scripts/`; the narrower glob list in `lib/harness.ts` served only the baseline
// writers. Measured over that tree's harness candidates: legacy − final = {`packages/showcase-plugins/src/index.ts`},
// final − legacy = ∅ — a one-file NARROWING, with the sets and controls at the end of this header.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-use-context` descriptor at a4ec5c1b6525da029b9d35bda2c3c4b7720e5c0a, the parent of the conversion `7ed48eca8`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,196 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy harness dispatch (no
// `scanRoot`) admits 7,196 and final `population` admits 7,195. legacy − final =
// {`packages/showcase-plugins/src/index.ts`} — the one source of an authored package outside the declared composite
// roots (`@showcase` is not in `@authored`/`@packages`, #1980, `contract/population.ts`); a one-file NARROWING.
// final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by
// both; outside `docs/__cbbhr_out_control.ts` (virtual) rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
import type { Node } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { reactExportVisitors } from "../lib/react-origin.ts";
import { REACT_LOOKALIKE_HOME, REACT_TYPES_HOME, reactLookalikeProofModule, reactOverloadedProofModule, reactProofModule } from "./_proof/react.ts";

const EXPORT = "useContext";
const MESSAGE =
  "React 19 deprecates `useContext`. Read the context with the `use` hook instead — `const v = use(MyContext)` — which also works in a conditional position. Drop the `useContext` import. (Spine-TypeScript-and-Patterns.md §1)";
const UNREADABLE =
  "this reference is spelled like React's `useContext` but the shared readers cannot resolve where it comes from — it may be a mutable binding, a dynamic member, or a door with no resolvable source, so the React-19 claim CANNOT be established either way. Reported rather than passed: the spelling alone is not the identity.";

const REACT_PROOF = { [REACT_TYPES_HOME]: reactProofModule() };

function anchor(node: Node): { readonly token: string; readonly offset: number } | undefined {
  const offset = node.getText().lastIndexOf(EXPORT);
  return offset < 0 ? undefined : { token: EXPORT, offset };
}

export const gate = defineGate({
  id: "no-use-context",
  family: "react-origin",
  authority: "ordinary",
  severity: "error",
  population: "@authored",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "read the context with `use(MyContext)` from react and drop the useContext import. A deliberate site " +
    "is waived with `@orb-waive no-use-context(<position>): <reason>` on the line above, where <position> " +
    "is the literal `useContext`.",
  create: (ctx) => ({
    visitors: reactExportVisitors(EXPORT, (node, verdict) => {
      const at = anchor(node);
      ctx.report.node(node, { ...(verdict === "unreadable" ? { message: UNREADABLE } : {}), ...(at ?? {}) });
    }),
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx":
          'import { createContext, useContext } from "react";\nconst ThemeContext = createContext("");\nexport function useTheme(): string {\n  return useContext(ThemeContext);\n}\n',
      },
      expect: { count: 2, token: "useContext" },
      why: "the founding shape — a bare useContext() read; the import fires too, so the whole legacy spelling reds at once (the legacy gate's own two-finding verdict, preserved)",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactOverloadedProofModule(),
        "packages/client/src/feature/ui.tsx":
          'import { createContext, useContext } from "react";\nconst ThemeContext = createContext("");\nexport function useTheme(): string {\n  return useContext(ThemeContext);\n}\n',
      },
      expect: { count: 2, messageIncludes: "React 19 deprecates" },
      why: "AN OVERLOADED REACT EXPORT still gets the PRECISE verdict — the sibling of no-forward-ref's overload row, because these two policies are arm-for-arm identical by construction. The module reader used to refuse a multiply-declared export as `ambiguous`, which this fail-closed arm turns into the loud `unreadable` message; asserting the deprecation message is what reds the row if the refusal returns",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx":
          'import React, { createContext } from "react";\nconst ThemeContext = createContext("");\nexport function useTheme(): string {\n  return React.useContext(ThemeContext);\n}\n',
      },
      expect: { count: 1 },
      why: "the MEMBER arm — a default React import carries no useContext ImportSpecifier, so React.useContext's only door is the call site",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": 'import { useContext } from "react";\nexport const reader = useContext;\n',
      },
      expect: { count: 1 },
      why: "the IMPORT arm alone — a useContext binding imported but never called is already the legacy spelling entering the file",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx":
          'import { createContext, useContext as read } from "react";\nconst ThemeContext = createContext("");\nexport const theme = read(ThemeContext);\n',
      },
      expect: { count: 2 },
      why: "AN IMPORT ALIAS: the local spelling `read` carries none of the identity, so the legacy text check saw only the specifier and never the call",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx":
          'import * as R from "react";\nconst ThemeContext = R.createContext("");\nexport const theme = R.useContext(ThemeContext);\n',
      },
      expect: { count: 1 },
      why: "A NAMESPACE MEMBER: a namespace import produces no ImportSpecifier at all and `R.useContext` is not the string `React.useContext` (#1506)",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": 'import * as R from "react";\nexport const reader = R.useContext;\n',
      },
      expect: { count: 1, token: "useContext" },
      why: "A NAMESPACE MEMBER THAT IS NOT CALLED (#2353) — the namespace twin of the IMPORT arm above, and until the member door landed it was reachable by NO visitor: there is no ImportSpecifier and no CallExpression, so the legacy spelling entered the file completely unjudged. This policy and `no-forward-ref` stay arm-for-arm identical by construction, so the door is in `lib/react-origin.ts` rather than here",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx":
          'import * as R from "react";\nconst ThemeContext = R.createContext("");\nexport const theme = R["useContext"](ThemeContext);\n',
      },
      expect: { count: 1 },
      why: "A COMPUTED-LITERAL MEMBER is the same reference — the shared member reader normalizes the bracket spelling (#1506)",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/shim.ts": 'export { useContext } from "react";\n',
        "packages/client/src/feature/ui.tsx": 'import { useContext } from "../shim.ts";\nexport const reader = useContext;\n',
      },
      expect: { count: 1 },
      why: "A RE-EXPORT DOOR still delivers React's useContext; the authored specifier is a project module and only the canonical target proves the identity",
    },
    {
      mode: "types",
      files: { "packages/client/src/feature/ui.tsx": 'import { useContext } from "./nowhere.ts";\nexport const unused = 1;\n' },
      expect: { count: 1, token: "useContext", messageIncludes: "CANNOT be established" },
      why: "#1990/D1 — THE UNREADABLE ARM, PROVEN: the import door names `useContext` but resolves to nothing (`./nowhere.ts` does not exist). The specifier is still a module-alias declaration, so `bindsProvenNonModuleDeclaration` (origin-verdict.ts) is false and the refusal fails closed. Reported rather than passed (#944)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx":
          'import { createContext, use } from "react";\nconst ThemeContext = createContext("");\nexport function useTheme(): string {\n  return use(ThemeContext);\n}\n',
      },
      why: "the React 19 replacement this policy exists to drive traffic to — `use(Context)`, callable in a conditional position",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": 'import { createContext } from "react";\nexport const ThemeContext = createContext<string | null>(null);\n',
      },
      why: "`createContext` is untouched — React 19 deprecated the READER and `<Context.Provider>` (no-context-provider's arm), never the context itself",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/feature/ui.tsx": "function useContext(key: string): string {\n  return key;\n}\nexport const theme = useContext('theme');\n",
      },
      why: "A LOCAL SHADOW: a same-file helper named `useContext` is a different symbol entirely. The legacy text check RED'd this; only the resolved origin can tell the two apart",
    },
    {
      mode: "types",
      files: {
        [REACT_LOOKALIKE_HOME]: reactLookalikeProofModule(),
        "packages/client/src/feature/ui.tsx":
          'import { createContext, useContext } from "not-react";\nconst C = createContext("");\nexport const theme = useContext(C);\n',
      },
      why: "SAME NAME, WRONG PACKAGE: another package exporting `useContext` is not React's deprecated reader, and nothing but the resolved module home distinguishes it",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx":
          'import React, { createContext } from "react";\nconst ThemeContext = createContext("");\nexport function useTheme(): string {\n' +
          "  // @orb-waive no-use-context(useContext): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "  return React.useContext(ThemeContext);\n}\n",
      },
      why: "POSITIONAL IDENTITY: the report anchors on the reference with the token `useContext` — the EXPORT name, not the receiver spelling — so `React.useContext` is waived as `useContext`. Built on the MEMBER arm mustFlag[2] (:68) because it is a ONE-finding fixture: the founding row also fires on the import door, and one marker suppresses one occurrence. The marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
  ],
});
