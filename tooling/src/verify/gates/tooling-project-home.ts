// Policy: tooling-project-home (docs/architecture/core/Core-Tooling-Law.md §4.4, arm A of the retired
// `tooling-shared-plumbing`) — the shared WORKSPACE is loaded ONCE, by `_shared/ts-workspace.ts#getWorkspace`;
// a second `new Project(` under `tooling/src/**` is a second loader unless it is a reviewed NON-workspace
// construction (a scratch parser over one string, the installed `.d.ts` surface, a proof mini-project).
// Comment posture: comment-SAFE (node kinds only).
//
// AUTHORITY IS reviewed-grant (docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments", #1950 group 4): the legacy carried TWO exemption tables — the
// `HOMES` row for the loader and the seven-row `PROJECT_SITES` census — and both are recurring repository
// PERMISSIONS with a stated end condition, which is the reviewed-grant shape. They are exact
// `(subject, ts-morph-project-construction)` rows in `lib/reviewed-grants.ts`, and the legacy two-sided stale
// sweep IS central grant liveness (a row consumed zero times after a complete run is STALE, whether its file
// stopped constructing or is gone). NEW EVIDENCE at conversion: `verify/ops/policy-conformance.ts` constructs
// THREE Projects the legacy census never listed — its rows red on the live tree under the legacy gate itself
// (12 findings hidden beneath the baseline red) — and takes the ninth grant, worded for what it loads.
//
// IDENTITY, NOT SPELLING: the legacy compared the constructor's TEXT to `Project`, so a local class of that
// name red (mustPass[0]) and an aliased import passed (mustFlag[1]). The subject is now ts-morph's OWN
// `Project` export, judged through `lib/project-home-origin.ts#readPackageExportOrigin` — the installed
// declaration on a real tree, the authored package door in a proof workspace — and a constructor the readers
// cannot place is reported fail-closed under the disjoint UNREADABLE text (mustFlag[4]). FAMILY: a SINGLETON
// under its own id — the one-loader rule has no sibling reading the ts-morph door.
//
// THE REPORTED POSITION is `new <callee>` as written; grant granularity is one finding per (file, operation)
// however many constructions the file carries (mustFlag[3]). `entire-population` because grant liveness is
// only sound after a complete run; a narrowed request DEFERS this policy (pinned in
// tests/tooling/verify/gates/tooling-plumbing-family.test.ts). POPULATION PORT: byte-identical — the legacy
// fenced arms A–H to `tooling/src/` inside `visit`, which is `@tooling`.
//
// Legacy descriptor: `2c1a1d37c` (`tooling/src/verify/gates/tooling-shared-plumbing.ts`, arm A + HOMES +
// PROJECT_SITES). No private marker grammar; zero live `@orb-gate-ignore tooling-shared-plumbing` markers at
// conversion (rg over packages/, tests/, tooling/, scripts/), so no translation was owed.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readPackageExportOrigin } from "../lib/project-home-origin.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const TS_MORPH: readonly string[] = ["ts-morph"];
const PROJECT = "Project";
const PROJECT_EXPORT: ReadonlySet<string> = new Set([PROJECT]);
const OPERATION = "ts-morph-project-construction";

const MESSAGE =
  "a second ts-morph loader — the shared workspace is loaded ONCE by `getWorkspace()` (_shared/ts-workspace.ts), and a `new Project(` anywhere else is either a duplicate walk of the whole tree (the class the tooling package was minted to end, docs/architecture/core/Core-Tooling-Law.md §2.4/§4.4) or a NON-workspace construction that needs a reviewed grant naming what it loads and what ends it.";
const UNREADABLE =
  "a construction spelled like ts-morph's `Project` whose callee the shared readers cannot place, so whether it is the ts-morph loader CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";
const FIX =
  "call `getWorkspace()` from _shared/ts-workspace.ts (types: true when a checker is needed) instead of constructing a Project; a genuinely non-workspace parser (an in-memory scratch over one string, a proof mini-project) takes an exact reviewed grant `(file, ts-morph-project-construction)` in lib/reviewed-grants.ts with its end condition.";

/** The constructor's spelled name — the identifier, or the member name of `ns.Project` — so only a
 *  callee that LOOKS like the door is ever carried to the identity readers (fail-closure stays honest). */
function constructorName(expression: Node): string | undefined {
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  const member = readMemberReference(expression);
  return member.kind === "resolved" ? member.value.name : undefined;
}

export const gate = defineGate({
  id: "tooling-project-home",
  family: "tooling-project-home",
  authority: "reviewed-grant",
  severity: "error",
  population: "@tooling",
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
          kinds: [SyntaxKind.NewExpression],
          visit: (node, sourceFile) => {
            if (!Node.isNewExpression(node)) {
              return;
            }
            const expression = node.getExpression();
            const { verdict } = readPackageExportOrigin(expression, TS_MORPH, PROJECT_EXPORT);
            if (verdict === "other" || (verdict === "unreadable" && constructorName(expression) !== PROJECT)) {
              return;
            }
            candidates.push({
              node,
              subject: ctx.relativePath(sourceFile),
              operation: OPERATION,
              // `new <callee>` exactly as written: from the construct's start to the callee's end.
              token: node.getText().slice(0, expression.getEnd() - node.getStart()),
              offset: 0,
              ...(verdict === "unreadable" ? { unreadable: true } : {}),
            });
          },
        },
      ],
      evaluate: () => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "tooling/src/ast/ops/load.ts", operation: "ts-morph-project-construction" },
      files: { "tooling/src/ast/ops/load.ts": 'import { Project } from "ts-morph";\nexport const p = new Project({});\n' },
      expect: { count: 1, token: "new Project", messageIncludes: "a second ts-morph loader" },
      why: "the founding shape — a second ts-morph loader, the fourth `new Project(` site the one-loader rule exists to prevent. `messageIncludes` names the PRECISE text, which the unreadable arm never emits, so this row proves the package door resolved rather than fail-closed",
    },
    {
      mode: "types",
      files: {
        "tooling/src/ast/ops/scratch.ts": 'import { Project as Scratch } from "ts-morph";\nexport const p = new Scratch({ useInMemoryFileSystem: true });\n',
      },
      expect: { count: 1, token: "new Scratch", messageIncludes: "a second ts-morph loader" },
      why: 'AN IMPORT ALIAS constructs the same class — the callee resolves to ts-morph\'s export whatever it was spelled as. The legacy text comparison (`=== "Project"`) passed this construction',
    },
    {
      mode: "types",
      files: {
        "tooling/src/verify/lib/comment-spans.ts":
          'import { Project } from "ts-morph";\nexport const scratch = new Project({ useInMemoryFileSystem: true });\n',
      },
      expect: { count: 1, messageIncludes: "Subject: tooling/src/verify/lib/comment-spans.ts, operation: ts-morph-project-construction" },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: a censused non-workspace parser reds like any other construction and is licensed by its exact grant row (`tooling-project-home:comment-spans`), so a new scratch parser is a finding until someone reviews it. The family test proves this real central grant consumes the identity; module witnesses independently prove the synthetic exact-grant door",
    },
    {
      mode: "types",
      files: {
        "tooling/src/verify/ops/twice.ts":
          'import { Project } from "ts-morph";\nexport const a = new Project({});\nexport const b = new Project({ useInMemoryFileSystem: true });\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two constructions in one file are ONE `(subject, operation)` finding, because a reviewed grant licenses one identity and two matching findings would make the row OVER-BROAD and license neither (comment-spans.ts carries three, policy-conformance.ts three)",
    },
    {
      mode: "types",
      files: {
        "tooling/src/ast/ops/written.ts":
          'import { Project as Loaded } from "ts-morph";\nlet Project = Loaded;\nProject = Loaded;\nexport const p = new Project({});\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944): a WRITTEN binding named `Project` might still hold the class, so the readers refuse it as ambiguous and the policy reports under the disjoint UNREADABLE text instead of passing. The spelled name gates only this fail-closed answer — an unplaceable callee spelled like nothing in this family stays silent, or every unplaceable construction in the tree would be a finding",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "tooling/src/snap/ops/local.ts": "class Project {\n  constructor(o: object) {\n    void o;\n  }\n}\nexport const p = new Project({});\n" },
      why: 'THE IDENTITY COUNTERFACTUAL: a LOCAL class named `Project` is provably a different declaration, not the loader. The legacy `getText() === "Project"` comparison red it (its own check-gates fixture planted `declare const Project` for exactly that reason); the readers refuse it as a proven non-module binding, which is `other`',
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/lib/project.ts": "export class Project {\n  constructor(o: object) {\n    void o;\n  }\n}\n",
        "tooling/src/snap/ops/door.ts": 'import { Project } from "../lib/project.ts";\nexport const p = new Project({});\n',
      },
      why: "THE DOOR COMPARISON, pinned: a class NAMED `Project` imported from a project module enters a different door than the ts-morph package. Replacing the package comparison with a bare name match reds this row",
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/other.ts": "export const m = new Map<string, number>();\nexport const d = new Date(0);\n" },
      why: "comment posture and the prefilter: constructions of anything but ts-morph's `Project` are never carried to the identity readers, so an unrelated `new` — including one the readers could not place — is silent",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/lib/clean.ts": "export const clean = true;\n",
        "scripts/probes/some-probe.ts": 'import { Project } from "ts-morph";\nexport const p = new Project({});\n',
      },
      why: "THE DECLARED LIMIT (#1118): the research zone is outside the population BY DERIVATION, not by a grant — a probe PROMOTED into tooling/src/<tool>/ is judged from its first day there. The clean tooling file keeps the fixture admitted (a fixture that admits nothing is a population tool error)",
    },
  ],
});
