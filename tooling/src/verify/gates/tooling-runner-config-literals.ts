// Policy: tooling-runner-config-literals (docs/architecture/core/Core-Tooling-Law.md §4.4, the ROOT-CONFIG
// halves of arms I and J of the retired `tooling-shared-plumbing`) — the three ROOT runner configs
// (`vitest.config.ts`, `playwright.config.ts`, `playwright-ct.config.ts`) carry the clocks that cost the most
// (the vitest lane timeouts, the CT `mount()` timeout, the e2e webServer boot ceiling) and the CT vite port,
// and NO population reaches a repo-root file. Both literal laws — a port is a registry row
// (`_shared/ports.ts`), a wall clock is `budget(<base>)` (`_shared/load-budget.ts`) — are judged here over
// the configs' TEXT. Comment posture: comment-SAFE (a scratch parse; node kinds + numeric literals).
//
// ONE HARD RESOURCE POLICY (docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments", #1950 group 4; fork 2 ruled BUILD 2026-09-12): the three files are
// `exact-file` resources — three ids added to `contract/resource-exact.ts` with this policy as their named
// consumer, a contract edit rather than a reopening (§12.4's own sentence) — and the population is
// `{ of: "none" }`: the policy admits no source file. The legacy read the same files off disk past a
// real-tree anchor through the one scratch parser and DISCOVERED `playwright*.config.ts` by readdir; the
// DECLARED LIMIT recorded in exchange for no gate-owned filesystem read: the closed ids name the three files
// that exist, and a fourth runner config is unjudged until it gets an id.
//
// FAMILY `plumbing-literals` — the shared reader is `lib/plumbing-literals.ts#runnerConfigLiteralFacts`,
// the SAME `portLiteralOf` / `fixedClockOf` predicates the two tree policies (`tooling-port-registry`,
// `tooling-clock-budget`) judge with, walked over `lib/config-static-read.ts#parseStaticSourceText`'s
// scratch parse of the delivered text — so a literal means the same thing in a config as in the tree, and
// no gate module walks. WHAT THE CONVERSION MOVED OUT: the legacy's MISSING-CONFIG tripwire ("a rename
// would retire the arm in silence") is the `exact-file` door's own fail-closed refusal — a missing id refuses
// the WHOLE fact at the population phase, before `create` (pinned in
// tests/tooling/verify/gates/tooling-plumbing-family.test.ts, since conformance has no must-refuse arm).
// An UNPARSEABLE config, whose text still arrives, stays a finding here (mustFlag[4]).
//
// NEW EVIDENCE at conversion: `playwright.config.ts` carried three literal clocks (`timeout: 180_000`,
// `timeout: 60_000`, `actionTimeout: 15_000`) the legacy never judged — it read only the vitest and CT
// configs — and they are routed through the shared `budget` reader in the conversion commit with their
// effective quiet-box values preserved (a quiet box leaves every budget byte-identical to its base).
//
// THE REPORTED POSITION is the literal's line in the config with the literal as token; no ordinary door (the
// configs are outside every population, so no carrier could hold a waiver). `entire-population` — the
// verdict is over closed facts; a narrowed request DEFERS this policy.
//
// Legacy descriptor: `2c1a1d37c` (`tooling/src/verify/gates/tooling-shared-plumbing.ts`, `sweepRootConfigs`
// + `sweepPlaywrightConfigs`). No private marker grammar; zero live markers at conversion.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tooling-shared-plumbing` descriptor at daf3444358fc10c2b0a3bc3377c62abe23e82c63, the parent of the conversion
// `7b80f66a4`; this module did not exist there, so it is measured against the module it was carved from,
// `tooling-shared-plumbing` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `2c1a1d37c` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,464 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness — no `scanRoot` — dispatched 1,617, and the final
// `population` admits 0; the subject is the declared three `exact-file` runner-config ids. legacy − final = all 1,617
// `tooling/src` + `tests/tooling` + `tests/e2e/support` paths the parent `tooling-shared-plumbing` scanned — this arm
// (`sweepRootConfigs`/`sweepPlaywrightConfigs`) read none of them; it read the repo-root runner configs off disk.
// final − legacy = ∅. Controls: the legacy side is non-empty and the final side is empty by declaration, so equality
// cannot pass vacuously; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` rejected by both.
import { RESERVED_PORT_NUMBERS, STAGE_BAND_PORT_NUMBERS } from "../../_shared/ports.ts";
import { defineGate } from "../contract/policy.ts";
import type { ExactResourceId } from "../contract/resource-exact.ts";
import { runnerConfigLiteralFacts } from "../lib/plumbing-literals.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

/** Every number the registry declares — reserved rows AND stage bands. IMPORTED, never re-spelled. */
const REGISTRY_PORTS: ReadonlySet<number> = new Set([...RESERVED_PORT_NUMBERS, ...STAGE_BAND_PORT_NUMBERS]);
/** The three closed ids, in declaration order; every one is demanded on every run. */
const CONFIGS: readonly ExactResourceId[] = ["vitest-config", "playwright-config", "playwright-ct-config"];

const MESSAGE =
  "a runner-config literal outside its one home — a root runner config (vitest.config.ts, playwright.config.ts, playwright-ct.config.ts) spells a WALL CLOCK as a numeric timeout literal instead of `budget(<base>)` (_shared/load-budget.ts), or a TCP PORT as a number instead of a `_shared/ports.ts` row; these are the clocks that cost the most and the port every CT run binds, and they sit where no source population reaches (docs/architecture/core/Core-Tooling-Law.md §4.4; docs/design/1208-instrument-substrate.md §3.6/§7.1).";
const CLOCK_MESSAGE =
  "a fixed wall clock in a root runner config — derive it with `budget(<X>_BASE_MS)` from @orb/tooling/_shared/load-budget, as the other clocks in these configs already are.";
const PORT_MESSAGE =
  "a port literal in a root runner config — read the named row from @orb/tooling/_shared/ports (CT_VITE_PORT, E2E_PORTS, …) instead of spelling the number.";
const UNPARSEABLE = "a root runner config does not parse, so its clocks and ports cannot be judged — the arm is blind to this file until it parses again";
const FIX =
  "derive every timeout with `budget(<X>_BASE_MS)` (@orb/tooling/_shared/load-budget) and every port from a `@orb/tooling/_shared/ports` row; a fourth runner config needs its own `exact-file` id in contract/resource-exact.ts before this policy can see it.";

export const gate = defineGate({
  id: "tooling-runner-config-literals",
  family: "plumbing-literals",
  authority: "hard",
  severity: "error",
  population: {
    of: "none",
    why: "the three root runner configs are closed exact-file ResourceHost facts outside every authored tree; this policy admits no source file",
  },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "exact-file", id: "vitest-config" },
    { kind: "exact-file", id: "playwright-config" },
    { kind: "exact-file", id: "playwright-ct-config" },
  ],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      // Population resolution already refused a non-ready fact before `create` — a missing config is the
      // door's own tool error — so the narrowing here is an assertion about the runtime, never a silent return.
      const files = readyResourceValue(ctx.resources.exactFiles(CONFIGS));
      for (const id of CONFIGS) {
        const file = files.get(id);
        if (file === undefined) {
          throw new Error(`exact-file ${id} was declared ready but is absent from the delivered map`);
        }
        const read = runnerConfigLiteralFacts(file.path, file.text, REGISTRY_PORTS);
        if (read.kind === "unparseable") {
          ctx.report.file(file.path, { line: 1, column: 1, message: `${UNPARSEABLE} (${read.detail}).`, fix: FIX });
          continue;
        }
        for (const literal of read.literals) {
          ctx.report.file(file.path, {
            line: literal.line,
            column: 1,
            token: literal.token,
            message: `${literal.kind === "port" ? PORT_MESSAGE : CLOCK_MESSAGE} Literal: \`${literal.label}\`.`,
            fix: FIX,
          });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: configs({ vitest: "export default { test: { testTimeout: 5000, hookTimeout: budget(10_000) } };\ndeclare function budget(n: number): number;\n" }),
      expect: { count: 1, line: 1, token: "5000", messageIncludes: "Literal: `testTimeout: 5000`" },
      why: "the founding shape — a fixed vitest lane timeout in the root config, the clock that costs the most, beside a DERIVED sibling that stays silent",
    },
    {
      mode: "resource",
      files: configs({ e2e: 'export default { webServer: { command: "x", timeout: 180_000 } };\n' }),
      expect: { count: 1, token: "180_000", messageIncludes: "Literal: `timeout: 180_000`" },
      why: "THE LIVE DRIFT this conversion found: playwright.config.ts carried three literal clocks the legacy never judged (it read only the vitest and CT configs) — the e2e webServer boot ceiling is one of them, and the third id is what makes it visible",
    },
    {
      mode: "resource",
      files: configs({ ct: "export default { use: { ctPort: 3100 } };\n" }),
      expect: { count: 1, token: "3100", messageIncludes: "Literal: `3100`" },
      why: "the PORT half: the CT vite port respelled as a literal — 3100 is a registry value (CT_VITE_PORT), so it reds by VALUE with no name needed, exactly as it would in the tree",
    },
    {
      mode: "resource",
      files: configs({ ct: "export default { use: { ctPort: 4242 } };\n" }),
      expect: { count: 1, token: "4242", messageIncludes: "Literal: `ctPort: 4242`" },
      why: "a HAND-PICKED port in a config: 4242 is in no table, so only the port-shaped NAME gives it away — the name half of the same predicate the tree policy uses",
    },
    {
      mode: "resource",
      files: configs({ vitest: "export default { test: {\n" }),
      expect: { count: 1, line: 1, messageIncludes: "does not parse" },
      why: "an UNPARSEABLE config is REPORTED, never skipped: its text arrived, so the door served it, and a silent skip would retire the arm for that file (the legacy blindness tripwire, kept where the text is present)",
    },
    {
      mode: "resource",
      files: configs({
        ct: "const STEP_TIMEOUT_MS = 5000;\nexport default { timeout: budget(STEP_TIMEOUT_MS) };\ndeclare function budget(n: number): number;\n",
      }),
      expect: { count: 1, line: 1, token: "5000", messageIncludes: "STEP_TIMEOUT_MS = 5000" },
      why: "the NAMED-CONST dodge inside a config — a literal moved one line up and then handed to `budget()` is still a fixed clock spelled without BASE; `STEP_TIMEOUT_BASE_MS` is the sanctioned name (mustPass[0])",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: configs(),
      why: "the sanctioned shape in all three configs — every clock `budget(<BASE>)`, the CT port read from the registry (an identifier, not a literal), and a base const carrying BASE in its name",
    },
    {
      mode: "resource",
      files: configs({ ct: "export default { expect: { toHaveScreenshot: { maxDiffPixels: 8192 } }, retries: 2, workers: 4 };\n" }),
      why: "the FALSE-POSITIVE control: 8192 at a non-port key is a real number, and `retries`/`workers` are counts — neither predicate names them",
    },
    {
      mode: "resource",
      files: configs({
        vitest:
          'export default { test: { include: ["tests/**/*.test.ts"], testTimeout: budget(5000) }, reporters: ["default"] };\ndeclare function budget(n: number): number;\n',
      }),
      why: "DECLARED LIMIT: the SELECTOR rows (`include`, reporters) are `runner-config-path-liveness`'s subject through `static-config`; this policy reads only the two literal predicates, and a derived clock beside them is silent",
    },
  ],
});

/** The three configs every proof must plant: each is a DECLARED resource, so an absent one is a
 *  population-phase tool error that would drown the row under test. Defaults are the sanctioned shapes. */
function configs(overrides: { readonly vitest?: string; readonly e2e?: string; readonly ct?: string } = {}): Record<string, string> {
  return {
    "vitest.config.ts": overrides.vitest ?? "export default { test: { testTimeout: budget(5000) } };\ndeclare function budget(n: number): number;\n",
    "playwright.config.ts":
      overrides.e2e ??
      'export default { webServer: { command: "x", timeout: budget(180_000) }, use: { actionTimeout: budget(15_000) } };\ndeclare function budget(n: number): number;\n',
    "playwright-ct.config.ts":
      overrides.ct ??
      "const BASE_TEST_TIMEOUT_MS = 30_000;\nexport default { timeout: budget(BASE_TEST_TIMEOUT_MS), use: { ctPort: CT_VITE_PORT } };\ndeclare function budget(n: number): number;\ndeclare const CT_VITE_PORT: number;\n",
  };
}
