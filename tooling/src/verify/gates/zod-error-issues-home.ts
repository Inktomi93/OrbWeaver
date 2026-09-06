// Policy: zod-error-issues-home (docs/history/reviews/stickler/2026-08-02-zod-leverage-audit.md §F4) — a
// USER-facing refusal renders through `z.prettifyError`, which carries the PATH. Hand-flattening a
// `ZodError`'s `issues` drops it: the old `issues[0]?.message` printed "Too small: expected string to have
// >=1 characters" and named no field, so an operator importing a 500-section preset got a refusal that
// pointed at nothing.
//
// AUTHORITY IS reviewed-grant, split out of `zod-modern-spellings` because its exceptions are not
// occurrence slips. The survivors are MODEL-facing `path.join(".") + ": " + message` joins (a model reads
// them back against its own arg schema, and prettify's human layout is the wrong shape for that wire) and
// STRUCTURAL re-emits that forward each inner issue into an outer parse with its path intact (prettify
// returns a STRING and would collapse the array into one opaque message). Each is a standing repository
// PERMISSION and therefore an exact `(subject, operation)` row in `lib/reviewed-grants.ts` with `why` and
// `endsWhen`; a home that stops making the read reds at its dead row, which is the two-sided ratchet the
// legacy `ISSUES_ALLOWLIST` + `finalize` pair was hand-rolling.
//
// THE ONE LEGACY MARKER BECAME A ROW. `packages/contracts/src/versioned-config/index.ts` carried a
// permanent `@orb-gate-ignore zod-modern-spellings(error-issues)` whose stated reason — the #1592 import
// refusal needs the PATH to name the offending field — is a standing state of the contract, not a slip. A
// reviewed-grant policy has no inline door, so the marker is DELETED and the permission is its row.
//
// IDENTITY, NOT SPELLING, and this is a genuine widening. Legacy asked whether the RECEIVER was spelled
// `error` (or a one-hop alias of something spelled `error`), so `const failure: ZodError = …;
// failure.issues` was invisible while any project object with an `error.issues` shape matched. The subject
// is now the `issues` property DECLARED BY THE INSTALLED ZOD PACKAGE, read off the receiver's type, so every
// binding of a real `ZodError` is judged and nothing else is.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { declaredByPackage, resolveTypeMemberOrigin } from "../lib/type-member-origin.ts";

const ISSUES = "issues";
const ZOD_PACKAGE = "zod";
const OPERATION = "error-issues-read";

const MESSAGE =
  "a hand-flattened zod `issues` read on a user-facing refusal — `z.prettifyError(result.error)` carries " +
  'the PATH that names the offending field, which `issues[0].message` drops (F4: it printed "Too small: ' +
  'expected string to have >=1 characters" and named no field). A genuinely MODEL-facing `path: message` ' +
  "join, or a structural write-guard re-emit that forwards issues with their paths, takes an exact " +
  "reviewed grant instead.";
const UNREADABLE =
  "this reference is spelled like a zod `issues` read but the shared readers cannot place the property's declaration, so whether it flattens a ZodError CANNOT be established. Reported rather than passed.";
const FIX =
  "render user-facing refusals with `z.prettifyError(result.error)` (see packages/contracts/src/preset/index.ts `parsePresetFile`); a model-facing join or a structural re-emit takes an exact reviewed grant with its reason.";

/** The MODEL-facing `path: message` join the sanctioned homes write, spelled by concatenation exactly as
 *  `tool-use/verbs/register.ts` could write it — the CONVENTION is what the row exercises, not the
 *  interpolation, and a template here would only mean a placeholder suppression in this module's source. */
const MODEL_FACING_JOIN =
  'import type { ZodError } from "zod";\n' +
  "export function refuse(parsed: { error: ZodError }): string {\n" +
  '  return parsed.error.issues.map((issue) => issue.path.join(".") + ": " + issue.message).join("; ");\n' +
  "}\n";

/** Is this property symbol the `issues` member declared by the installed zod package? */
function isZodIssuesProperty(node: MorphNode): boolean {
  const origin = resolveTypeMemberOrigin(node);
  return origin.kind === "resolved" && declaredByPackage(origin.value.declarations, ZOD_PACKAGE);
}

/** `parsed.error.issues`, `failure["issues"]`, `err?.issues` — one member read of a real ZodError. */
function isIssuesMemberRead(node: MorphNode): boolean {
  const member = readMemberReference(node);
  return member.kind === "resolved" && member.value.name === ISSUES && isZodIssuesProperty(node);
}

/** `const { issues } = result.error` — the binding-pattern spelling of the same read. */
function isIssuesDestructure(node: MorphNode): boolean {
  if (!Node.isBindingElement(node)) {
    return false;
  }
  const property = node.getPropertyNameNode()?.getText() ?? node.getName();
  if (property !== ISSUES) {
    return false;
  }
  const initializer = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
  const symbol = initializer?.getType().getNonNullableType().getProperty(ISSUES);
  const declarations = symbol?.getDeclarations() ?? [];
  return declarations.length > 0 && declaredByPackage(declarations, ZOD_PACKAGE);
}

export const gate = defineGate({
  id: "zod-error-issues-home",
  family: "zod-modern-spellings",
  authority: "reviewed-grant",
  severity: "error",
  // `packages/**` only, exactly as legacy scanned. The sanctioned join sites are SCANNED, never scoped out:
  // the only exemption is a cited row, so a moved or renamed home reds instead of carrying its sanction.
  population: "@packages",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression, SyntaxKind.BindingElement],
          visit: (node, sourceFile): void => {
            const reads = isIssuesMemberRead(node) || isIssuesDestructure(node);
            if (!reads) {
              return;
            }
            candidates.push({
              node,
              subject: ctx.relativePath(sourceFile),
              operation: OPERATION,
              token: ISSUES,
              offset: Math.max(node.getText().lastIndexOf(ISSUES), 0),
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
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n}\n",
        "packages/contracts/src/x.ts":
          'import type { ZodError } from "zod";\nexport function refuse(parsed: { error: ZodError }): string {\n  return parsed.error.issues.map((issue) => issue.message).join("; ");\n}\n',
      },
      expect: { count: 1, token: ISSUES },
      why: "the founding shape — a user-facing refusal flattened out of `issues`, dropping the path that names the field",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n}\n",
        "packages/contracts/src/x.ts":
          'import type { ZodError } from "zod";\nexport function refuse(parsed: { error: ZodError }): string {\n  const failure = parsed.error;\n  const { issues } = failure;\n  return issues.map((issue) => issue.message).join("; ");\n}\n',
      },
      expect: { count: 1, token: ISSUES },
      why: "the DESTRUCTURED spelling through a one-hop alias — the shape the legacy behaviour pin in tests/tooling asserted, kept as a proof row now that the pin's runtime is gone",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n}\n",
        "packages/contracts/src/x.ts":
          'import type { ZodError } from "zod";\nexport function refuse(failure: ZodError): string {\n  return failure["issues"].map((issue) => issue.message).join("; ");\n}\n',
      },
      expect: { count: 1, token: ISSUES },
      why: "THE WIDENING THIS CONVERSION BUYS: a `ZodError` bound under a name that is not `error`, read through a COMPUTED member. The legacy reader asked whether the receiver was spelled `error`, so this whole class was invisible",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n}\n",
        "packages/server/src/domain/tool-use/verbs/register.ts": MODEL_FACING_JOIN,
      },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: a sanctioned model-facing join reds like any other read and is licensed by its exact grant row, so a SECOND read in that file — or a new join beside it — is a finding until someone reviews it",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n}\nexport declare function prettifyError(error: ZodError): string;\n",
        "packages/contracts/src/x.ts":
          'import type { ZodError } from "zod";\nimport { prettifyError } from "zod";\nexport function refuse(parsed: { error: ZodError }): string {\n  return prettifyError(parsed.error);\n}\n',
      },
      why: "the fix: the refusal is rendered by `z.prettifyError`, which carries the path",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n}\n",
        "packages/contracts/src/own.ts":
          'export interface ParseOutcome {\n  readonly issues: readonly string[];\n}\nexport function summarize(first: ParseOutcome): string {\n  return first.issues.join("; ");\n}\n',
      },
      why: "THE COUNTERFACTUAL: OUR OWN `issues` field on a project shape. The member name is identical; the declaration is a project interface rather than the zod package, so it is a different identity and always was out of subject",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n}\n",
        "packages/contracts/src/destructure-own.ts":
          'export function summarize(first: { issues: readonly string[] }): string {\n  const failure = first;\n  const { issues } = failure;\n  return issues.join("; ");\n}\n',
      },
      why: "the destructured twin of that counterfactual — a non-zod `issues` binding, which the legacy alias-following reader also had to exclude by hand",
    },
  ],
});
