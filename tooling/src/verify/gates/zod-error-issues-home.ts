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
//
// THREE ANSWERS, AND THE THIRD IS FAIL-CLOSED (§5b.1, #2194 — the #1990 dead-arm shape, fixed). An `issues`
// read whose ORIGIN the shared readers place in zod is a finding; one they place anywhere else is out of
// subject; one they cannot place AT ALL — an opaque receiver resolves no property symbol — is REPORTED under
// its own `UNREADABLE` text, because the spelling alone is not the identity and a read that cannot be
// established must not pass silently. Until #2194 the constant below was declared and handed to the shared
// reporter while NO candidate ever carried `unreadable: true`: the message was unreachable by any row and by
// any tree, i.e. advertised prose over unreached code. `classifyIssuesRead` is the reachable arm and
// `mustFlag[4]`'s `messageIncludes` is the only row that can tell it apart from the ordinary verdict — both
// arms emit exactly ONE finding, so a bare `{ count: 1 }` would pass whether the arm fires or is dead.
//
// BOTH ARMS NOW ASK A SHARED READER (#2097, closed here with #2194's second half): the member arm through
// `resolveTypeMemberOrigin` and the destructure arm through `resolveTypePropertyOrigin` — the binding-pattern
// twin added to `lib/type-member-origin.ts` in the same commit, because a `BindingElement` has no
// member-access node to hand over and this module was finishing `type.getProperty(name)?.getDeclarations()`
// itself. The audit row that named the site (`policing-surface-audit-2026-09-12.md`) is closed with it.
//
// DECLARED LIMIT, unchanged by that repair: a destructure with no VariableDeclaration initializer (a
// PARAMETER pattern, `function f({ issues })`) is not a candidate at all — there is no receiver expression
// to take a type from, so the policy has no identity question to answer and never had. It is the binding's
// annotated type that would have to be read, which is a different reader and a different arm.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { declaredByPackage, resolveTypeMemberOrigin, resolveTypePropertyOrigin } from "../lib/type-member-origin.ts";

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

/** The three answers about one `issues`-SPELLED read: zod's own member · a proven different home · a home
 *  the readers could not place. `null` is "not even a candidate" — the spelling prefilter said no. */
type IssuesVerdict = "zod" | "other" | "unreadable";

/** Resolve declarations to a verdict: zod's, someone else's, or unplaceable. */
function homeVerdict(declarations: readonly MorphNode[]): IssuesVerdict {
  if (declarations.length === 0) {
    return "unreadable";
  }
  return declaredByPackage(declarations, ZOD_PACKAGE) ? "zod" : "other";
}

/** `parsed.error.issues`, `failure["issues"]`, `err?.issues` — one member read spelled `issues`. */
function classifyIssuesMemberRead(node: MorphNode): IssuesVerdict | null {
  const member = readMemberReference(node);
  if (member.kind !== "resolved" || member.value.name !== ISSUES) {
    return null;
  }
  const origin = resolveTypeMemberOrigin(node);
  return origin.kind === "resolved" ? homeVerdict(origin.value.declarations) : "unreadable";
}

/** `const { issues } = result.error` — the binding-pattern spelling of the same read. */
function classifyIssuesDestructure(node: MorphNode): IssuesVerdict | null {
  if (!Node.isBindingElement(node)) {
    return null;
  }
  const property = node.getPropertyNameNode()?.getText() ?? node.getName();
  if (property !== ISSUES) {
    return null;
  }
  // No initializer ⇒ no receiver expression ⇒ not a candidate (the declared limit in the header), never an
  // unreadable finding: this arm has no identity question to answer for a parameter pattern.
  const initializer = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
  if (initializer === undefined) {
    return null;
  }
  // THROUGH THE SHARED READER, not a chain finished here (#2097 / #2194's second half): the binding-pattern
  // twin of `resolveTypeMemberOrigin`, so this arm asks the same door the member arm asks and the "no
  // property symbol" and "no declaration" cases arrive already classified as unresolved.
  const origin = resolveTypePropertyOrigin(initializer, ISSUES);
  return origin.kind === "resolved" ? homeVerdict(origin.value) : "unreadable";
}

/** One node, one answer, both spellings. */
function classifyIssuesRead(node: MorphNode): IssuesVerdict | null {
  return classifyIssuesMemberRead(node) ?? classifyIssuesDestructure(node);
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
            const verdict = classifyIssuesRead(node);
            if (verdict === null || verdict === "other") {
              return;
            }
            candidates.push({
              node,
              subject: ctx.relativePath(sourceFile),
              operation: OPERATION,
              unreadable: verdict === "unreadable",
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
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n}\n",
        "packages/contracts/src/opaque.ts":
          'declare function parseSomehow(): any;\nexport function refuse(): string {\n  return parseSomehow().error.issues.map((issue: { message: string }) => issue.message).join("; ");\n}\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (§5b.1, #2194), reached by no row and by no tree before it: an OPAQUE receiver resolves NO property symbol, so `resolveTypeMemberOrigin` refuses and the read is REPORTED under the UNREADABLE text rather than passed. The `messageIncludes` is the whole row — the unreadable arm emits exactly ONE finding, the same as the ordinary verdict, so a bare `count: 1` would pass whether the arm fires or is unreachable, which is precisely how the declared message sat dead here",
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
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n}\n",
        "packages/contracts/src/anchor.ts": "export const use = (): number => 1;\n",
        "tooling/src/verify/ops/render.ts":
          'import type { ZodError } from "zod";\nexport function summarize(parsed: { error: ZodError }): string {\n  return parsed.error.issues.map((issue) => issue.message).join("; ");\n}\n',
      },
      why: 'THE POPULATION FENCE (`population: "@packages"`), which nothing exercised: the SAME zod-declared `issues` read the founding `mustFlag` reports, written in `tooling/` — the instrument tree, which is above the package cake and is not what the legacy `scanRoot` admitted either. Widen the root and this row flags. The clean `packages/contracts` file is the in-population ANCHOR: a falsifier holding only the out-of-population file admits zero paths and comes back a `[population]` TOOL ERROR',
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n  readonly message: string;\n}\n",
        "packages/contracts/src/other-member.ts":
          'import type { ZodError } from "zod";\nexport function summarize(parsed: { error: ZodError }): string {\n  return parsed.error.message;\n}\n',
      },
      why: "THE MEMBER-NAME CLAUSE of `classifyIssuesMemberRead` (`member.value.name === ISSUES`), the converse of the two counterfactuals above and the half neither reaches: this read IS declared by the installed zod package, so `homeVerdict` through `declaredByPackage` says zod — only the NAME test rejects it. Reading `ZodError.message` is not the path-losing `issues` join this law is about. Cut the name test and this row flags",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts":
          "export interface ZodError {\n  readonly issues: readonly { readonly path: readonly string[]; readonly message: string }[];\n  readonly message: string;\n}\n",
        "packages/contracts/src/destructure-other.ts":
          'import type { ZodError } from "zod";\nexport function summarize(parsed: { error: ZodError }): string {\n  const failure = parsed.error;\n  const { message } = failure;\n  return message;\n}\n',
      },
      why: "the destructured twin of the clause above (`property !== ISSUES` in `classifyIssuesDestructure`), which is a SEPARATE test in a separate function: the binding resolves to a zod-declared member, so `declaredByPackage` says yes, and only the property-name comparison rejects it. Cut that comparison and this row flags — the member-read cut beside it leaves this row green, so the two clauses are pinned by disjoint rows",
    },
  ],
});
