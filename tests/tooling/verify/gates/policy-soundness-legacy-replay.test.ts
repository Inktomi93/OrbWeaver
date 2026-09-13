// THE §4.6 CONVERSION DIFFERENTIAL FOR THE `policy-soundness` FAMILY — and the family is ONE replayable
// module, not ten (#2319, family 2).
//
// THE REFUSAL FIRST, BECAUSE IT IS NINE TENTHS OF THIS FAMILY. `policy-soundness` has ten members. NINE of
// them were BORN FINAL: no legacy `GateDescriptor` ever existed at their paths, so there is no corpus to
// replay and a §4.6 differential over them is STRUCTURALLY IMPOSSIBLE rather than merely unwritten. That is
// asserted below against git history rather than inherited from the modules' own headers — a header claim
// is a hypothesis that ages, and this one is ALREADY one stale (`diagnostic-legibility.ts:31` says "the
// other eight" where the tree says nine). The arm carries its own planted positive control, because a
// history query that returns zero for nine paths is worthless without proof it can return non-zero.
//
// THE ONE CONVERSION is `diagnostic-legibility`, converted at `1e81658b4` (legacy base `d07338082`, the
// parent). It goes through the IN-MEMORY door, not the real-tmpdir door built for #2319's family 1: its
// frozen descriptor carries ZERO filesystem-reach spellings and no `fsBacked`, so it is a pure AST reader
// and `frozenFilesystemLegacyGate` would (correctly) refuse it. Routing is a measured property of the blob,
// never a property of the family it sits in.
//
// THE SELF-SCANNING TRAP, HANDLED RATHER THAN ASSUMED AWAY. This gate's `scanRoot` IS
// `tooling/src/verify/gates/` — the `pd-citation-integrity` shape §4.6 warns about, where an unfenced
// real-corpus replay eats the module's own fixture strings and reports a confident wrong number. The
// fixture-level method is immune BY CONSTRUCTION: every example's file map lands on its own virtual root
// and the real corpus is never in scope. The proof is in the table — each row's population is 1, the single
// file the example plants.
//
// WHAT IT FOUND. Three rows are ANCHOR MOVES (§4.6 category 6) that the conversion made deliberately and
// the module's header records: the legacy finding was a synthetic file-anchored `{file, line, column: 0}`
// with NO token, which `locateFinding` could not bind — so the legacy gate had no working waiver door at
// all — and the final re-anchors on the property assignment, gaining the position token (`message`,
// `message`, `verb`). Nothing was orphaned by the move because nothing could bind to the old anchor. One
// row is a MARKER VOCABULARY port (§4.6 category 3): the private `// terse-ok:` grammar is retired under
// §12.5 and the legacy fixture carrying it now REPORTS, with the ported twin proving the successor
// `@orb-waive diagnostic-legibility(message)` silences it — declared with both numbers, never silently.
import { execFileSync } from "node:child_process";
import { gate as diagnosticLegibility } from "../../../../tooling/src/verify/gates/diagnostic-legibility.ts";
import type { DifferentialClaim, Files, Scenario } from "../../../support/legacy-differential.ts";
import {
  createDifferential,
  differentialViolations,
  frozenLegacyGate,
  inMemorySide,
  label,
  legacyScenarios,
  repairedFiles,
} from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** The parent of `1e81658b4`, the commit that converted this module. */
const LEGACY_BASE = "d07338082";
const LEGACY_PATH = "tooling/src/verify/gates/diagnostic-legibility.ts";
/** Never used — every legacy example carries a full `files` MAP. Named so a dropped map is visible. */
const FALLBACK = "tooling/src/verify/gates/__no-example-files-map__.ts";

const GATE_X = "tooling/src/verify/gates/x.ts";
const GATE_TERSE = "tooling/src/verify/gates/terse.ts";

/** THE 46-CHARACTER MESSAGE HEADS the shared label compares in. A message edit that changes what the gate
 *  CLAIMS should red a parity table rather than silently re-baseline it. */
const LEGACY_POINTER = "diagnostic must carry a pointer — end the mess";
const FINAL_POINTER = "a gate/policy diagnostic carries no pointer — ";

/** TOTAL: an unrecognised tool-error shape THROWS rather than being absorbed into a code. */
function toolErrorCode(owner: string, phase: string, message: string): string {
  throw new Error(`unclassified refusal from ${owner}/${phase}: ${message}`);
}

function legacyAt(file: string, line: number): string {
  return `legacy | ${file}:${line} | - | ${LEGACY_POINTER}`;
}

function finalAt(file: string, line: number, token: string): string {
  return `diagnostic-legibility | ${file}:${line} | ${token} | ${FINAL_POINTER}`;
}

/** The §12.5 successor for the retired `// terse-ok:` grammar, in the exact spelling the final `fix` names:
 *  the position is the PROPERTY the diagnostic binds to, never the string. */
const WAIVE_LINE = "// @orb-waive diagnostic-legibility(message): the replay's stand-in reason; ends when this fixture stops flagging.\n";

/** Every legacy example, with the claim each row makes about its own two sides. The scenarios themselves go
 *  to `runScenarios` (which owns the numbers); the claims go to `differentialViolations` (which owns the
 *  label and the successor proof) — the same two checks family 1's rows get, through the same one home. */
const CLAIMS: readonly DifferentialClaim[] = [
  { classification: "anchor-move", successor: `${GATE_X}:1 | message` },
  { classification: "anchor-move", successor: `${GATE_X}:2 | message` },
  { classification: "anchor-move", successor: `${GATE_X}:1 | verb` },
  { classification: "vacuous-both-zero", successor: null },
  { classification: "stronger-reader", successor: `${GATE_TERSE}:3 | message` },
  { classification: "vacuous-both-zero", successor: null },
];

const SCENARIOS: readonly Scenario[] = [
  {
    why: "mustFlag[0] a bare gate `message:` with no pointer",
    legacy: [legacyAt(GATE_X, 1)],
    legacyPopulation: 1,
    final: [finalAt(GATE_X, 1, "message")],
    finalPopulation: 1,
  },
  {
    why: "mustFlag[1] a `message:` resolved one level through a same-file const",
    legacy: [legacyAt(GATE_X, 2)],
    legacyPopulation: 1,
    final: [finalAt(GATE_X, 2, "message")],
    finalPopulation: 1,
  },
  {
    why: "mustFlag[2] a pointerless value in a `const MSG` object table (the shorthand-`{ message }` idiom)",
    legacy: [legacyAt(GATE_X, 1)],
    legacyPopulation: 1,
    final: [finalAt(GATE_X, 1, "verb")],
    finalPopulation: 1,
  },
  {
    why: "mustPass[0] a message carrying a concrete code-home pointer — silent on BOTH engines",
    legacy: [],
    legacyPopulation: 1,
    final: [],
    finalPopulation: 1,
  },
  {
    // THE MARKER VOCABULARY PORT, DECLARED WITH BOTH NUMBERS. Raw (the legacy fixture, carrying the retired
    // `// terse-ok:` grammar): the final REPORTS it. Ported (the same fixture with the successor marker):
    // the final is silent. The `repair` is the port, and `runScenarios` proves it is INERT on the legacy
    // side — without that control the twin is simply a different example.
    why: "mustPass[1] the retired `// terse-ok:` escape — §12.5 marker vocabulary port, both numbers declared",
    legacy: [],
    legacyPopulation: 1,
    final: [finalAt(GATE_TERSE, 3, "message")],
    finalPopulation: 1,
    repair: { prepend: { [GATE_TERSE]: WAIVE_LINE } },
    twinFinal: [],
    twinFinalPopulation: 1,
  },
  {
    why: "mustPass[2] `tooling/` IS a code home — the pointer vocabulary survived the conversion",
    legacy: [],
    legacyPopulation: 1,
    final: [],
    finalPopulation: 1,
  },
];

test("§4.6 — diagnostic-legibility replays its whole legacy corpus, and every row's label is checked", { timeout: scaledBudget(120_000) }, async ({
  scratch,
}) => {
  const differential = createDifferential("/policy-soundness-replay", toolErrorCode);
  // `frozenLegacyGate` REFUSES a filesystem reader (#2119). Reaching a descriptor at all is the receipt
  // that this blob is the pure AST reader the in-memory door is for.
  const legacy = await frozenLegacyGate(scratch, LEGACY_BASE, LEGACY_PATH);
  expect(legacy.name, "the frozen blob is the LEGACY descriptor, not an already-converted policy").toBe("diagnostic-legibility");
  expect(differential.runScenarios(legacy, [diagnosticLegibility], FALLBACK, SCENARIOS)).toBe(6);

  // THE LABEL AND THE SUCCESSOR PROOF, through the SAME checker family 1's rows use. `runScenarios` above
  // owns the numbers; this owns what the numbers MEAN.
  const examples = legacyScenarios(legacy, FALLBACK);
  const violations = CLAIMS.flatMap((claim, index) => {
    const files = examples[index] as Files;
    const before = inMemorySide(differential.legacyReplay(legacy, files, label));
    const after = inMemorySide(differential.finalReplay([diagnosticLegibility], files, label));
    return differentialViolations(claim, before, after).map((violation) => `#${String(index)} ${violation}`);
  });
  expect(violations, "every row's classification and successor must agree with its measured sides").toEqual([]);
});

// ── THE REFUSAL, WITH ITS RECEIPT — nine tenths of this family ────────────────────────────────────────
// A `git log -S` returning zero over nine paths is "I could not measure" until something proves the query
// can return non-zero, so the control runs in the SAME invocation shape against two paths that DID hold a
// legacy descriptor. This pre-check is the standard first step of every family's replay report: it is what
// separates "no differential written" from "no differential POSSIBLE".

/** The nine `policy-soundness` members with no legacy ancestor. `diagnostic-legibility` is the tenth. */
const BORN_FINAL: readonly string[] = [
  "tooling/src/verify/gates/policy-binding-resolution.ts",
  "tooling/src/verify/gates/policy-family-readers.ts",
  "tooling/src/verify/gates/policy-fixture-substrate.ts",
  "tooling/src/verify/gates/policy-legacy-imports.ts",
  "tooling/src/verify/gates/policy-proof-expectations.ts",
  "tooling/src/verify/gates/policy-refusal-coverage.ts",
  "tooling/src/verify/gates/policy-soundness.ts",
  "tooling/src/verify/gates/policy-waiver-identity.ts",
  "tooling/src/verify/gates/policy-waiver-spelling.ts",
];

/** Commits that introduced or removed a legacy `gate: GateDescriptor` export at the given paths. */
function legacyDescriptorCommits(paths: readonly string[]): readonly string[] {
  const out = execFileSync("git", ["log", "--format=%h", "-S", "gate: GateDescriptor", "--", ...paths], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return out.trim() === "" ? [] : out.trim().split("\n");
}

test("§4.6 — nine of the ten policy-soundness members were BORN FINAL, so no differential is possible", () => {
  expect(legacyDescriptorCommits(BORN_FINAL), "no commit ever introduced a legacy descriptor at any of the nine").toEqual([]);
  // THE PLANTED POSITIVE CONTROL, same query shape: two paths that genuinely held one.
  expect(
    legacyDescriptorCommits([LEGACY_PATH, "tooling/src/verify/gates/biome-grant-liveness.ts"]).length,
    "the control — the query CAN find a legacy descriptor, so the zero above is an absence and not a broken search",
  ).toBeGreaterThan(0);
});

test("§4.6 — the ported `@orb-waive` twin is what silences the retired `terse-ok` fixture", { timeout: scaledBudget(120_000) }, async ({ scratch }) => {
  const differential = createDifferential("/policy-soundness-port", toolErrorCode);
  const legacy = await frozenLegacyGate(scratch, LEGACY_BASE, LEGACY_PATH);
  const raw = legacyScenarios(legacy, FALLBACK)[4] as Files;
  // The RAW legacy fixture still carries `// terse-ok:`, which is the whole point of the row.
  expect(raw[GATE_TERSE] ?? "", "the legacy fixture carries the RETIRED marker").toContain("// terse-ok:");
  const ported = repairedFiles(raw, { prepend: { [GATE_TERSE]: WAIVE_LINE } });
  expect(differential.finalReplay([diagnosticLegibility], raw, label).findings, "RAW: the retired grammar no longer escapes").toHaveLength(1);
  expect(differential.finalReplay([diagnosticLegibility], ported, label).findings, "PORTED: the §12.5 successor marker does escape").toEqual([]);
});
