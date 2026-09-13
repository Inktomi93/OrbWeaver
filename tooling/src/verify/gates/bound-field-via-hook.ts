// Policy: bound-field-via-hook (derive-modernization-audit.md §W3, G28 — the useBoundField hook sealed).
// Every bound field reads its `useFieldContext<T>()`, touch-gates the error, and assembles the same
// `<Field>` prop bundle; `useBoundField` is the ONE home for that wiring, so a bound field that reaches the
// raw form context directly re-hand-rolls the bundle that drifts (D72: a machine ships WITH its seal).
//
// AUTHORITY IS reviewed-grant, and that is why the hook's own home is no longer a `scanRoot` EXCLUSION.
// `use-bound-field.ts` genuinely reads the raw context — that is a recurring repository PERMISSION, not a
// per-occurrence mistake, so the home is SCANNED, reds like any other bound field, and is licensed by one
// exact `(subject, operation)` row in `lib/reviewed-grants.ts`. A row consumed zero times is STALE and a row
// matching more than one finding is OVER-BROAD, which is the rename/deletion liveness the old exclusion
// could not have: an excluded path follows the home into the void while its new path is judged by nobody.
//
// IDENTITY, NOT SPELLING. The legacy gate matched an ImportSpecifier whose NAME was `useFieldContext`, so a
// same-named hook from anywhere else red'd and a namespace/aliased call site was invisible. The subject is
// the symbol declared by `forms/editor/contexts.ts` — the ONE `createFormHookContexts()` destructure — resolved
// through the shared module-origin reader, and that home is located in the population and receipted so its
// rename REFUSES the run instead of silently sealing nothing.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ProjectHomeDeclaration } from "../lib/project-home-origin.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const HOOK = "useFieldContext";
const OPERATION = "raw-field-context-read";
const CONTEXT_HOME: ProjectHomeDeclaration = { path: "packages/client/src/forms/editor/contexts.ts", names: [HOOK] };

const MESSAGE =
  "a bound field reaches the raw `useFieldContext` form context directly — every bound field's context read, " +
  "touch-gated error and `<Field>` prop bundle live in ONE home. Use `useBoundField<T>(shell)` from " +
  "./use-bound-field instead (derive-modernization-audit.md §W3 G28; D72 — a machine ships WITH its seal).";
const UNREADABLE =
  "a bound field names `useFieldContext` through a binding the shared readers cannot place, so whether it is the form toolkit's own context hook CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the binding a readable import origin; the three-answer rule is tooling/src/verify/lib/origin-verdict.ts (#944).";
const FIX =
  "replace the raw `useFieldContext<T>()` + hand `touchedFieldError`/`<Field>` bundle with `useBoundField<T>(shell)` from ./use-bound-field; the hook's own home is licensed by an exact reviewed grant.";

/** The two doors the raw context enters a bound field through: the import specifier, and any call whose
 *  callee leaf is the hook's name (a namespace member, a computed-literal member, an aliased local). */
function calleeNamed(callee: MorphNode, name: string): boolean {
  if (Node.isIdentifier(callee)) {
    return callee.getText() === name;
  }
  if (Node.isPropertyAccessExpression(callee)) {
    return callee.getName() === name;
  }
  if (!Node.isElementAccessExpression(callee)) {
    return false;
  }
  const argument = callee.getArgumentExpression();
  return argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) && argument.getLiteralText() === name;
}

function candidateNode(node: MorphNode): MorphNode | null {
  let candidate: MorphNode | null = null;
  if (Node.isImportSpecifier(node) && node.getName() === HOOK) {
    candidate = node;
  }
  if (Node.isCallExpression(node)) {
    const callee = node.getExpression();
    candidate = calleeNamed(callee, HOOK) ? callee : null;
  }
  return candidate;
}

const HOME_PROOF = {
  "packages/client/src/forms/editor/contexts.ts":
    "declare function createFormHookContexts(): { fieldContext: unknown; formContext: unknown; useFieldContext: <T>() => T; useFormContext: () => unknown };\nexport const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();\n",
};

export const gate = defineGate({
  id: "bound-field-via-hook",
  family: "bound-field-via-hook",
  authority: "reviewed-grant",
  severity: "error",
  // The bound-fields family PLUS the context home itself: the home is not subtracted (a sanctioned home is a
  // grant, never population subtraction), and it must be inside the population for the liveness receipt to
  // be able to locate it at all. `execution` is entire-population for the same reason the two shipped
  // reviewed-grant policies are: a narrowed selection cannot see the home, and grant liveness is a
  // whole-population verdict — deferring loudly beats staling every row on a scoped run.
  population: { in: ["@client"], under: ["packages/client/src/forms/editor/bound-fields/**", "packages/client/src/forms/editor/contexts.ts"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: { readonly node: MorphNode; readonly subject: string }[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            const candidate = candidateNode(node);
            if (candidate !== null) {
              candidates.push({ node: candidate, subject: ctx.relativePath(sourceFile) });
            }
          },
        },
      ],
      evaluate: (): void => {
        const home = locateProjectHome(ctx.files, ctx.relativePath, CONTEXT_HOME);
        // ZERO members is a REFUSAL: the `createFormHookContexts()` destructure this policy seals was moved
        // or renamed, so nothing here can be judged honestly.
        ctx.receipt({ kind: "population", source: CONTEXT_HOME.path, members: home.members, unresolved: home.unresolved });
        if (home.sourceFile === undefined) {
          return;
        }
        const findings: ReviewedGrantCandidate[] = [];
        for (const { node, subject } of candidates) {
          const verdict = classifyProjectHomeOrigin(node, home);
          if (verdict !== "other") {
            findings.push({
              node,
              subject,
              operation: OPERATION,
              unreadable: verdict === "unreadable",
              token: HOOK,
              // Anchored on the hook name itself: a namespace/computed spelling opens with the receiver, and
              // `ctx.report.node` would otherwise derive the token from that first identifier.
              offset: Math.max(node.getText().lastIndexOf(HOOK), 0),
            });
          }
        }
        reportReviewedGrantCandidates(ctx.report, findings, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "packages/client/src/forms/editor/bound-fields/x-field.tsx", operation: "raw-field-context-read" },
      files: {
        ...HOME_PROOF,
        "packages/client/src/forms/editor/bound-fields/x-field.tsx":
          'import { useFieldContext } from "../contexts.ts";\nexport const f = (): unknown => useFieldContext<string>();\n',
      },
      expect: { count: 1, token: HOOK },
      why: "the founding shape: a bound field importing the raw context door and calling it — the re-hand-roll G28 seals",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/forms/editor/bound-fields/use-bound-field.ts":
          'import { useFieldContext } from "../contexts.ts";\nexport const useBoundField = <T,>(): unknown => useFieldContext<T>();\n',
      },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the hook's own home reds like any other bound field and is licensed by an exact grant row, so a SECOND file reaching the raw context is a finding until someone reviews it",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/forms/editor/bound-fields/aliased-field.tsx":
          'import { useFieldContext as readField } from "../contexts.ts";\nexport const f = (): unknown => readField<string>();\n',
      },
      expect: { count: 1 },
      why: "THE ALIAS RED: the same symbol imported under another local name is the same raw read. A specifier-name match saw the door but nothing else; the resolved origin sees both",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/forms/editor/bound-fields/namespaced-field.tsx":
          'import * as forms from "../contexts.ts";\nexport const f = (): unknown => forms.useFieldContext<string>();\n',
      },
      expect: { count: 1 },
      why: "THE NAMESPACE RED: no import specifier exists at all, so the legacy door check was offered nothing — the call's resolved origin is the same canonical symbol",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/forms/editor/bound-fields/twice.tsx":
          'import { useFieldContext } from "../contexts.ts";\nexport const a = (): unknown => useFieldContext<string>();\nexport const b = (): unknown => useFieldContext<number>();\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: the import door plus two calls in one file are ONE `(subject, operation)` finding, because a reviewed grant that matched three findings would be OVER-BROAD and would license nothing",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/forms/editor/bound-fields/opaque-field.tsx":
          "declare function opaque(): any;\nexport const f = (): unknown => opaque().useFieldContext<string>();\n",
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), reached by no row before #2014: a member read off an OPAQUE receiver gives the leaf no symbol at all, so `classifyOriginRefusal` answers case (b) — the spelling MIGHT be the toolkit's context hook and is REPORTED with the unreadable message rather than passed. The `messageIncludes` is the whole row: the arm produces the SAME count as the ordinary verdict and differs ONLY in message, so a bare `{ count: 1 }` would pass identically if the arm were made to fail OPEN. Proven disjoint — `CANNOT be established` appears in no other text this policy emits",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/forms/editor/bound-fields/use-bound-field.ts": "export declare const useBoundField: <T>() => T;\n",
        "packages/client/src/forms/editor/bound-fields/x-field.tsx":
          'import { useBoundField } from "./use-bound-field.ts";\nexport const f = (): unknown => useBoundField<string>();\n',
      },
      why: "the fix: a bound field on the hook imports `useBoundField` and never the raw context",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/forms/editor/bound-fields/other-field.tsx":
          'import { useFieldContext } from "./local-context.ts";\nexport const f = (): unknown => useFieldContext<string>();\n',
        "packages/client/src/forms/editor/bound-fields/local-context.ts": "export function useFieldContext<T>(): T {\n  return null as T;\n}\n",
      },
      why: "THE COUNTERFACTUAL: the SAME NAME exported by a different module is a different symbol — the legacy specifier-name match red this, and only the canonical declaring file separates the two",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/forms/editor/use-app-form.ts":
          'import { useFieldContext } from "./contexts.ts";\nexport const f = (): unknown => useFieldContext<string>();\n',
      },
      why: "THE SCOPE COUNTERFACTUAL: the identical read in the form TOOLKIT (outside bound-fields/) is out of subject — G28 seals the bound-field family, and `no-direct-useform` owns the toolkit's own door",
    },
    {
      mode: "types",
      files: {
        ...HOME_PROOF,
        "packages/client/src/forms/editor/bound-fields/local-shadow.tsx":
          "function useFieldContext<T>(): T {\n  return null as T;\n}\nexport const f = (): unknown => useFieldContext<string>();\n",
      },
      why: "A LOCAL FUNCTION of the same name proves a DIFFERENT identity (case (a) of the refusal classifier) — a bound field that declares its own helper is not reaching the toolkit's context",
    },
  ],
});
