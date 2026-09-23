// Policy: tooling-artifact-path-home (docs/law/Core-Tooling-Law.md §4.4, arm C of the retired
// `tooling-shared-plumbing`) — the `reports/…` artifact root is spelled in ONE home, `_shared/artifacts.ts`
// (`reportsPath`/`reportsRelPath`/`ensureReportsDir`); a `"reports"`/`"reports/…"` literal fed to a path call
// (`join`/`resolve`/`mkdir`/`mkdirSync`) anywhere else under `tooling/src/**` is the artifact-dir respell — a
// second answer to "where do runs live", outside the run-slot layout (#1029/#1164). Comment posture:
// comment-SAFE (node kinds + a statically-read string).
//
// AUTHORITY IS reviewed-grant (#1950 group 4): the legacy `HOMES` row for artifacts.ts is a
// recurring repository PERMISSION — one exact row, `(artifacts.ts, reports-path-literal)`; the legacy stale
// sweep is central grant liveness. FAMILY `tooling-artifact` — the shared reader is `lib/artifact-filing.ts`
// (`reportsPathArgument` + `classifyPathCallee`), shared with `tooling-artifact-run-slot`, the other half of
// the artifact law.
//
// IDENTITY, NOT SPELLING — and the conversion's own finding. The legacy matched the callee's TEXT against
// `join`/`resolve`/`mkdir`/`mkdirSync` as a bare IDENTIFIER, so `path.join(REPO_ROOT, "reports", "ab", stamp)`
// (`tooling/src/model-ab/ops/run.ts:110`, live since the tool was minted) was never seen. The callee is now
// judged by where it RESOLVES — node's own path/fs doors through `_shared/reference-fact-call.ts` — so the
// default-import, namespace and named spellings are one read (mustFlag[1]); a project-declared `join` is
// provably a different callee (mustPass[2]); a callee the readers cannot place is reported fail-closed under
// the disjoint UNREADABLE text (mustFlag[6]). The literal is read STATICALLY (`readStaticString`), so a const
// holding `"reports"` one line up is the same respell (mustFlag[4]) — a widening over the legacy literal-only
// read, in the guide's flag-MORE direction. That site is FIXED in the conversion commit (orchestrator ruling
// 2026-09-12: a grant would RATIFY the drift; `_shared/artifacts.ts` is the one home). The identity runs FIRST
// and the spelled name gates only the fail-closed answer, so an aliased `join as j` is one read (mustFlag[2])
// and an unplaceable callee spelled like nothing path-shaped stays silent.
//
// THE REPORTED POSITION is the literal (or the const) as written, inside the call. `entire-population`
// because grant liveness is only sound after a complete run; a narrowed request DEFERS this policy (pinned in
// tests/tooling/verify/gates/tooling-plumbing-family.suite.test.ts). POPULATION PORT: byte-identical (`@tooling`).
//
// Legacy descriptor: `2c1a1d37c` (`tooling/src/verify/gates/tooling-shared-plumbing.ts`, arm C). No private
// marker grammar; zero live `@orb-gate-ignore tooling-shared-plumbing` markers at conversion.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyPathCallee, reportsPathArgument } from "../lib/artifact-filing.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const OPERATION = "reports-path-literal";

const MESSAGE =
  'a hand-rolled reports/<kind> path — the artifact root is spelled ONCE, in _shared/artifacts.ts (`reportsPath`/`reportsRelPath`/`ensureReportsDir`), and a `"reports"`/`"reports/…"` literal fed to a path call anywhere else is a second answer to "where do runs live" that the run-slot layout (#1029/#1164) never sees (docs/law/Core-Tooling-Law.md §4.4; UNIFIED-VERIFICATION-DESIGN.md §3.3b).';
const UNREADABLE =
  'a `"reports"` literal fed to a call spelled like a path/fs door whose callee the shared readers cannot place, so whether it builds an artifact path CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the binding a readable import origin; the three-answer rule is tooling/src/verify/lib/origin-verdict.ts (#944).';
const FIX =
  "build the path with `reportsPath(root, …)` / `ensureReportsDir(root, …)` from _shared/artifacts.ts, or file the artifact through `artifactFile`/`artifactDir` (_shared/artifact-out.ts) so it lands in the run slot; the home itself carries the exact reviewed grant `(artifacts.ts, reports-path-literal)`.";

export const gate = defineGate({
  id: "tooling-artifact-path-home",
  family: "tooling-artifact",
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
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (!node.isKind(SyntaxKind.CallExpression)) {
              return;
            }
            const literal = reportsPathArgument(node);
            if (literal === null) {
              return;
            }
            const verdict = classifyPathCallee(node);
            if (verdict === "other") {
              return;
            }
            candidates.push({
              node: literal,
              subject: ctx.relativePath(sourceFile),
              operation: OPERATION,
              token: literal.getText(),
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
      grant: { subject: "tooling/src/snap/ops/out.ts", operation: "reports-path-literal" },
      files: { "tooling/src/snap/ops/out.ts": 'import { join } from "node:path";\nexport const d = join("/root", "reports", "snaps");\n' },
      expect: { count: 1, token: '"reports"', messageIncludes: "a hand-rolled reports/<kind> path" },
      why: "the founding shape — a hand-rolled reports/<kind> path outside _shared/artifacts.ts, the artifact-dir respell (arm C). `messageIncludes` names the PRECISE text, which the unreadable arm never emits, so this row proves the path door resolved rather than fail-closed",
    },
    {
      mode: "types",
      files: { "tooling/src/model-ab/ops/run.ts": 'import path from "node:path";\nexport const outDir = path.join("/root", "reports", "ab", "stamp");\n' },
      expect: { count: 1, token: '"reports"', messageIncludes: "a hand-rolled reports/<kind> path" },
      why: "THE CONVERSION'S OWN FINDING: the default-import spelling `path.join(…, \"reports\", …)` — live at model-ab/ops/run.ts:110 for the tool's whole life and never seen by the legacy identifier-only callee match. The callee resolves to node's path door whatever it was spelled through",
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/alias.ts": 'import { join as j } from "node:path";\nexport const d = j("/root", "reports", "snaps");\n' },
      expect: { count: 1, token: '"reports"', messageIncludes: "a hand-rolled reports/<kind> path" },
      why: "AN IMPORT ALIAS of the path door — the callee resolves to `node:path`'s `join` whatever it was spelled as, which a name-first prefilter would have passed; the identity runs first and the name gates only the fail-closed answer",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/dir.ts": 'import { mkdirSync } from "node:fs";\nmkdirSync("reports/snaps", { recursive: true });\nexport const made = true;\n',
      },
      expect: { count: 1, token: '"reports/snaps"' },
      why: "the fs door: a `mkdirSync` fed a `reports/…` literal creates the artifact dir outside the run slot — the legacy's fourth callee, now judged by identity against `node:fs`",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/const.ts":
          'import { resolve } from "node:path";\nconst REPORTS = "reports";\nexport const d = resolve("/root", REPORTS, "snaps");\n',
      },
      expect: { count: 1, token: "REPORTS" },
      why: "FLAG-MORE (guide §6.1 direction): the literal moved ONE LINE UP into a const is the same respell — the argument is read statically, where the legacy read only a bare StringLiteral argument. The reported position is the const as written in the call",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/artifacts.ts":
          'import { join } from "node:path";\nexport function reportsPath(root: string, ...segments: readonly string[]): string {\n  return join(root, "reports", ...segments);\n}\n',
      },
      expect: { count: 1, messageIncludes: "Subject: tooling/src/_shared/artifacts.ts, operation: reports-path-literal" },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the home reds like any other site and is licensed by its exact grant row (`tooling-artifact-path-home:artifacts`). The family test proves this real central grant consumes the identity; module witnesses independently prove the synthetic exact-grant door",
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/missing.ts": 'import { join } from "./missing.ts";\nexport const d = join("/root", "reports");\n' },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "FAIL-CLOSED (#944): a path-spelled callee whose import door does not resolve is no PROVEN non-door — the literal is reported under the disjoint UNREADABLE text rather than silently admitted on the strength of a spelling",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "tooling/src/snap/ops/help.ts": 'export const help = "artifacts land under reports/snaps/";\n' },
      why: "the literal in PROSE (not a path-call argument) — help text must not trip the respell arm; there is no call to judge",
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/other.ts": 'import { join } from "node:path";\nexport const d = join("/root", "report-cards", "snaps");\n' },
      why: "the literal fence: `report-cards` is not `reports` and not `reports/…` — the value is compared whole, never by prefix on the bare word",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/lib/join.ts": 'export function join(...parts: readonly string[]): string {\n  return parts.join("/");\n}\n',
        "tooling/src/snap/ops/local.ts": 'import { join } from "../lib/join.ts";\nexport const d = join("reports", "snaps");\n',
      },
      why: "THE DOOR COMPARISON, pinned: a function NAMED `join` declared in a project module is a different callee than node's path door — the name prefilter admits it, the identity refuses it. Replacing the door comparison with a bare name match reds this row",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/artifacts.ts":
          'export function reportsPath(root: string, ...segments: readonly string[]): string {\n  return [root, segments.join("/")].join("/");\n}\n',
        "tooling/src/snap/ops/sanctioned.ts": 'import { reportsPath } from "../../_shared/artifacts.ts";\nexport const d = reportsPath("/root", "snaps");\n',
      },
      why: 'the sanctioned shape — the artifact root comes from the home and the caller spells only its kind; `reportsPath` is not a path-door callee and `"snaps"` is not the literal',
    },
  ],
});
