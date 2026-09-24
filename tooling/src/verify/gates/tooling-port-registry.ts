// Policy: tooling-port-registry (docs/law/Core-Tooling-Law.md §4.4, the TREE half of arm I of
// the retired `tooling-shared-plumbing`, #1269/#1271) — every
// TCP port is a row in the ONE registry, `_shared/ports.ts`. A numeric literal whose VALUE is a registry port
// (reserved or stage-band — the registry is IMPORTED, so a new reserved row widens this arm for free), or a
// numeric literal at a PORT-NAMED position (`port`/`…Port`/`…_PORT`) carrying a number the registry never
// declared — a hand-picked pair, pain P10 — is RED anywhere under `tooling/src/**` or `tests/e2e/support/**`
// (the second place a hand-picked pair has historically been born). Comment posture: comment-SAFE (a
// numeric-literal node kind).
//
// AUTHORITY IS reviewed-grant (#1950 group 4): the legacy `PORT_HOME` row for ports.ts is a
// recurring repository PERMISSION — one exact row, `(ports.ts, port-literal)`; the legacy stale sweep ("the
// day the registry stops carrying port literals is the day it stopped being the registry") is central grant
// liveness. FAMILY `plumbing-literals` — the shared reader is `lib/plumbing-literals.ts#portLiteralOf`,
// shared with `tooling-runner-config-literals`, which judges the same predicate over the root runner configs
// (the arm's ROOT half, its own resource policy). SYNTAX analysis: a number has no declaration to resolve.
//
// DECLARED LIMITS, carried verbatim: (1) a port inside a STRING (`"http://localhost:5173"`) is not a numeric
// literal and is not judged — `tests/e2e/support/target-guard.test.ts` deliberately spells the dev origins as
// negative fixture data (mustPass[2]); (2) the three SHELL launchers (stack.sh 8788/5173,
// multi-user-fixture.sh 8790/5175; the operator's engines 8701-8703) are the mirror side by LANGUAGE and
// `packages/client/vite.config.ts` is the mirror side by CAKE (an upward import) — both a RULED exclusion
// (owner, 2026-09-02), named in ports.ts's header; (3) a registry number reused with a NON-port meaning IS
// flagged, deliberately (a respell is a respell); the escape is an exact grant on a reviewed subject, never a
// looser matcher (mustPass[3]).
//
// THE REPORTED POSITION is the numeric literal as written (the legacy composed `FIXTURE_PORT = 8123`, which
// is not a slice of any node). `entire-population` because grant liveness is only sound after a complete
// run; a narrowed request DEFERS this policy. POPULATION PORT: byte-identical — the legacy fenced arm I to
// `tooling/src/` + `tests/e2e/support/` inside `visit`; `tests/tooling/**` was never this arm's (mustPass[4]).
//
// Legacy descriptor: `2c1a1d37c` (`tooling/src/verify/gates/tooling-shared-plumbing.ts`, arm I, tree half).
// No private marker grammar; zero live `@orb-gate-ignore tooling-shared-plumbing` markers at conversion.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tooling-shared-plumbing` descriptor at daf3444358fc10c2b0a3bc3377c62abe23e82c63, the parent of the conversion
// `7b80f66a4`; this module did not exist there, so it is measured against the module it was carved from,
// `tooling-shared-plumbing` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `2c1a1d37c` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,464 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,617 and final `population` admits 1,135.
// legacy − final = 482 `tests/tooling/**` sources — never arm I's (mustPass[4]). final − legacy = ∅. Controls: inside
// `tests/e2e/support/__cbbhr_in_actors.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import { SyntaxKind } from "ts-morph";
import { RESERVED_PORT_NUMBERS, STAGE_BAND_PORT_NUMBERS } from "../../_shared/ports.ts";
import { defineGate } from "../contract/policy.ts";
import { portLiteralOf } from "../lib/plumbing-literals.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

/** Every number the registry declares — reserved rows AND stage bands. IMPORTED, never re-spelled. */
const REGISTRY_PORTS: ReadonlySet<number> = new Set([...RESERVED_PORT_NUMBERS, ...STAGE_BAND_PORT_NUMBERS]);
const OPERATION = "port-literal";

const MESSAGE =
  "a TCP port outside the ONE registry — a numeric literal whose value is a registry port (reserved or stage-band), or one at a port-named position carrying a number no registry row declares, is a hand-picked pair: 47 such literals across tooling, the e2e harness and the runner configs was the state this repo shipped until #1269, which is why picking a pair meant grepping and hoping (docs/law/Core-Tooling-Law.md §4.4).";
const FIX =
  "read the named row from _shared/ports.ts (DEV_PORTS, FIXTURE_PORTS, E2E_PORTS, CT_VITE_PORT, ENGINE_PORTS, MODEL_AB_PORT, …) or allocate a stage band (`stageBandPorts`); a NEW port is a new reserved row there, never a number picked at the call site. The registry itself carries the exact reviewed grant `(ports.ts, port-literal)`.";

export const gate = defineGate({
  id: "tooling-port-registry",
  family: "plumbing-literals",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@tooling", "@tests"], under: ["tooling/src/**", "tests/e2e/support/**"] },
  analysis: "syntax",
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
          kinds: [SyntaxKind.NumericLiteral],
          visit: (node, sourceFile) => {
            const port = portLiteralOf(node, REGISTRY_PORTS);
            if (port === null) {
              return;
            }
            candidates.push({ node: port.literal, subject: ctx.relativePath(sourceFile), operation: OPERATION, token: port.literal.getText(), offset: 0 });
          },
        },
      ],
      evaluate: () => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE });
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      grant: { subject: "tooling/src/stack/ops/up.ts", operation: "port-literal" },
      files: { "tooling/src/stack/ops/up.ts": "export const p = 8788;\n" },
      expect: { count: 1, token: "8788", messageIncludes: "Subject: tooling/src/stack/ops/up.ts, operation: port-literal" },
      why: "a RESERVED registry port respelled as a literal — the dev pair was the exact respell #1271 spent (stage-plan.ts + fixture.ts held four of them)",
    },
    {
      mode: "source",
      files: { "tooling/src/snap/lib/stage-plan.ts": "export const stage = { server: 8888, vite: 5273 };\n" },
      expect: { count: 1, token: "8888", messageIncludes: "line(s): 1" },
      why: "the STAGE-BAND half: bands are allocated, never typed — the policy imports STAGE_BAND_PORT_NUMBERS, so band 0's pair is as much a respell as a reserved row. Both literals are sites of ONE `(subject, operation)` finding (grant granularity), anchored on the first",
    },
    {
      mode: "source",
      files: { "tests/e2e/support/modes.ts": 'export const mode = { name: "local", port: 8796 };\n' },
      expect: { count: 1, token: "8796" },
      why: "the proof the population REACHES tests/e2e/support/** — the exact class of file where the legacy's widened scanRoot with an un-widened relOf once read GREEN over files it never opened (2026-09-02)",
    },
    {
      mode: "source",
      files: { "tooling/src/stack/lib/spawners.ts": "const FIXTURE_PORT = 8123;\nexport const x = FIXTURE_PORT;\n" },
      expect: { count: 1, token: "8123" },
      why: "a HAND-PICKED NEW port: no registry row declares 8123, so only the NAME gives it away — pain P10 verbatim (picking a pair by grepping and hoping); the value-shaped half is structurally blind to it. The position is the literal, not the legacy's composed `FIXTURE_PORT = 8123`",
    },
    {
      mode: "source",
      files: { "tooling/src/snap/ops/capture.ts": "export const opts = { ctPort: 3101 };\n" },
      expect: { count: 1, token: "3101" },
      why: "the PROPERTY spelling of the same dodge — a port-named object key is as much a declaration as a const, and CT's own port sits one below it",
    },
    {
      mode: "source",
      files: { "tooling/src/_shared/ports.ts": "export const DEV_PORTS = { server: 8788, vite: 5173 };\n" },
      expect: { count: 1, messageIncludes: "Subject: tooling/src/_shared/ports.ts, operation: port-literal" },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the registry reds like any other site — scanned, never population-excluded, so the day it moves it reds at its new path — and is licensed by its exact grant row (`tooling-port-registry:ports`). The family test proves this real central grant consumes the identity; module witnesses independently prove the synthetic exact-grant door",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "tooling/src/snap/lib/stage-plan.ts": 'import { DEV_PORTS } from "../../_shared/ports.ts";\nexport const staged = DEV_PORTS.server + 100;\n' },
      why: "the SANCTIONED shape and the literal #1271 landing: the pair is READ from the registry and the offset is an ordinary number no port table declares — flagging this would leave no legal way to derive a port",
    },
    {
      mode: "source",
      files: { "tooling/src/snap/ops/socket.ts": 'export const dev = { name: "single-user", baseUrl: "http://localhost:5173" };\n' },
      why: "DECLARED LIMIT (1): a port inside a STRING is not a numeric literal. The e2e target guard spells the dev origins as negative FIXTURE data — the thing it refuses — and widening the arm to string content would either accuse it or need a grant for a test's own subject",
    },
    {
      mode: "source",
      files: { "tests/e2e/support/actors.ts": "export const model = { contextWindow: 8192, maxTokens: 4096 };\n" },
      why: "the FALSE-POSITIVE control: 8192 is a real four-digit number at a non-port key, live in actors.ts today. The name half needs a PORT-shaped name and the value half needs a number the registry actually declares — 'any four-digit literal' would accuse every context window in the harness",
    },
    {
      mode: "source",
      files: { "tooling/src/snap/lib/clean.ts": "export const clean = true;\n", "tests/tooling/snap/ports.test.ts": "export const dev = 8788;\n" },
      why: "DECLARED LIMIT: `tests/tooling/**` was never this arm's jurisdiction (it is the clock policy's) — the same registry value there is outside the population by derivation. The clean tooling file keeps the fixture admitted",
    },
  ],
});
