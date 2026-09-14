// THE AUTHORING CONTROL for #1506 — a gate cannot ship the spelling hole.
//
// A gate's own conformance rows prove it bites THE SHAPE ITS AUTHOR WROTE. Nothing proved it bites the
// same semantics written another way, and 21 live gates were shown blind at once: `db["insert"]` walked
// past a `PropertyAccessExpression`-keyed detector, `import * as events; events.subscribeAllChatEvents`
// past an `ImportSpecifier`-keyed one. The derivation — respell each gate's own `mustFlag` fixture, feed it
// back through that gate's OWN proof door, collect the arms it stops biting under — lives in
// `tooling/src/verify/ops/spelling-twin-blindness.ts`; this file is its committed ledger and its controls.
//
// RE-EXPRESSED AGAINST THE MIXED CORPUS (#2031, 2026-09-12), and that is the whole repair. The derivation
// used to sit here and key on `loadGates()` — the LEGACY remnant ALONE (`lib/loader.ts:190`) — so every
// #1584 conversion shrank its subject silently. By the time it was read, **54 of the ledger's 79 names had
// converted**, the two-sided `toEqual` below was RED, and because the file contains no membership-shaped
// assertion anywhere, every membership-shaped census of "what breaks when a gate converts" missed it. It
// was covering ZERO converted policies while reading authoritative — an instrument that had stopped
// measuring and had not stopped speaking.
//
// WHY RE-EXPRESSED RATHER THAN RETIRED, since both were open. Retiring needs a NAMED SUCCESSOR and there is
// none: the #1506 property — "does this detector see the other spelling" — is still live for a final
// policy, which still authors its own node predicates even though its READERS are now shared. Re-pointing
// at another legacy carrier is the treadmill (a carrier in a `loadGates()` suite is LEGACY BY REQUIREMENT
// and perishes at the cutover); driving BOTH engines is not, because the final half is what survives it. At
// the cutover the legacy loop simply finds an empty list and this control keeps its subject.
//
// THE LEDGER IS TWO-SIDED AND SHRINK-ONLY (GATE-AUTHORING.md §4.8). A gate that becomes blind is RED even
// if it is new; a ledger row whose gate is no longer blind is RED ("delete the row"). The mint over the
// mixed corpus measured **47 blind gates of 245 examined, 52 skipped** — 40 of the old 74 rows GONE and
// every one of them EXAMINED rather than skipped (i.e. the conversions genuinely closed them), 13 final
// policies newly visible, 3 with a narrowed arm set. Those 13 are this mint's own named burn-down, the same
// posture #1506's mint took; what the control buys today is that the set cannot GROW.
//
// SHRINK RECEIPTS — each deleted arm NAMES THE READER CHANGE THAT CLOSED IT, so a later reader can tell a
// closed blind spot from a dropped one (2026-09-12, #2199). A row removed with "no longer reproduces" is
// indistinguishable from one somebody found inconvenient.
//   • `owner-scoped-writes` ["bracket","namespace"] → ["bracket"] — the NAMESPACE arm closed because
//     `lib/tenancy-read.ts#tableTargetOf` stopped requiring an Identifier node: a table named through
//     `import * as schema from "@orb/db"` now resolves by its EXPORTED MEMBER NAME (`namespacedTableName`),
//     and the acquitting half moved with it (`predicatesTableColumn` compares the receiver by TEXT, so a
//     correctly scoped namespace-spelled write is not falsely accused). Pinned by that gate's own
//     `mustPass` row at `tooling/src/verify/gates/owner-scoped-writes.ts:320-329` — the namespace-spelled,
//     CORRECTLY SCOPED write the gate must stay SILENT on — not by this ledger. **CORRECTED 2026-09-13
//     (#2233, cb-v-wave-5): this sentence read "that gate's own new namespace `mustFlag` row" and was
//     FALSE. A `mustFlag` can only ever make a gate LOUDER, so it structurally cannot pin an ACQUITTAL;
//     the row's own `why` says exactly that ("cut it and no mustFlag row moves, while this row reds"). The
//     commit credited with the repair, `eb51d4313`, never touched THIS file (4-file stat) — its last
//     toucher `a7d88287b` predates it — which is how a shrink receipt kept naming the wrong proof.** The
//     same hunk first added a paragraph claiming this suite calls `loadGates()` and so shrinks with every
//     conversion; it calls `loadMixedGateCorpus` at `:100` and the census drives BOTH engines. Deleted
//     2026-09-13 — the header 26 lines above already states the true premise, and a comment-honesty fix
//     that ships a new false comment is the disease.
//   • `owner-scoped-upserts` ["bracket","namespace"] → ["bracket"] — the SAME reader change, inherited: the
//     upsert half calls the same `tableTargetOf`. It was not a subject of the fix and is recorded here so the
//     shrink is not read as an unexplained disappearance.
//
// SHRINK RECEIPTS, 2026-09-14 (#2353, lane cb-2353-spelling-twins). The census had GROWN by six —
// `audit-client-tests`, `bus-payload-allowlist`, `knob-wire-coverage`, `no-manual-memo`,
// `query-freshness-coverage-debt` and `test-no-stubs` — and growth is never a ledger row, so all six were
// fixed at the READER that owns the question (`lib/test-call-shape.ts`, `lib/bus-payload-fact.ts`,
// `lib/knob-wire-fact.ts`, `lib/react-origin.ts`, `lib/query-freshness-fact.ts`), each pinned by a new
// `mustFlag` row carrying the respelled fixture and each acquitting side widened in the same commit. Nothing
// was added here. FOUR rows left the ledger, and each names what closed it:
//   • `finding-overload-provenance` — GONE, not fixed: the gate itself was retired at `4cb360a59` ("Retire
//     legacy Finding overload gate"), so the row promised blindness for a policy the corpus no longer loads.
//   • `no-legacy-react-api` ["bracket","namespace"] → ["namespace"] — closed at `474bd2b75`, BEFORE this
//     lane: `reactMemberCandidate` stopped asking `node.getText().includes("cloneElement")` and now asks
//     `referenceNamesExport` with an explicit `ElementAccessExpression` arm for the `Children` receiver.
//     Measured on the unmodified tree at `868eec0c5` before any edit in this lane, so the shrink is that
//     commit's, recorded here because it had not reached the ledger.
//   • `no-use-context` ["namespace"] → GONE — `lib/react-origin.ts#reactExportVisitors` gained its THIRD
//     door. A namespace import produces no `ImportSpecifier` and a bare `R.useContext` reference is no
//     `CallExpression`, so the reference reached no visitor at all; the member door subscribes
//     `MEMBER_ACCESS_KINDS` and is narrowed to reads naming the export. Pinned by that policy's own new
//     namespace `mustFlag` row, and the same door is what closed `no-manual-memo`.
//   • `query-freshness-coverage` ["bracket"] → GONE — `lib/query-freshness-fact.ts` reads every hop of the
//     `trpc.<router>.<proc>.<terminal>` chain through `readMemberAccess` on BOTH sides (the consumed read
//     and the seam's coverage filter), and `query-freshness-coverage`'s anchor stopped assuming the authored
//     text contains the dotted key. Pinned by that policy's new bracket `mustFlag` row AND by its new
//     bracket-seam `mustPass` row, which is the acquitting half.
// Both gates keep their BRACKET arm: the chain readers (`chainCalls`, `isDrizzleWriteStatement`) are still
// property-access-keyed, which is committed, measured blindness rather than growth.
//
// The remedy for a red is never a ledger row: it is `tooling/src/verify/lib/symbol-reference.ts`
// (`readMemberAccess` / `moduleMemberReference` / `readStringConstant`), which resolves a reference however
// it is spelled.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy, GatePolicyProof } from "../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../tooling/src/verify/contract/policy.ts";
import type { SpellingBlindSet } from "../../tooling/src/verify/contract/spelling-twin-blindness.ts";
import { verifyGateProofs } from "../../tooling/src/verify/index.ts";
import { loadMixedGateCorpus } from "../../tooling/src/verify/lib/loader.ts";
import { verifyPolicyProofs } from "../../tooling/src/verify/ops/policy-conformance.ts";
import { spellingTwinCensus } from "../../tooling/src/verify/ops/spelling-twin-blindness.ts";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const LEDGER_REL = "tests/tooling/gate-spelling-twins.baseline.json";
const REGEN = `the ledger is hand-maintained: paste the JSON printed below into ${LEDGER_REL} and run pnpm exec biome format --write on it (biome collapses the short arrays; this test parses the file, so the format is free). Do that ONLY to record a SHRINK — a gate that became blind is a defect to fix in tooling/src/verify/lib/symbol-reference.ts, never a new row.`;

/** LOAD-HONEST BUDGET, same reasoning as gate-conformance.int: this drives the respelled proofs of BOTH
 *  engines in-process — pure CPU with no child process to hang a legible timeout on. Measured 2026-09-12 on
 *  the mixed corpus at ~100s wall (245 gates examined), so the base is ~2.5× the measurement rather than the
 *  120s the legacy-only sweep needed. */
const TWIN_BUDGET = scaledBudget(240_000, 4);

/** The one anti-vacuum floor: a census over an empty corpus produces an empty blind set and would satisfy
 *  the `toEqual` below trivially. Stated as an EXAMINED count, never as a named gate (perishable — that is
 *  exactly what rotted) and never as a count ceiling (a countdown wearing a gate's clothes). */
const MINIMUM_EXAMINED = 200;

/** The census's scratch parser is the CALLER'S, and it is constructed here rather than in the op because
 *  `tooling-project-home` makes one ts-morph loader the law under `tooling/src/**` — a second workspace walk
 *  there would owe a reviewed grant for a Project a test can simply hand over. `tests/` is outside that
 *  policy's population. One fresh parser per census so no arm inherits another's source files. */
function scratchParser(): Project {
  return new Project({ useInMemoryFileSystem: true });
}

test("no gate is blind to a respelling of its own mustFlag fixture beyond the committed, shrink-only ledger", { timeout: TWIN_BUDGET }, async () => {
  const corpus = await loadMixedGateCorpus(ROOT);
  const ledger = JSON.parse(readFileSync(join(ROOT, LEDGER_REL), "utf8")) as { readonly blind: SpellingBlindSet };
  const census = spellingTwinCensus(corpus, scratchParser());

  // The bite-proof is vacuous over an empty corpus, so the subject is asserted before the verdict is read.
  expect(census.examined, "the twin census examined almost nothing — the loader, not the tree, is the finding").toBeGreaterThan(MINIMUM_EXAMINED);
  // …and a SKIP must never read as a shrink: every declared limit is named with its reason, so a row that
  // vanished because its gate stopped being reachable is distinguishable from one that was fixed.
  expect(census.skipped.filter(({ reason }) => reason.trim() === "")).toEqual([]);

  // A blind gate absent from the ledger = a NEW hole (fix it with lib/symbol-reference.ts, never a row).
  // A ledger row whose gate is no longer blind = a stale promise (delete it). `toEqual` reds on both.
  expect(census.blind, `${REGEN}\n${JSON.stringify({ blind: census.blind }, null, 2)}`).toEqual(ledger.blind);
});

const CONTROL_MUST_FLAG = "export const a = (db: Record<string, unknown>) => db.forbidden;\n";
const CONTROL_MUST_PASS = "export const a = (db: Record<string, unknown>) => db.allowed;\n";

test("THE PLANTED CONTROL, LEGACY side: an un-migrated descriptor is detected blind, and the migrated spelling is not", () => {
  const base = {
    docRow: "test fixture",
    status: "active",
    scopeSafety: "incremental-safe",
    message: "test fixture: a `.forbidden` member read",
    mustFlag: [{ files: CONTROL_MUST_FLAG, why: "the dotted spelling" }],
    mustPass: [],
  } as const;

  // (1) The naive detector — `PropertyAccessExpression.getName()`, the exact shape #1506 found in 21 gates.
  const naive: GateDescriptor = {
    ...base,
    name: "twin-control-naive",
    kinds: [SyntaxKind.PropertyAccessExpression],
    visit: (node, _sf, ctx) => {
      if (node.isKind(SyntaxKind.PropertyAccessExpression) && node.getName() === "forbidden") {
        ctx.report(node);
      }
    },
  };
  // (2) The same law read through the shared resolver — both member kinds subscribed.
  const migrated: GateDescriptor = {
    ...base,
    name: "twin-control-migrated",
    kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
    visit: (node, _sf, ctx) => {
      if (node.isKind(SyntaxKind.PropertyAccessExpression) && node.getName() === "forbidden") {
        ctx.report(node);
        return;
      }
      if (node.isKind(SyntaxKind.ElementAccessExpression) && node.getArgumentExpression()?.getText() === '"forbidden"') {
        ctx.report(node);
      }
    },
  };

  // Both gates prove themselves on the DOTTED fixture — the control is honest only if they start equal.
  expect(verifyGateProofs([naive])).toEqual([]);
  expect(verifyGateProofs([migrated])).toEqual([]);

  const census = spellingTwinCensus({ legacy: [naive, migrated], final: [] }, scratchParser());
  expect(census.blind).toEqual({ "twin-control-naive": ["bracket"] });
  expect({ examined: census.examined, skipped: census.skipped }).toEqual({ examined: 2, skipped: [] });
});

/** The minimum honest `defineGate` shape for a control: one visitor, one law, both proof arms. */
function controlPolicy(id: string, kinds: readonly SyntaxKind[], detect: (text: string) => boolean, grantProofs?: readonly GatePolicyProof[]): GatePolicy {
  return defineGate({
    id,
    family: id,
    authority: grantProofs === undefined ? "ordinary" : "reviewed-grant",
    severity: "error",
    population: { in: ["@ui"] },
    analysis: "syntax",
    execution: "entire-population",
    facts: [],
    resources: [],
    message: "test fixture: a `.forbidden` member read",
    fix: "read the member through lib/symbol-reference.ts",
    // THE CONTROL COLLECTS IN THE WALK AND REPORTS IN `evaluate`, and that shape is forced rather than
    // decorative (#2199). `execution: "entire-population"` is a CLAIM that the verdict cannot compose over a
    // subset, and #2111's A21 check refuses a policy making that claim with no post-walk hook at all — so
    // this fixture, authored before A21 landed, stopped being a control and became a TOOL ERROR: both proof
    // arms came back `PASS TOOL ERROR [create] … exposes no evaluate hook`, which the census then reported as
    // "not blind" for the very policy planted to be blind. The fixture was stale; the validator is right, and
    // is deliberately left alone. Reporting from `evaluate` is the arm that gives the control the hook the
    // ruling asks for WITHOUT leaving a composition claim with nothing behind it — and it exercises the
    // post-walk reporting path that most converted policies actually use.
    create: (ctx) => {
      const hits: Node[] = [];
      return {
        visitors: [
          {
            kinds,
            visit: (node) => {
              if (detect(node.getText())) {
                hits.push(node);
              }
            },
          },
        ],
        evaluate: () => {
          for (const node of hits) {
            ctx.report.node(node, grantProofs === undefined ? {} : { subject: ctx.relativePath(node.getSourceFile()), operation: "forbidden-read" });
          }
        },
      };
    },
    mustFlag: grantProofs ?? [{ mode: "source", files: { "packages/ui/src/x.ts": CONTROL_MUST_FLAG }, why: "the dotted spelling" }],
    mustPass: [{ mode: "source", files: { "packages/ui/src/x.ts": CONTROL_MUST_PASS }, why: "a member this law does not name" }],
  } as GatePolicy);
}

test("THE PLANTED CONTROL, FINAL side: the same blindness is detected on a defineGate policy, and the migrated spelling is not", () => {
  // This is the arm #2031 ADDED, so it owes its own planted break rather than inheriting the legacy one:
  // the final engine has a different dispatcher, a different proof runner and a `mustPass`-may-not-be-empty
  // rule, any of which could make the census silently answer "nothing is blind" for all 237 policies.
  const naive = controlPolicy("twin-control-final-naive", [SyntaxKind.PropertyAccessExpression], (text) => text.endsWith(".forbidden"));
  const migrated = controlPolicy(
    "twin-control-final-migrated",
    [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
    (text) => text.endsWith(".forbidden") || text.endsWith('["forbidden"]'),
  );

  // Both policies prove themselves on the DOTTED fixture first — equal start, or the control proves nothing.
  expect(verifyPolicyProofs([naive])).toEqual([]);
  expect(verifyPolicyProofs([migrated])).toEqual([]);

  const census = spellingTwinCensus({ legacy: [], final: [naive, migrated] }, scratchParser());
  expect(census.blind).toEqual({ "twin-control-final-naive": ["bracket"] });
  expect({ examined: census.examined, skipped: census.skipped }).toEqual({ examined: 2, skipped: [] });
});

/** The annotated arm respells the witness itself; the unannotated arm has a separate, already-bracketed
 * witness with no twin. Both must reach detection without borrowing an identity for the respelled row. */
function reviewedGrantControl(id: string, sourceRow: "annotated" | "unannotated", seesBracket: boolean, operation = "forbidden-read"): GatePolicy {
  const witness: GatePolicyProof = {
    mode: "source",
    files: {
      "packages/ui/src/witness.ts": sourceRow === "annotated" ? CONTROL_MUST_FLAG : 'export const a = (db: Record<string, unknown>) => db["witness"];\n',
    },
    grant: { subject: "packages/ui/src/witness.ts", operation },
    expect: { count: 1 },
    why: "an authored exact identity must grant the original finding",
  };
  return controlPolicy(
    id,
    [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
    (text) => text.endsWith('["witness"]') || text.endsWith(".forbidden") || (seesBracket && text.endsWith('["forbidden"]')),
    sourceRow === "annotated"
      ? [witness]
      : [witness, { mode: "source", files: { "packages/ui/src/x.ts": CONTROL_MUST_FLAG }, why: "a different, unannotated dotted finding" }],
  );
}

for (const sourceRow of ["annotated", "unannotated"] as const) {
  test(`reviewed-grant twins: ${sourceRow} source rows still distinguish blind and clean detectors`, () => {
    const naive = reviewedGrantControl(`twin-grant-${sourceRow}-naive`, sourceRow, false);
    const migrated = reviewedGrantControl(`twin-grant-${sourceRow}-migrated`, sourceRow, true);
    expect(verifyPolicyProofs([naive, migrated])).toEqual([]);
    const census = spellingTwinCensus({ legacy: [], final: [naive, migrated] }, scratchParser());
    expect(census).toEqual({ blind: { [naive.id]: ["bracket"] }, examined: 2, skipped: [] });
  });
}

for (const phase of ["baseline", "grant"] as const) {
  test(`reviewed-grant twins: a supporting witness ${phase} failure refuses the census instead of becoming blindness or a clean result`, () => {
    const base = reviewedGrantControl(`twin-grant-broken-${phase}`, "unannotated", true, phase === "grant" ? "wrong-operation" : "forbidden-read");
    const broken = defineGate({
      ...base,
      mustFlag: base.mustFlag.map((proof, index) => (phase === "baseline" && index === 0 ? { ...proof, expect: { count: 2 } } : proof)),
    } as GatePolicy);
    const failures = verifyPolicyProofs([broken]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ arm: "mustFlag", exampleIndex: 0 });
    expect(() => spellingTwinCensus({ legacy: [], final: [broken] }, scratchParser())).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("supporting proof"),
        cause: expect.objectContaining({ policyId: broken.id, arm: "mustFlag", exampleIndex: 1, detail: failures[0]?.detail }),
      }),
    );
  });
}

test("reviewed-grant twins: a missing authored witness remains an invalid descriptor", () => {
  const missing = controlPolicy("twin-grant-missing-witness", [SyntaxKind.PropertyAccessExpression], (text) => text.endsWith(".forbidden"), [
    { mode: "source", files: { "packages/ui/src/x.ts": CONTROL_MUST_FLAG }, why: "a finding without an authored grant identity" },
  ]);
  expect(() => verifyPolicyProofs([missing])).toThrow("carries no grant identity witness");
  expect(() => spellingTwinCensus({ legacy: [], final: [missing] }, scratchParser())).toThrow("carries no grant identity witness");
});

for (const arm of ["mustPass", "mustRefuse"] as const) {
  test(`final twins: a broken inherited ${arm} row refuses even when the detector sees the twin`, () => {
    const base = controlPolicy(
      `twin-inherited-${arm.toLowerCase()}`,
      [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
      (text) => text.endsWith(".forbidden") || text.endsWith('["forbidden"]'),
    );
    const refusal = "the twin control requires a readable subject";
    const refusalProof: GatePolicyProof = {
      mode: "source",
      files: { "packages/ui/src/refusal.ts": CONTROL_MUST_PASS },
      expect: { messageIncludes: refusal },
      why: "the policy deliberately refuses its unreadable subject",
    };
    const valid = defineGate({
      ...base,
      create: (ctx) => {
        if (ctx.files.some((file) => ctx.relativePath(file) === "packages/ui/src/refusal.ts")) {
          throw new Error(refusal);
        }
        return base.create(ctx);
      },
      mustRefuse: [refusalProof],
    } as GatePolicy);
    expect(verifyPolicyProofs([valid])).toEqual([]);
    expect(spellingTwinCensus({ legacy: [], final: [valid] }, scratchParser())).toEqual({ blind: {}, examined: 1, skipped: [] });

    const broken = defineGate({
      ...valid,
      ...(arm === "mustPass"
        ? { mustPass: [{ mode: "source", files: { "packages/ui/src/x.ts": CONTROL_MUST_FLAG }, why: "a finding contradicts this passing proof" }] }
        : { mustRefuse: [{ ...refusalProof, files: { "packages/ui/src/x.ts": CONTROL_MUST_PASS } }] }),
    } as GatePolicy);
    const failures = verifyPolicyProofs([broken]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ policyId: broken.id, arm, exampleIndex: 0 });
    expect(() => spellingTwinCensus({ legacy: [], final: [broken] }, scratchParser())).toThrow(
      expect.objectContaining({ message: expect.stringContaining("supporting proof"), cause: failures[0] }),
    );
  });
}
