// React 19 deprecates `forwardRef`; `ref` is an ordinary prop now. TWO ARMS, both keyed on ORIGIN rather
// than spelling: the import DOOR that brings React's `forwardRef` into a file, and the CALL whose callee
// resolves to it. The legacy gate compared `expr.getText()` against "forwardRef" and "React.forwardRef",
// which meant an import alias (`forwardRef as fr`) and a namespace member (`import * as R; R.forwardRef(…)`)
// were silent greens while a LOCAL helper named `forwardRef` was a false red. THIRD ANSWER, never silence:
// a candidate whose origin the shared readers cannot resolve is REPORTED as unreadable (GATE-AUTHORING §5).
//
// FAMILY `react-origin` — the shared reader is `lib/react-origin.ts` (canonical React export identity),
// consumed here through `reactExportVisitors(EXPORT, …)`, the identical entry `no-use-context` takes with a
// different export name. Five members read it, so "is this REACT's X" cannot answer differently in five
// policies.
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
// `no-forward-ref` descriptor at a4ec5c1b6525da029b9d35bda2c3c4b7720e5c0a, the parent of the conversion `7ed48eca8`
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
// CURRENT 2026-09-21: showcase/default-content are members of `@authored`, closing the dated one-file
// narrowing above. The widened policy remains clean on the real tree.
import type { Node } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { reactExportVisitors } from "../lib/react-origin.ts";
import { REACT_LOOKALIKE_HOME, REACT_TYPES_HOME, reactLookalikeProofModule, reactOverloadedProofModule, reactProofModule } from "./_proof/react.ts";

const EXPORT = "forwardRef";
const MESSAGE =
  "React 19 deprecates `forwardRef`. Pass `ref` as a normal prop instead (e.g. `function MyInput({ ref, ...props })`). Drop the `forwardRef` wrapper. (Spine-TypeScript-and-Patterns.md §1)";
const UNREADABLE =
  "this reference is spelled like React's `forwardRef` but the shared readers cannot resolve where it comes from — it may be a mutable binding, a dynamic member, or a door with no resolvable source, so the React-19 claim CANNOT be established either way. Reported rather than passed: the spelling alone is not the identity. (tooling/src/verify/gates/GATE-AUTHORING.md)";

const REACT_PROOF = { [REACT_TYPES_HOME]: reactProofModule() };

function anchor(node: Node): { readonly token: string; readonly offset: number } | undefined {
  const offset = node.getText().lastIndexOf(EXPORT);
  return offset < 0 ? undefined : { token: EXPORT, offset };
}

export const gate = defineGate({
  id: "no-forward-ref",
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
    "delete the forwardRef wrapper and destructure `ref` out of props; the component keeps the same call " +
    "signature. A deliberate site is waived with `@orb-waive no-forward-ref(<position>): <reason>` on the " +
    "line above, where <position> is the literal `forwardRef` when its import binding is readable, else the " +
    "derived position — the first identifier, literal or keyword of the reported node.",
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
        "packages/client/src/feature/ui.tsx": 'import { forwardRef } from "react";\nexport const MyInput = forwardRef((props: object, ref: object) => null);\n',
      },
      expect: { count: 2, token: "forwardRef" },
      why: "the founding shape — the import door AND the call both name React's forwardRef, which is the legacy gate's own two-finding verdict preserved exactly",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactOverloadedProofModule(),
        "packages/client/src/feature/ui.tsx": 'import { forwardRef } from "react";\nexport const MyInput = forwardRef((props: object, ref: object) => null);\n',
      },
      expect: { count: 2, messageIncludes: "React 19 deprecates" },
      why: "AN OVERLOADED REACT EXPORT still gets the PRECISE verdict. React ships overloaded hooks and the module reader used to refuse any multiply-declared export as `ambiguous`, which this policy's fail-closed arm turns into the loud `unreadable` message — a declared limit of the origin-client family until `overloadHome` gave an overload set one home. The row asserts the DEPRECATION message, so it goes red the moment the reader refuses the set again",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": 'import React from "react";\nexport const MyInput = React.forwardRef((props: object, ref: object) => null);\n',
      },
      expect: { count: 1 },
      why: "the MEMBER arm — a default React import carries no forwardRef ImportSpecifier, so the call site is the only door; the origin resolves through the default member path",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": 'import { forwardRef as fr } from "react";\nexport const MyInput = fr((props: object, ref: object) => null);\n',
      },
      expect: { count: 2 },
      why: "AN IMPORT ALIAS: the local spelling `fr` carries none of the identity, so the legacy text check saw only the specifier and never the call — the resolved origin sees both",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": 'import * as R from "react";\nexport const MyInput = R.forwardRef((props: object, ref: object) => null);\n',
      },
      expect: { count: 1 },
      why: "A NAMESPACE MEMBER: a namespace import produces no ImportSpecifier whatsoever and `R.forwardRef` is not the string `React.forwardRef`, so the legacy gate was offered nothing it recognised (#1506)",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": 'import * as R from "react";\nexport const MyInput = R["forwardRef"]((p: object, r: object) => null);\n',
      },
      expect: { count: 1 },
      why: "A COMPUTED-LITERAL MEMBER is the same reference — the shared member reader normalizes the bracket spelling, so it cannot buy an escape (#1506)",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/shim.ts": 'export { forwardRef } from "react";\n',
        "packages/client/src/feature/ui.tsx": 'import { forwardRef } from "../shim.ts";\nexport const MyInput = forwardRef((p: object, r: object) => null);\n',
      },
      expect: { count: 2 },
      why: "A RE-EXPORT DOOR still delivers React's forwardRef: the authored specifier is a project module, and only traversing to the canonical target proves it is the deprecated API",
    },
    {
      mode: "types",
      files: { "packages/client/src/feature/ui.tsx": 'import { forwardRef } from "./nowhere.ts";\nexport const unused = 1;\n' },
      expect: { count: 1, token: "forwardRef", messageIncludes: "CANNOT be established" },
      why: "#1990/D1 — THE UNREADABLE ARM, PROVEN: the import door names `forwardRef` but resolves to nothing (`./nowhere.ts` does not exist). The specifier is still a module-alias declaration, so `bindsProvenNonModuleDeclaration` (origin-verdict.ts) is false and the refusal fails closed. Reported rather than passed (#944)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx":
          "export function MyInput({ ref, value }: { ref: unknown; value: string }): unknown {\n  void ref;\n  return value;\n}\n",
      },
      why: "the React-19 replacement this policy exists to drive traffic to — `ref` as an ordinary prop",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/feature/ui.tsx":
          "function forwardRef(render: (props: object) => unknown): unknown {\n  return render;\n}\nexport const MyInput = forwardRef((props: object) => null);\n",
      },
      why: "A LOCAL SHADOW: a same-file helper named `forwardRef` is a different symbol entirely. The legacy text check RED'd this; only the resolved origin can tell the two apart",
    },
    {
      mode: "types",
      files: {
        [REACT_LOOKALIKE_HOME]: reactLookalikeProofModule(),
        "packages/client/src/feature/ui.tsx": 'import { forwardRef } from "not-react";\nexport const MyInput = forwardRef((p: object, r: object) => null);\n',
      },
      why: "SAME NAME, WRONG PACKAGE: another package exporting `forwardRef` is not React's deprecated API, and nothing but the resolved module home distinguishes it",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": 'import { useContext } from "react";\nexport const read = useContext;\n',
      },
      why: "a DIFFERENT React export is untouched — the matcher is keyed on one exported name, not on the react door",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx":
          'import React from "react";\n' +
          "// @orb-waive no-forward-ref(forwardRef): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export const MyInput = React.forwardRef((props: object, ref: object) => null);\n",
      },
      why: "POSITIONAL IDENTITY: the report anchors on the reference with the token `forwardRef` — the EXPORT name, not the local spelling of its receiver — so `React.forwardRef` is waived as `forwardRef`. Built on the MEMBER arm mustFlag[2] (:62) because it is a ONE-finding fixture: the founding row also fires on the import door, and one marker suppresses one occurrence. The marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
    {
      mode: "types",
      files: {
        ...REACT_PROOF,
        "packages/client/src/feature/ui.tsx": "declare const opaque: any;\nexport const x = (): unknown => opaque.doIt();\n",
      },
      why: "#1999 — THE CANDIDATE-SPELLING PREFILTER, PINNED (shared reader, `lib/react-origin.ts`'s `couldNameReactExport`): a member callee whose leaf name is not `forwardRef` and whose receiver is not a react-bound spelling is not even a candidate, so it is never resolved at all. This row lives here rather than in `no-use-context` too because the fence is in the SHARED reader, not per-consumer; both policies share this one proof. Cutting the whole prefilter (`couldNameReactExport`, react-origin.ts) turns this red — the opaque `any` receiver then resolves to `unreadable` and gets reported, which is exactly the 439-false-finding cost the header describes if the prefilter is skipped instead of gated",
    },
    {
      mode: "types",
      files: { "packages/client/src/feature/ui.tsx": 'import { mystery } from "./nowhere.ts";\nexport const unused = 1;\n' },
      why: "#1999 — THE IMPORT DOOR'S EXPORTED-NAME FENCE, PINNED (shared reader, `lib/react-origin.ts`'s `importDoor`): a specifier whose OWN name is not `forwardRef` is a proven different export and never a candidate, regardless of where it resolves — one shared proof for `no-forward-ref` and `no-use-context`, the fence's only two consumers. Cutting `specifier.getName() !== exportedName` turns this red: the specifier then resolves against `./nowhere.ts` (which does not exist) and reports unreadable",
    },
  ],
});
