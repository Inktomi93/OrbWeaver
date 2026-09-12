// Policy: tooling-clock-budget (docs/architecture/core/Core-Tooling-Law.md §4.4, the TREE half of arm J of
// the retired `tooling-shared-plumbing`; docs/design/1208-instrument-substrate.md §7.1, #1232) — every WALL
// CLOCK is derived from the ONE load-budget policy (`_shared/load-budget.ts#budget`): a numeric literal fed to
// a `timeout`/`timeoutMs`/`testTimeout`/`hookTimeout`/`actionTimeout`/`navigationTimeout` option, a
// `*_TIMEOUT_MS`/`*TimeoutMs` const with a bare numeric initializer, or a `setTimeout(fn, N)` at ceiling
// scale, anywhere under `tooling/src/**` or `tests/tooling/**`, is a budget written for a quiet box that reads
// as a false RED on a contended one. Comment posture: comment-SAFE (node kinds + a numeric literal).
//
// AUTHORITY IS ordinary (guide §12.6, #1950 group 4) — the ONE ordinary policy of the plumbing split, and
// the reason is in the legacy table it retires: `CLOCK_SITES` was declared SHRINK-ONLY ("a new fixed clock
// is RED, never a new row") and each of its reasons was a PER-SITE argument (the tool guard's `timeout` is
// its INPUT UNDER TEST; a planted-hang kill whose assertion IS the timeout). That is the shape of a reasoned
// per-occurrence waiver, not of a recurring repository permission, and a grant table would invite exactly
// the rows the census forbade. The live tool-guard row is translated to `@orb-waive tooling-clock-budget(<literal>)`
// at its site; the `structure.int.test.ts` row was STALE on the live tree (the 4 s kill literal it cited is
// gone) and dies with the table. Twelve legacy findings were hidden beneath the baseline red at conversion —
// eight fixed clocks drifted in after the census closed — and every one is routed through `budget` /
// `scaledBudget` in the conversion commit; the policy lands green over a fixed tree.
//
// FAMILY `plumbing-literals` — the shared reader is `lib/plumbing-literals.ts#fixedClockOf`, shared with
// `tooling-runner-config-literals` (the same predicate over the root runner configs, the arm's ROOT half).
// SYNTAX analysis: the three shapes are a literal and the NAME of its position; the `setTimeout` callee is
// matched by SPELLING — the reader's one declared limit (a local `setTimeout` shadow is not a wall clock and
// its false positive is waivable). THE ARM JUDGES SPELLING, NOT DATA FLOW, as the legacy did: a BASE const
// handed straight to a `timeout` option without `budget()` passes — the cheap half is enforced, the
// expensive half is the reviewer's.
//
// THE REPORTED POSITION is the NUMERIC LITERAL (`30_000`), never the legacy composite `setTimeout(…, 30_000)`
// or `timeout: 30_000` — a composite contains parens/colons and cannot be named by the marker grammar; the
// literal can. `selected-files`: every verdict is per-node, so a narrowed request judges exactly the files
// it names. POPULATION PORT: byte-identical — the legacy fenced arm J to `tooling/src/` + `tests/tooling/`
// inside `visit`; `tests/e2e/support/**` was never this arm's (its clocks are e2e boot budgets, #1232's
// territory — mustPass[4]).
//
// Legacy descriptor: `2c1a1d37c` (`tooling/src/verify/gates/tooling-shared-plumbing.ts`, arm J, tree half).
// No private marker grammar; zero live `@orb-gate-ignore tooling-shared-plumbing` markers at conversion; the
// one live CLOCK_SITES row (`tests/tooling/tool-guard.int.test.ts`, 1 file / 1 literal) is translated in
// the conversion commit.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { fixedClockOf } from "../lib/plumbing-literals.ts";

const MESSAGE =
  "a fixed wall clock — a numeric timeout literal is a budget written for a quiet box, and it reads as a false RED on a contended one; every ceiling is derived from the ONE load-budget policy (`budget(<X>_BASE_MS)`, _shared/load-budget.ts), which stretches it by the box's contention and caps it at the absolute ceiling (docs/architecture/core/Core-Tooling-Law.md §4.4; docs/design/1208-instrument-substrate.md §7.1, #1232).";
const FIX =
  "name the quiet-box literal `<X>_BASE_MS` and derive the ceiling with `budget(<X>_BASE_MS)` (tooling) or `scaledBudget(<X>_BASE_MS)` (tests/tooling/_load-budget.ts); a literal that is fixture DATA rather than a clock this run pays takes an `@orb-waive tooling-clock-budget(<literal>): <reason>` at its site.";

export const gate = defineGate({
  id: "tooling-clock-budget",
  family: "plumbing-literals",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@tooling", "@tests"], under: ["tooling/src/**", "tests/tooling/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAssignment, SyntaxKind.VariableDeclaration, SyntaxKind.CallExpression],
        visit: (node) => {
          const clock = fixedClockOf(node);
          if (clock === null) {
            return;
          }
          ctx.report.node(clock.literal, { token: clock.literal.getText(), offset: 0, message: `${MESSAGE} Clock: \`${clock.label}\`.`, fix: FIX });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "tooling/src/ui-audit/ops/walk.ts": "export const opts = { timeout: 30_000 };\n" },
      expect: { count: 1, token: "30_000", messageIncludes: "Clock: `timeout: 30_000`" },
      why: "a fixed wall clock at a timeout option — the false-red-under-load class the policy exists to end; the position is the literal, the message names the option",
    },
    {
      mode: "source",
      files: { "tests/tooling/ui-audit/cli.int.test.ts": "const STEP_TIMEOUT_MS = 5000;\nexport const x = STEP_TIMEOUT_MS;\n" },
      expect: { count: 1, token: "5000", messageIncludes: "Clock: `STEP_TIMEOUT_MS = 5000`" },
      why: "the NAMED-CONST dodge — a literal moved one line up is still a fixed clock — AND the proof the population reaches tests/tooling/**, which no other plumbing policy judges",
    },
    {
      mode: "source",
      files: { "tooling/src/motion-audit/ops/drive.ts": "export const wait = (): void => {\n  setTimeout(() => undefined, 30_000);\n};\n" },
      expect: { count: 1, token: "30_000", messageIncludes: "Clock: `setTimeout(…, 30_000)`" },
      why: "a ceiling wearing a sleep's clothes: a setTimeout at or above the settle ceiling is a budget; the reported position is the delay literal, which a waiver can name where the legacy composite could not",
    },
    {
      mode: "source",
      files: { "tooling/src/snap/lib/budgets.ts": "export const budgets = { expect: { timeout: 5000 } };\n" },
      expect: { count: 1, token: "5000" },
      why: "a NESTED option object reaches the list through its INNER property — the reader reads the LEAF, never the wrapper (playwright's expect-timeout shape)",
    },
    {
      mode: "source",
      files: { "tooling/src/snap/lib/nav.ts": "export const NAV_TIMEOUT_MS = 15_000;\n" },
      expect: { count: 1, token: "15_000", messageIncludes: "NAV_TIMEOUT_MS = 15_000" },
      why: "the `*_TIMEOUT_MS` spelling WITHOUT a BASE marker is exactly how screen-record's two ceilings sat unscaled outside any lib/budgets.ts; a name carrying BASE is the sanctioned declaration (mustPass[1])",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tooling/src/ui-audit/lib/budgets.ts":
          "export const budgets = { timeout: budget(NAV_BASE_MS) };\ndeclare function budget(n: number): number;\ndeclare const NAV_BASE_MS: number;\n",
      },
      why: "the SANCTIONED wall-clock shape — a derived ceiling, not a literal (the pass half)",
    },
    {
      mode: "source",
      files: { "tooling/src/motion-audit/lib/budgets.ts": "const NAV_TIMEOUT_BASE_MS = 15_000;\nexport const x = NAV_TIMEOUT_BASE_MS;\n" },
      why: "a quiet-box BASE declares itself in its NAME and is the literal every budget is derived from — flagging it would leave no legal way to state a base",
    },
    {
      mode: "source",
      files: { "tooling/src/motion-audit/lib/base.ts": "const BASE_NAV_TIMEOUT_MS = 15_000;\nexport const x = BASE_NAV_TIMEOUT_MS;\n" },
      why: "THE ROW THAT HOLDS THE BASE FENCE: a name that ENDS in the clock suffix and carries BASE elsewhere is admitted only by the BASE exemption — `NAV_TIMEOUT_BASE_MS` above never reaches it (the suffix regex already rejects it), so dropping the exemption left that row green and this one reds (§4.1 cut, measured 2026-09-12)",
    },
    {
      mode: "source",
      files: { "tooling/src/snap/ops/drive.ts": "export const settle = (): void => {\n  setTimeout(() => undefined, 400);\n};\n" },
      why: "a SETTLE is a sleep the run always pays, not a ceiling — settles are never scaled (§7.1), so a short setTimeout must not trip the arm",
    },
    {
      mode: "source",
      files: { "tooling/src/motion-audit/lib/thresholds.ts": "export const BLOCKING_BUDGET_MS = 50;\n" },
      why: "`*_BUDGET_MS` is DELIBERATELY not a clock name: motion-audit's blocking budget is a VERDICT THRESHOLD, and scaling a threshold would WIDEN the verdict on a loaded box — the third arm #1040 forbids (a rate's answer to load is the label, never a multiplier)",
    },
    {
      mode: "source",
      files: { "tooling/src/snap/lib/clean.ts": "export const clean = true;\n", "tests/e2e/support/boot.ts": "export const boot = { timeout: 30_000 };\n" },
      why: "DECLARED LIMIT: `tests/e2e/support/**` was never this arm's — its clocks are e2e boot budgets (#1232's territory, the port policy's tree) — so the same literal there is outside the population by derivation. The clean tooling file keeps the fixture admitted",
    },
  ],
});
