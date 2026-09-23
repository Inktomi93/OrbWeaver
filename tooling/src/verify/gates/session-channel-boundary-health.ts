// Policy: session-channel-boundary-health — the BLINDNESS TRIPWIRE (§4.6) for `session-channel-boundary`:
// the sanctioned home (`packages/client/src/lib/session-channel.ts`) loaded and constructing NO
// BroadcastChannel means the fence names a home that moved, or a home whose construction left, and the
// occurrence policy would report ✓ forever. Split from the legacy descriptor (#1950) because
// this is a whole-tree HARD verdict — no author may waive "the fence is blind" — while the occurrence arm is
// a per-file ordinary one; one `execution` and one authority cannot serve both.
//
// FAMILY `session-channel` — the shared reader is `lib/broadcast-channel-origin.ts`
// (`classifyBroadcastChannelConstruction`), the SAME predicate the occurrence policy judges with, so what
// counts as "the home constructs" here is exactly what counts as "a construction" there.
//
// POPULATION PORT: byte-identical (`@client`, the legacy `scanRoot`). `entire-population` because whether
// ONE file constructs is a question no per-file subset can answer; a narrowed request DEFERS this policy
// (pinned in tests/tooling/verify/gates/session-channel-family.suite.test.ts) instead of declaring the home dead.
//
// THE ANCHOR MOVE (§4.6 classified difference, the same one tier-home-health-family.suite.int.test.ts records for
// the spacing family): the legacy tripwire reported on line 1 of the GATE MODULE ITSELF, which is outside
// `@client` and therefore a path `ctx.report.file` cannot express. The finding now anchors on the real-tree
// anchor (`packages/client/src/lib/index.ts`) the legacy arm already self-guarded on. The SELF-GUARD is
// carried verbatim: with the anchor absent — a fixture, a mini-project, a foreign family test — the tripwire
// stays silent rather than "proving" the home dead (mustPass[1]).
//
// Legacy descriptor: `774231540` (`tooling/src/verify/gates/session-channel-boundary.ts`, arm B).
//
// LEGACY SHA: THIS FILE HAS NONE and cannot. It was BORN FINAL at `f1bbc34e7`, the commit that split arm B
// out — `git show f1bbc34e7^:<this file>` refuses with "exists on disk, but not in f1bbc34e7^", and that
// refusal is the receipt (the `scrubber-factory-home` precedent). The sha in the line above names the
// LEGACY MODULE this half came from, not a predecessor of this file; its canonical parent form is
// `f1bbc34e7^` (= `011233309`), recorded in the occurrence half.
// POPULATION PORT: INHERITED, not ported — no legacy population of this module's own exists. It declares
// `@client` because the occurrence half does, and the two must be identical or the ratchet is one-sided;
// the legacy predicate behind it is that half's `scanRoot: (p) => p.includes("packages/client/src/")`,
// byte-identical to `@client` on this tree.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `session-channel-boundary` descriptor at 01123330987d1f22a088bcf5a57ef280942d30e7, the parent of the conversion
// `f1bbc34e7`; this module did not exist there, so it is measured against the module it was carved from,
// `session-channel-boundary` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`).
// Over the SAME 7,441 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`),
// legacy `scanRoot` admits 1,319 and final `population` admits 1,319. legacy − final = ∅. final − legacy = ∅.
// Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyBroadcastChannelConstruction, SESSION_CHANNEL_ANCHOR, SESSION_CHANNEL_HOME } from "../lib/broadcast-channel-origin.ts";

// THE `mustFlag` ROWS CARRY NO `messageIncludes` AND MUST NOT (#1968, #2058). This module emits exactly
// ONE message — the policy-level `MESSAGE` below, with no per-finding override — and that message contains
// "is BLIND", so a row asserting that fragment passes whatever the policy did. Three rows carried it and
// the claim was empty in all three. `count` + `line` are the real assertions; the discriminating work is
// done by each row's own FIXTURE, which its `why` names.
const MESSAGE =
  `session-channel-boundary is BLIND: its home "${SESSION_CHANNEL_HOME}" constructs no BroadcastChannel. Either the channel ` +
  "moved (re-point SESSION_CHANNEL_HOME in lib/broadcast-channel-origin.ts) or it was deleted (delete both session-channel " +
  "policies) — as written the fence would report clean forever.";

export const gate = defineGate({
  id: "session-channel-boundary-health",
  family: "session-channel",
  authority: "hard",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "Re-point SESSION_CHANNEL_HOME at the file that now constructs the channel, or delete both session-channel policies with the channel.",
  create: (ctx) => {
    let homeConstructs = false;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.NewExpression],
          visit: (node, sourceFile) => {
            if (!Node.isNewExpression(node) || ctx.relativePath(sourceFile) !== SESSION_CHANNEL_HOME) {
              return;
            }
            if (classifyBroadcastChannelConstruction(node) === "constructs") {
              homeConstructs = true;
            }
          },
        },
      ],
      evaluate: () => {
        // The tripwire is a whole-tree claim about ONE file: without the real-tree anchor a fixture or a
        // mini-project would "prove" the home dead — the §4.5 misfire the legacy arm guarded against too.
        if (homeConstructs || !ctx.files.some((sourceFile) => ctx.relativePath(sourceFile) === SESSION_CHANNEL_ANCHOR)) {
          return;
        }
        ctx.report.file(SESSION_CHANNEL_ANCHOR, { line: 1, column: 1 });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [SESSION_CHANNEL_ANCHOR]: "export const lib = {};\n",
        [SESSION_CHANNEL_HOME]: "export function postSessionMessage(): void {}\n",
      },
      expect: { count: 1, line: 1 },
      why: "ARM B as carried: the home is loaded but no longer constructs a channel (its construction moved out), so the fence would be a permanent false green",
    },
    {
      mode: "types",
      files: {
        [SESSION_CHANNEL_ANCHOR]: "export const lib = {};\n",
        "packages/client/src/lib/other.ts": 'export const c = new BroadcastChannel("orb:session");\n',
      },
      expect: { count: 1, line: 1 },
      why: "THE MOVED HOME: the anchor is loaded, the channel is constructed in ANOTHER file and the home path resolves to nothing — the rename the message names, reported at the anchor because the dead path cannot carry a finding",
    },
    {
      mode: "types",
      files: {
        [SESSION_CHANNEL_ANCHOR]: "export const lib = {};\n",
        [SESSION_CHANNEL_HOME]: "const BroadcastChannel = Map;\nexport const c = new BroadcastChannel<string, number>();\n",
      },
      expect: { count: 1, line: 1 },
      why: "THE IDENTITY HALF of the tripwire: the home constructs a const NAMED BroadcastChannel that aliases ANOTHER global, which is not the channel — the shared reader resolves the alias to `Map`. Replacing the global-name comparison with a bare `constructs` reds this row",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [SESSION_CHANNEL_ANCHOR]: "export const lib = {};\n",
        [SESSION_CHANNEL_HOME]: 'export const c = new BroadcastChannel("orb:session");\n',
      },
      why: "the sanctioned home constructing the one channel, judged against the real-tree anchor — the tripwire stays quiet",
    },
    {
      mode: "types",
      files: { [SESSION_CHANNEL_HOME]: "export function postSessionMessage(): void {}\n" },
      why: "THE ANCHOR GUARD: with no real-tree anchor in the project the tripwire self-guards off — a synthetic mini-project can never red it. Deleting the anchor check reds this row",
    },
  ],
});
