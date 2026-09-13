// THE §4.6 CONVERSION DIFFERENTIAL FOR `no-color-literals` — #2273, lane cb-x-46-records.
//
// WHY IT IS A REPLAY AND NOT A CLOSE-BY-RULE ROW, MEASURED RATHER THAN ASSUMED. `no-color-literals`
// converted at `99b7429e2` (#1917) and is on no roster; `tier3-close-by-rule.test.ts`'s membership test
// refuses it on EXACTLY ONE clause, and it is clause 6's LABEL half. Re-running that file's own regexes
// over the two blobs: all twelve legacy fixture payload literals are carried byte-for-byte, five of six
// legacy `why` strings are carried verbatim, and the sixth — `mustPass[1]`'s semantic-token row — was
// re-authored. Every other clause passes (no `defineGate` at the parent, no `finalize`, no
// `ExemptionTable`, no shared `lib/` reader, no type checker, no `scanRoot` negation; the final is
// `analysis: "syntax"` with `facts: []` and `resources: []`). So the "conformance already runs the legacy
// corpus" argument is one `why` string short, and the module owes the replay instead. Its sibling
// `no-raw-container-widths`, converted in the same commit, IS on that roster. Until this file existed the
// module had no §4.6 evidence of any kind (`cb-v-wave-8b`,
// `docs/reviews/gate-runtime/v-wave-8b-2026-09-13.md:498`). A REPLAY IS STRICTLY STRONGER THAN THE ROSTER
// ROW WOULD HAVE BEEN, so re-authoring that `why` back to buy membership would be a downgrade; do not.
//
// THE LEGACY SIDE IS NONZERO — 5 findings across 4 of its 6 examples — so this is neither of guide §4.6's
// two vacuity shapes, and the shared harness ACCEPTS the frozen descriptor: `filesystemReach` on the
// `d6f36904f` blob is EMPTY (asserted below, with the same reader's planted positive control), so the
// in-memory replay #2119 requires is faithful here. That is the property the `grant-liveness` pair does
// NOT have, which is why their §4.6 records are real-tree drives instead of this.
//
// THE RESULT, and the one difference is a STRENGTHENING that nobody had recorded. Position, token, count
// and population match on all six examples, both tool-error sets are empty — and every legacy finding
// carries `MESSAGE_HEX` even when the arm that fired was the palette or black/white arm. That is not the
// #1991 policy-level-message story: `lib/pass.ts:243`'s NODE report path pushes `{file, line, column,
// token}` and structurally DISCARDS a message, so the legacy module's `MESSAGE_PALETTE` and
// `MESSAGE_NON_TOKEN` were UNREACHABLE dead text on every real finding it ever emitted. The final policy
// reports all three arms distinctly. The class is EMPTY on today's legacy roster: a two-method census of
// the 39 surviving legacy gate modules (an inline `report(node, { … message: … })` literal, and a
// reported hit VARIABLE whose type declares `readonly message: string`) returns zero, with this frozen
// blob as the positive control that finds the shape.
//
// The replay machinery, the line-anchored import shim and the in-memory-only refusal live in
// `tests/support/legacy-differential.ts`; read its header before changing anything here.
import { gate as noColorLiterals } from "../../../../tooling/src/verify/gates/no-color-literals.ts";
import { createDifferential, filesystemReach, frozenLegacyGate } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** The parent of the conversion commit `99b7429e2`. Verified: it holds a `GateDescriptor` named
 *  `no-color-literals`, and that commit did not split the module (one descriptor in, one policy out). */
const BASE = "d6f36904f";
const LEGACY_PATH = "tooling/src/verify/gates/no-color-literals.ts";
/** Never used — every legacy example carries its own `at`. Named so a dropped `at` is visible, not silent. */
const FALLBACK = "packages/client/src/__no-example-at__.tsx";

/** TOTAL: an unrecognised tool-error shape THROWS rather than being absorbed into a code. */
function toolErrorCode(owner: string, phase: string, message: string): string {
  return `${owner}/${phase}: ${message}`;
}

const { runScenarios } = createDifferential("/no-color-literals-parity", toolErrorCode);

// `label` compares the first 46 characters of the message, which is exactly where these four diverge.
const LEGACY_MESSAGE = "arbitrary hex color in className/cn() — use a ";
const FINAL_HEX = "arbitrary hex color class (…-[#rrggbb]) — use ";
const FINAL_NON_TOKEN = "named non-token color class (bg-black/bg-white";
const FINAL_PALETTE = "Tailwind PALETTE-scale color class (e.g. text-";

/** Every legacy finding, whatever arm fired, at line 1 of its own fixture. */
function legacyHit(file: string, token: string): string {
  return `legacy | ${file}:1 | ${token} | ${LEGACY_MESSAGE}`;
}
function finalHit(file: string, token: string, message: string): string {
  return `no-color-literals | ${file}:1 | ${token} | ${message}`;
}

const HEX = "packages/client/src/x.tsx";
const BLACK = "packages/ui/src/x.tsx";
const PALETTE = "packages/client/src/palette.tsx";
const MULTI = "packages/ui/src/palette-multi.tsx";

test(
  "the frozen legacy descriptor is replayable IN MEMORY — the property the grant-liveness pair lacks",
  async ({ scratch }) => {
    const source = "import { SyntaxKind } from 'ts-morph';\nexport const gate = { name: 'x' };\n";
    expect(filesystemReach(source), "the reach reader's own clean control").toEqual([]);
    expect(filesystemReach(`${source}import { existsSync } from "node:fs";\n`), "…and its dirty control, so the empty above is a measurement").toEqual([
      "node:fs",
      "existsSync",
    ]);
    // `frozenLegacyGate` THROWS on any filesystem reach (#2119). Reaching a descriptor at all is the proof.
    const legacy = await frozenLegacyGate(scratch, BASE, LEGACY_PATH);
    expect(legacy.name).toBe("no-color-literals");
    expect([...legacy.mustFlag, ...legacy.mustPass]).toHaveLength(6);
  },
  scaledBudget(120_000),
);

test(
  "§4.6 — findings, populations and tool errors over all six legacy examples: identical but for three arm messages the legacy runtime could never emit",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, BASE, LEGACY_PATH);
    const compared = runScenarios(legacy, [noColorLiterals], FALLBACK, [
      {
        why: "mustFlag[0] the founding hex row — the ONE arm whose message the legacy gate happened to emit correctly, because the gate-level `message` WAS `MESSAGE_HEX`",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [legacyHit(HEX, "text-[#abc]")],
        final: [finalHit(HEX, "text-[#abc]", FINAL_HEX)],
      },
      {
        why: "mustFlag[1] the black/white arm — same node, same token, and the legacy finding carries the HEX remedy because lib/pass.ts:243 discards a per-finding message",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [legacyHit(BLACK, "bg-black")],
        final: [finalHit(BLACK, "bg-black", FINAL_NON_TOKEN)],
      },
      {
        why: "mustFlag[2] the palette arm — likewise; MESSAGE_PALETTE existed in the legacy module and reached no finding",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [legacyHit(PALETTE, "text-red-500")],
        final: [finalHit(PALETTE, "text-red-500", FINAL_PALETTE)],
      },
      {
        why: "mustFlag[3] one finding PER offending fragment — the per-token split is byte-identical across the conversion (`bannedColorTokens` is unchanged), including the opacity suffix on the reported position",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [legacyHit(MULTI, "bg-blue-300/50"), legacyHit(MULTI, "ring-emerald-600")],
        final: [finalHit(MULTI, "bg-blue-300/50", FINAL_PALETTE), finalHit(MULTI, "ring-emerald-600", FINAL_PALETTE)],
      },
      {
        why: "mustPass[0] a design token stays silent on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
      },
      {
        why: "mustPass[1] semantic tokens with no numeric ramp step stay silent on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
      },
    ]);
    expect(compared, "every legacy example is compared — a dropped row would otherwise be silent").toBe(6);
  },
  scaledBudget(120_000),
);
