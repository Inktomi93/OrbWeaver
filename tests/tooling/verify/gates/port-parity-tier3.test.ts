// THE §4.6 DIFFERENTIAL FOR THE TWO TIER-3 EXCEPTIONS — #2000, lane p-parity-tier2bc.
//
// #2000's Tier 3 is closed BY RULE (the ruling and its membership test live in
// `docs/reviews/gate-runtime/tier3-one-to-one-port-ruling.md`), with exactly two named carve-outs that
// must be REPLAYED instead:
//
//   · `plugin-dump-guard` — #1986: two unpinned arms in a HARD, security-adjacent policy. The rule's
//     membership test fails it on three counts at once (five mustFlag rows rather than a token match, a
//     control-flow ORDERING predicate rather than pure syntax, and a `finalize` blindness arm guarded on a
//     REAL-TREE ANCHOR that no legacy example loads).
//   · `turn-identity` — the wave-9 copy candidate, and the module a Phase D lane is pointed AT. A module
//     other conversions are told to copy owes evidence rather than a judgement.
//
// LEGACY-SIDE COVERAGE FIRST, because a zero downgrades everything after it: `plugin-dump-guard` produces
// 5 findings on 5 of its 8 examples, `turn-identity` 2 on 2 of its 4. Neither is vacuous.
//
// THE RESULT, and it is the same shape the schema-fact family produced: both legacy engines matched a
// member NAME textually, so their fixtures never had to make the declaring package resolvable. Both final
// policies resolve the member's ORIGIN — `declaredByPackage(…, "quickjs-emscripten-core")` and
// `readSealedOrigin(…, /packages/contracts/src/identity/)` — so on the RAW legacy bytes they refuse rather
// than report. Every such row therefore carries a CONSTRUCTED TWIN that plants the door the module's own
// proof rows already plant, and every twin's completion is proven INERT on the legacy side.
//
// `plugin-dump-guard`'s raw refusal is worth naming: the final's zero-member population receipt makes an
// unrecognised membrane a REFUSED RUN, where the legacy `finalize` arm reported a finding. That receipt is
// the successor of the legacy blindness arm — louder, not quieter — and the block at the end of that test
// proves the legacy arm had ZERO example coverage and drives both engines from its own trigger condition.
//
// The replay machinery, the line-anchored import shim and the twin-inertness control live in
// `tests/support/legacy-differential.ts`; read its header before changing anything here.
import { gate as pluginDumpGuard } from "../../../../tooling/src/verify/gates/plugin-dump-guard.ts";
import { gate as turnIdentity } from "../../../../tooling/src/verify/gates/turn-identity.ts";
import type { Repair } from "../../../support/legacy-differential.ts";
import { createDifferential, filesystemReach, frozenLegacyGate, label } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const TIMEOUT_MS = scaledBudget(120_000);

/** TOTAL: an unrecognised tool-error shape THROWS rather than being absorbed into a code. */
function toolErrorCode(owner: string, phase: string, message: string): string {
  return `${owner}/${phase}: ${message}`;
}

const { legacyReplay, finalReplay, runScenarios } = createDifferential("/port-parity-tier3", toolErrorCode);

// ─── 1. plugin-dump-guard (#1986) ────────────────────────────────────────────────────────────────────
// FROZEN SHA `5dd83aaa4` — the parent of `4885cde80`, the "ten ordinary simple-visitor gates into fifteen
// final policies" conversion. Verified: `5dd83aaa4:plugin-dump-guard.ts` holds a `GateDescriptor`, and
// this module was NOT one of that commit's splits (its policy id and family are both `plugin-dump-guard`).
const DUMP_BASE = "5dd83aaa42c85c361d321fe56bf13063c93edf17";
const MEMBRANE = "packages/server/src/infra/plugin-host/membrane.ts";
/** The final's blindness receipt. It replaces the legacy `finalize` self-report and is LOUDER: a refusal,
 *  not a finding. Every raw legacy fixture trips it, because an untyped `ctx.dump` is not a QuickJS dump. */
const NO_DUMP_SITES = 'plugin-dump-guard/receipt: policy receipt refused: population "membrane guest-dump sites" resolved zero members';

// THE COMPLETION BOTH LEGACY MODULES NEED, and it is the SAME §4.8b class both times: the legacy engines
// matched a member NAME (`dump`, `Principal`) textually, so their fixtures never had to make the declaring
// package resolvable. The final policies resolve the member's ORIGIN — `declaredByPackage(…,
// "quickjs-emscripten-core")` and `readSealedOrigin(…, /packages/contracts/src/identity/)` — and a
// specifier that resolves to nothing is not that origin. Each repair plants the door the module's OWN
// proof rows already plant, and `runScenarios` proves it moved no legacy verdict.
const QUICKJS_SURFACE =
  "export interface QuickJSHandle {\n  readonly alive: boolean;\n}\nexport interface QuickJSContext {\n  dump(handle: QuickJSHandle): unknown;\n}\n";
const MEMBRANE_PRELUDE =
  'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\n' +
  "export function handleSafeToDump(ctx: QuickJSContext, handle: QuickJSHandle): boolean {\n  return handle.alive && ctx !== undefined;\n}\n";
/** The membrane repair: the package door, the guard DECLARED in the membrane's own module (the final reads
 *  the declaration, the legacy read the name), and the fixture's placeholder types bound to the real
 *  surface. */
const MEMBRANE_REPAIR: Repair = {
  add: { "node_modules/quickjs-emscripten-core/index.d.ts": QUICKJS_SURFACE },
  prepend: { [MEMBRANE]: MEMBRANE_PRELUDE },
  replace: {
    [MEMBRANE]: [
      ["ctx: Ctx", "ctx: QuickJSContext"],
      ["handle: Handle", "handle: QuickJSHandle"],
    ],
  },
};
/** The same repair for the ONE row whose fixture takes a SECOND handle — the same-handle counterfactual. */
const MEMBRANE_REPAIR_TWO_HANDLES: Repair = {
  ...MEMBRANE_REPAIR,
  replace: {
    [MEMBRANE]: [
      ["ctx: Ctx", "ctx: QuickJSContext"],
      ["handle: Handle", "handle: QuickJSHandle"],
      ["other: Handle", "other: QuickJSHandle"],
    ],
  },
};
/** The identity-home repair for `turn-identity`: plant the canonical declaration and spell the door the way
 *  the module's own rows spell it. */
const IDENTITY_REPAIR: Repair = {
  add: { "packages/contracts/src/identity/index.ts": "export interface Principal {\n  readonly userId: string;\n}\n" },
  replace: {
    "packages/server/src/domain/chat/engine/a.ts": [['"@orb/contracts/identity"', '"../../../../../contracts/src/identity/index.ts"']],
  },
};

test(
  "plugin-dump-guard: all five ordering catches survive on the typed twin, the raw fixtures REFUSE, and the finalize arm has ZERO legacy coverage",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, DUMP_BASE, "tooling/src/verify/gates/plugin-dump-guard.ts");
    const legacyDump = (line: number): string => `legacy | ${MEMBRANE}:${line} | dump | a QuickJS membrane \`ctx.dump\` can materialize `;
    const finalDump = (line: number): string => `plugin-dump-guard | ${MEMBRANE}:${line} | dump | a QuickJS membrane \`ctx.dump\` can materialize `;
    const compared = runScenarios(legacy, [pluginDumpGuard], MEMBRANE, [
      {
        why: "mustFlag[0] the founding bypass — a raw `ctx.dump` outside the canonical helper",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [legacyDump(1)],
        final: [],
        finalErrors: [NO_DUMP_SITES],
        repair: MEMBRANE_REPAIR,
        twinFinalPopulation: 1,
        twinFinal: [finalDump(5)],
      },
      {
        why: "mustFlag[1] PRESENCE IS NOT ORDERING — a guard AFTER the dump. The exact control-flow predicate the #1986 row worried about, identical on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [legacyDump(1)],
        final: [],
        finalErrors: [NO_DUMP_SITES],
        repair: MEMBRANE_REPAIR,
        twinFinalPopulation: 1,
        twinFinal: [finalDump(5)],
      },
      {
        why: "mustFlag[2] the guard's false result IGNORED — identical on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [legacyDump(1)],
        final: [],
        finalErrors: [NO_DUMP_SITES],
        repair: MEMBRANE_REPAIR,
        twinFinalPopulation: 1,
        twinFinal: [finalDump(5)],
      },
      {
        why: "mustFlag[3] the guard judges a DIFFERENT handle — the same-handle/same-context arm, identical on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [legacyDump(1)],
        final: [],
        finalErrors: [NO_DUMP_SITES],
        repair: MEMBRANE_REPAIR_TWO_HANDLES,
        twinFinalPopulation: 1,
        twinFinal: [finalDump(5)],
      },
      {
        why: "mustFlag[4] a NESTED conditional return that exits only one unsafe path — the `alwaysExits` arm, identical on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [legacyDump(1)],
        final: [],
        finalErrors: [NO_DUMP_SITES],
        repair: MEMBRANE_REPAIR,
        twinFinalPopulation: 1,
        twinFinal: [finalDump(5)],
      },
      {
        why: "mustPass[0] the canonical guarded helper — silent on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [NO_DUMP_SITES],
        repair: MEMBRANE_REPAIR,
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[1] nested diagnostics with an unconditional exit — silent on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [NO_DUMP_SITES],
        repair: MEMBRANE_REPAIR,
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[2] a dump OUTSIDE the membrane file. The legacy expressed this as a `scanRoot` that admitted the whole plugin-host dir plus an in-visit `isMembraneSource` filter; the final expresses the same fence as a population `under: plugin-host/**` plus the same filter. Both admit the file and both stay silent, so the fence is preserved rather than widened",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [NO_DUMP_SITES],
      },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);

    // THE ZERO-COVERAGE STATEMENT, asserted rather than asserted-about. The legacy `finalize` arm reported
    // "zero membrane dump sites — the boundary moved or the gate is blind" only when the real membrane file
    // was LOADED and produced no dump site. NOT ONE legacy example puts the membrane in the project without
    // a dump call, so replaying the legacy corpus exercises that arm exactly ZERO times. This block proves
    // the count is zero rather than claiming it, and then drives the arm's own trigger condition through
    // BOTH engines — which is the successor proof §4.6 asks for where replay cannot reach.
    const blindnessCorpus = { [MEMBRANE]: "export function nothing(): void {}\n" };
    const legacyBlind = legacyReplay(legacy, blindnessCorpus, label);
    expect(
      [...legacy.mustFlag, ...legacy.mustPass].filter((example) => {
        const files = typeof example.files === "string" ? { [example.at ?? MEMBRANE]: example.files } : example.files;
        return Object.keys(files).some((path) => path.endsWith("membrane.ts")) && !Object.values(files).some((source) => source.includes("dump"));
      }).length,
      "LEGACY-SIDE COVERAGE of the finalize blindness arm — zero, which is why it is CONSTRUCTED below rather than replayed",
    ).toBe(0);
    expect(legacyBlind.findings, "the legacy blindness arm, driven from its own trigger condition").toEqual([
      "legacy | tooling/src/verify/gates/plugin-dump-guard.ts:1 | - | plugin-dump-guard found zero membrane dump sit",
    ]);
    const finalBlind = finalReplay([pluginDumpGuard], blindnessCorpus, label);
    expect(
      [...finalBlind.findings, ...finalBlind.toolErrors].length,
      "THE SUCCESSOR MUST EXIST: a membrane that declares no dump site is still loud on the final engine — either as a finding or as a refusal. A silent zero here would be the catch regression this whole file exists to detect",
    ).toBeGreaterThan(0);
  },
  TIMEOUT_MS,
);

// ─── 2. turn-identity (D16/D17/D19) ──────────────────────────────────────────────────────────────────
// FROZEN SHA `509671ae2` — `e5a7a8a8c^`, which is the module header's OWN claim, re-derived here rather
// than inherited: `git log` on the file names `0d83d99f1` as its most recent structural commit, and
// `0d83d99f1~1` ALREADY carries `defineGate`. The header's SHA is the one that holds a `GateDescriptor`.
const TURN_BASE = "509671ae2e013b6d07fe6f7e9e744e0d7cbac946";

test(
  "turn-identity: the vocabulary arm replays 1:1, the identity arm survives once its home resolves, and the engine/verb fence is unchanged",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, TURN_BASE, "tooling/src/verify/gates/turn-identity.ts");
    const compared = runScenarios(legacy, [turnIdentity], "packages/server/src/domain/chat/engine/x.ts", [
      {
        why: "mustFlag[0] a `Principal` NAMED IMPORT inside the engine — one finding on the import specifier, identical on both engines. Note what the legacy did NOT do: its Identifier arm banned only the lowercase spelling, so the `Principal` type annotation on line 2 was never a second accusation",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/server/src/domain/chat/engine/a.ts:1 | Principal | the chat engine is Principal-BLIND (D19 turn-i"],
        final: [],
        repair: IDENTITY_REPAIR,
        twinFinalPopulation: 1,
        twinFinal: ["turn-identity | packages/server/src/domain/chat/engine/a.ts:1 | Principal | the chat engine is Principal-BLIND (D19 turn-i"],
      },
      {
        why: "mustFlag[1] a lowercase `principal` identifier inside the engine — byte-identical on both engines, same line, same token",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/server/src/domain/chat/engine/b.ts:1 | principal | the chat engine is Principal-BLIND (D19 turn-i"],
        final: ["turn-identity | packages/server/src/domain/chat/engine/b.ts:1 | principal | the chat engine is Principal-BLIND (D19 turn-i"],
      },
      {
        why: "mustPass[0] THE POPULATION FENCE: the same `principal` identifier in a VERB. The legacy fenced with `scanRoot: ENGINE_ANCHORED`, the final with a population expression; both admit zero paths from a verb-only fixture, which is why the FINAL side is a `[population]` tool error rather than a silent zero — §4.8's refusal replacing the legacy's silence",
        legacyPopulation: 0,
        finalPopulation: 0,
        legacy: [],
        final: [],
        finalErrors: ["turn-identity/population: Invalid population resolution: expression admitted zero paths from 1 candidate(s)"],
      },
      {
        why: "mustPass[1] the same fence for the `Principal` IMPORT in a verb — same classification",
        legacyPopulation: 0,
        finalPopulation: 0,
        legacy: [],
        final: [],
        finalErrors: ["turn-identity/population: Invalid population resolution: expression admitted zero paths from 1 candidate(s)"],
      },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);

    // CONSTRUCTED: the legacy corpus exercises each arm exactly once and never together, so nothing in it
    // proves the two arms stayed INDEPENDENT across the conversion. A file that names `principal` without
    // importing `Principal` isolates the identifier arm on both engines.
    const identifierOnly = { "packages/server/src/domain/chat/engine/a.ts": "export const principal = 1;\n" };
    expect(legacyReplay(legacy, identifierOnly, label).findings.length, "the identifier arm alone, LEGACY").toBe(1);
    expect(finalReplay([turnIdentity], identifierOnly, label).findings.length, "the identifier arm alone, FINAL — the duplicate is gone, the arm is not").toBe(
      1,
    );
  },
  TIMEOUT_MS,
);

// ─── 3. THE SHARED HARNESS'S IN-MEMORY-ONLY REFUSAL (#2119) ──────────────────────────────────────────
// `tests/support/legacy-differential.ts` replays BOTH engines over `useInMemoryFileSystem: true`, so a
// legacy gate that reads the real filesystem answers about the running checkout rather than about the
// fixture. That was verified harmless for the eleven blobs this repo replays — every one is a pure
// in-memory AST reader — which is precisely why it is now a REFUSAL and not a note in a header: the next
// caller to freeze a filesystem-reading descriptor would otherwise get a confident, wrong differential.
//
// THE CONTROL LIVES HERE, in the smaller of the harness's two callers, because the obligation belongs to
// the harness rather than to either differential and `tests/support/**` has no test mirror of its own.
test("the harness REFUSES a frozen legacy gate that reaches the real filesystem, and admits one that does not", async ({ scratch }) => {
  // Both directions on the predicate, one planted spelling at a time — a refusal nobody has seen fire is
  // a rubber stamp, and a scan nobody has seen stay silent is a rubber stamp in the other direction.
  expect(filesystemReach('import { Node } from "ts-morph";\nexport const gate = { name: "probe" };\n')).toEqual([]);
  for (const spelling of ["node:fs", "node:child_process", "readFileSync", "existsSync", "readdirSync", "process.cwd("]) {
    expect(filesystemReach(`const x = ${spelling};`), `the scan names ${spelling}`).toContain(spelling);
  }
  // AND END TO END, over REAL repository bytes rather than a hand-made string: the historical
  // `no-blanket-suppression` descriptor imports `existsSync`/`readFileSync` from `node:fs`, and the refusal
  // must fire before the module is ever shimmed or imported. Pinning the last filesystem-reaching form
  // keeps this harness control after the live policy moves the read behind ResourceHost.
  await expect(frozenLegacyGate(scratch, "cc4fdfc2a", "tooling/src/verify/gates/no-blanket-suppression.ts")).rejects.toThrow(/reaches the real filesystem/u);
  // The green twin, same door, same call shape: a pure AST reader is admitted.
  const admitted = await frozenLegacyGate(scratch, TURN_BASE, "tooling/src/verify/gates/turn-identity.ts");
  expect(admitted.name).toBe("turn-identity");
});
