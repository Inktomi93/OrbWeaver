// Policy: no-direct-useform — TanStack Form's raw mints are the shared toolkit's
// business alone. `useAppForm` (with `withForm`/`withFieldGroup`) pre-binds the @orb/ui Field components;
// a surface that calls `useForm`/`createFormHook`/`createFormHookContexts` itself bypasses the bound fields
// and drifts every editor surface apart.
//
// AUTHORITY IS reviewed-grant. `packages/client/src/forms/` IS what those mints are called in — the toolkit
// is built out of them — so the home is a recurring repository PERMISSION with exact `(subject, operation)`
// rows in `lib/reviewed-grants.ts`, one per mint the toolkit actually calls. The legacy module kept a
// DIRECTORY row plus its own rename tripwire; the central rows are finer and self-checking, because a
// toolkit file that stops making a particular mint stales exactly that row.
//
// IDENTITY, NOT SPELLING. The legacy check was a bare Identifier callee whose TEXT was one of the three
// names, so a local helper named `useForm` red and a namespace/aliased/computed spelling of the real mint
// was invisible. The subject is the EXPORT DECLARED BY `@tanstack/react-form`.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readPackageExportOrigin } from "../lib/project-home-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { LOOKALIKE_HOME, tanstackReactFormProof, vendorLookalikeProof } from "./_proof/client-vendors.ts";

const MINTS: ReadonlySet<string> = new Set(["useForm", "createFormHook", "createFormHookContexts"]);
const REACT_FORM = "@tanstack/react-form";
const OPERATION_PREFIX = "tanstack-form-mint";

const MESSAGE =
  "TanStack Form's raw mint is called outside the shared form toolkit — use `useAppForm` (and `withForm` / " +
  "`withFieldGroup`) from `#forms/editor`. The shared instance pre-binds the @orb/ui Field components; calling " +
  "`useForm`/`createFormHook`/`createFormHookContexts` directly bypasses the bound fields and drifts every " +
  "editor surface apart.";
const UNREADABLE =
  "this call is spelled like a TanStack Form mint but the shared readers cannot place its binding, so whether it is the vendor's own export CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the binding a readable import origin; the three-answer rule is tooling/src/verify/lib/origin-verdict.ts (#944).";
const FIX = "build the form with `useAppForm` from #forms/editor; the shared toolkit's own mints are licensed by exact reviewed grants.";

/** The callee's leaf name across bare, member and computed-literal spellings. */
function calleeName(callee: MorphNode): string | null {
  let name: string | null = null;
  if (Node.isIdentifier(callee)) {
    name = callee.getText();
  }
  if (Node.isPropertyAccessExpression(callee)) {
    name = callee.getName();
  }
  if (Node.isElementAccessExpression(callee)) {
    const argument = callee.getArgumentExpression();
    const literal = argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument));
    name = literal ? argument.getLiteralText() : null;
  }
  return name;
}

export const gate = defineGate({
  id: "no-direct-useform",
  family: "no-direct-useform",
  authority: "reviewed-grant",
  severity: "error",
  // The legacy `scanRoot` was `(_p) => true` over the nine-root harness corpus — exactly `@authored`. The
  // toolkit home is a grant, not a subtraction.
  population: "@authored",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    // THE CANDIDATE PREFILTER, and the alias half of it. Resolving a canonical origin for every call in the
    // nine authored roots does not finish (the id-brand lane's measured lesson), so a call is a candidate
    // when its callee leaf is one of the three mint names OR when the file bound that mint to a local name
    // at an import specifier — an ImportSpecifier's `getName()` is the EXPORT name even when aliased, so the
    // index costs one map per file and closes the whole alias class. Imports precede calls in document
    // order, which is the order the dispatcher delivers.
    const aliasesBySource = new Map<string, Set<string>>();
    const aliasesOf = (sourceFile: import("ts-morph").SourceFile): Set<string> => {
      const path = sourceFile.getFilePath();
      let names = aliasesBySource.get(path);
      if (names === undefined) {
        names = new Set<string>();
        aliasesBySource.set(path, names);
      }
      return names;
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node, sourceFile): void => {
            if (Node.isImportSpecifier(node) && MINTS.has(node.getName())) {
              aliasesOf(sourceFile).add(node.getAliasNode()?.getText() ?? node.getName());
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const callee = node.getExpression();
            const name = calleeName(callee);
            if (name === null || !(MINTS.has(name) || aliasesOf(sourceFile).has(name))) {
              return;
            }
            const { verdict, exportedName } = readPackageExportOrigin(callee, [REACT_FORM], MINTS);
            if (verdict === "other") {
              return;
            }
            candidates.push({
              node: callee,
              subject: ctx.relativePath(sourceFile),
              // Keyed on the CANONICAL export, never the local spelling: an aliased import must consume the
              // same grant row as the plain one. An unreadable candidate keys on what it was spelled.
              operation: `${OPERATION_PREFIX}:${exportedName ?? name}`,
              unreadable: verdict === "unreadable",
              token: name,
              offset: Math.max(callee.getText().lastIndexOf(name), 0),
            });
          },
        },
      ],
      evaluate: (): void => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...tanstackReactFormProof(),
        "packages/client/src/features/some-feature/surfaces/editor.tsx":
          'import { useForm } from "@tanstack/react-form";\nexport const Editor = (): unknown => useForm();\n',
      },
      expect: { count: 1, token: "useForm" },
      why: "the founding shape — a surface minting its own form instead of using the toolkit's `useAppForm`",
    },
    {
      mode: "types",
      grant: { subject: "packages/client/src/forms/editor/use-app-form.ts", operation: "tanstack-form-mint:createFormHook" },
      files: {
        ...tanstackReactFormProof(),
        "packages/client/src/forms/editor/use-app-form.ts":
          'import { createFormHook } from "@tanstack/react-form";\nexport const { useAppForm } = createFormHook({});\n',
      },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the toolkit's own mint reds like any other call and is licensed by an exact grant row keyed on (file, mint), so a NEW mint in the toolkit is a finding until someone reviews it",
    },
    {
      mode: "types",
      files: {
        ...tanstackReactFormProof(),
        "packages/client/src/features/some-feature/surfaces/aliased.tsx":
          'import { useForm as buildForm } from "@tanstack/react-form";\nexport const Editor = (): unknown => buildForm();\n',
      },
      expect: { count: 1 },
      why: "THE ALIAS RED: the mint imported under another local name is the same mint, and the legacy bare-name check was offered `buildForm`",
    },
    {
      mode: "types",
      files: {
        ...tanstackReactFormProof(),
        "packages/client/src/features/some-feature/surfaces/namespaced.tsx":
          'import * as form from "@tanstack/react-form";\nexport const Editor = (): unknown => form.useForm();\n',
      },
      expect: { count: 1 },
      why: "THE NAMESPACE RED: a member callee is not an Identifier, so the legacy check answered 'not my subject'",
    },
    {
      mode: "types",
      files: {
        ...tanstackReactFormProof(),
        "packages/client/src/forms/editor/contexts.ts":
          'import { createFormHookContexts, useForm } from "@tanstack/react-form";\nexport const contexts = createFormHookContexts();\nexport const spare = (): unknown => useForm();\n',
      },
      expect: { count: 2 },
      why: "GRANT GRANULARITY: two DIFFERENT mints in one toolkit file are two `(subject, operation)` findings and therefore two rows — the licensed act is the mint, not the file",
    },
    {
      mode: "types",
      files: {
        ...tanstackReactFormProof(),
        "packages/client/src/features/some-feature/surfaces/opaque.tsx":
          "declare function opaque(): any;\nexport const Editor = (): unknown => opaque().useForm();\n",
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), reached by no row before #2014: the callee's leaf name puts it in the candidate set, `readPackageExportOrigin` cannot place the binding off an OPAQUE receiver, and case (b) of the refusal classifier REPORTS it rather than passing the spelling. The grant operation then keys on the SPELLING (`exportedName ?? name`), which is what an unreadable candidate has instead of a canonical export. The `messageIncludes` is load-bearing: this arm's finding count is identical to the ordinary one, so a bare `{ count: 1 }` cannot tell a live arm from a dead one",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...tanstackReactFormProof(),
        "packages/client/src/forms/editor/use-app-form.ts": "export declare const useAppForm: () => unknown;\n",
        "packages/client/src/features/some-feature/surfaces/editor.tsx":
          'import { useAppForm } from "../../../forms/editor/use-app-form.ts";\nexport const Editor = (): unknown => useAppForm();\n',
      },
      why: "the fix: the surface builds on the shared instance and never touches a vendor mint",
    },
    {
      mode: "types",
      files: {
        ...tanstackReactFormProof(),
        "packages/client/src/features/some-feature/lib/local.ts":
          "function useForm(): unknown {\n  return null;\n}\nexport const run = (): unknown => useForm();\n",
      },
      why: "A LOCAL FUNCTION of the same name is a proven different identity — the legacy bare-name check red exactly this",
    },
    {
      mode: "types",
      files: {
        ...tanstackReactFormProof(),
        ...vendorLookalikeProof(),
        "packages/client/src/features/some-feature/lib/vendor.ts":
          'import { useForm } from "vendor-lookalike";\nexport const run = (): unknown => useForm();\n',
      },
      why: `SAME NAME, WRONG PACKAGE: another library's \`useForm\` declared in ${LOOKALIKE_HOME} is not the toolkit this law fences`,
    },
    {
      mode: "types",
      files: {
        ...tanstackReactFormProof(),
        "packages/client/src/features/some-feature/lib/reference.ts": 'import { useForm } from "@tanstack/react-form";\nexport const handle = useForm;\n',
      },
      why: "a bare REFERENCE to the mint (re-exporting it, handing it to a factory) is not a mint CALL — the legacy gate keyed on the call and this keeps that narrowing, written down",
    },
  ],
});
