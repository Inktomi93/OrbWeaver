// The GATE-AUTHORING.md §5 SIX-CASE REAL-TREE PROBE for the house suppression marker
// `// @orb-gate-ignore <gate>[(<position>)]: <reason>` — made permanent.
//
// Why this exists and why gate-conformance cannot replace it: conformance runs ONE gate standalone
// (tooling/src/verify/ops/conformance.ts `runGateStandalone`), so in a mini-project no SIBLING gate can ever consume
// a marker — every suppression-consumption verdict (STALE, OVER-EXEMPT) is unobservable there. This suite
// runs the REAL loaded gate corpus over the REAL workspace with planted `__g_` fixtures, which is the only
// substrate where "did the marker actually suppress, and how many things did it suppress" is answerable.
// The grammar itself (parse/malformed) is proven by conformance; the EXEMPTION VOCABULARY is proven here.
//
// The carrier is `query-machine-seals`: it is token-anchored and reports TWO DISTINCT TOKENS FROM ONE
// NODE — `import { useMutation, useInfiniteQuery } from "@tanstack/react-query"` is one ImportDeclaration
// carrying two separately-guarded things, which is the live shape that reproduces §4.3a's "one line, two
// guarded things" (`record(chatId: string, sessionId: string)`).
// The SCRIPTS side (2026-08-08) probes the same vocabulary inside the gate corpus — the same carrier,
// whose `scanRoot: () => true` admits it, which is exactly the property that arm exists to probe (a
// wide-scanRoot gate DOES see the gate corpus, so a marker in a gate file is live vocabulary) — plus the
// MENTION FENCE both ways: a quoted marker in prose neither suppresses (the closed bypass) nor gets
// inventoried (what made the corpus scannable).
// The FINDING-ARM side (#828, 2026-08-30) probes the same vocabulary against a gate that reports through
// `ctx.report(finding)` and therefore has NO node to read leading trivia from — carrier
// `no-test-fabrication`, whose scanRoot is `tests/`. That arm binds LINE-ADJACENTLY, which is a different
// resolver from the node arm's block-scoped walk, so its consumption verdicts (suppressed / stale /
// malformed / mention) need their own real-tree cases; the fast unit-level resolver pins live in
// tests/tooling/verify/lib/gate-ignore.test.ts.
//
// ── ALL THREE CARRIERS RE-POINTED 2026-09-11 (#1974) ──────────────────────────────────────────────────
// A CARRIER IS A PERISHABLE CHOICE, AND THIS SUITE IS THE PROOF. #1974 was filed against the Finding arm
// alone (`test-determinism`, FINAL at `7be684811`); the measured tree said all three were dead —
// `no-color-literals` and `no-raw-intl-time` had converted too, and the suite stood at 19 failed / 3
// passed on `b4714536d`, unnoticed because `tests/tooling/**` is `--full`-only (#1842).
//
// WHY A CONVERSION KILLS A CARRIER: marker routing is FENCED (docs/design/gate-runtime-standardization.md
// §7 and §5). The legacy `@orb-gate-ignore` engine this suite exercises reaches LEGACY owners ONLY. The
// day a carrier converts, this suite stops measuring what it claims to measure: the arms that assert a
// finding go RED (the gate is not in `loadGates`), and the one arm that asserts a SUPPRESSION goes
// silently VACUOUS-GREEN. 104 legacy modules still depend on that engine, so the arms are re-pointed
// rather than retired — arm 2, retirement with the legacy engine at Phase F, transplants this corpus into
// `ordinary-waiver.test.ts`.
//
// WHY THESE TWO, AND WHAT RETIRES THEM. `pnpm gate:contract` is the authority on legacy-ness, never this
// comment; re-derive before trusting a word of it.
//   · `query-machine-seals` (node arm + scripts arm) — legacy, not `markerImmune`, node-anchored with a
//     carried token, `scanRoot: () => true` (so it sees BOTH `DIR` and `SCRIPTS_DIR`), and it reports two
//     DISTINCT tokens from ONE ImportDeclaration, which is the §4.3a shape nothing else live still has.
//     `uncovered-gate-conversion-census.md:121` classifies it `X` (gate-owned vocabulary — central seam
//     grants must land first), so it converts late.
//   · `no-test-fabrication` (Finding arm) — legacy, not `markerImmune`, a pure Finding-arm reporter
//     (`ctx.report(finding)` with a plain literal, `no-test-fabrication.ts:198-205`) which is the exact
//     property that arm probes, and `scanRoot: p.startsWith("tests/")` admits `TESTS_DIR`.
//     `uncovered-gate-conversion-census.md:200` classifies it `X` too (its gate-local `FABRICATION-OK:`
//     grammar needs a central home first).
//
// THE TRIPWIRE: the first test below asserts every carrier is still in the LEGACY roster and says what to
// do when it is not. That is the whole lesson of #1974 — a green run is not evidence a carrier is live,
// and a red one must name the reason instead of spraying twenty assertion failures.
//
// Fixtures use the reserved `__g_` sentinel so every other tree consumer excludes them and a crashed run
// leaves nothing that can red an independent pass (tooling/src/verify/lib/pass.ts PROBE_ARTIFACT_RE).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import type { Finding, PassResult } from "../../tooling/src/verify/index.ts";
import { loadGates, projectCtx, runPass } from "../../tooling/src/verify/index.ts";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DIR = "packages/ui/src/__g_gi";
const CARRIER = "query-machine-seals";
const INVENTORY = "gate-ignore-inventory";
/** The violation every fixture carries: a raw `useMutation` import outside the data/ seals. */
const VIOLATION = "useMutation";
/** The §4.3a sibling on the SAME line — a different token of the SAME gate, from the SAME node. */
const SIBLING = "useInfiniteQuery";
/** One guarded thing: a single raw-hook import. The carrier reads the specifier TEXT, so nothing has to
 *  resolve and the fixture drags no package graph into the probe. */
const ONE = `import { ${VIOLATION} } from "@tanstack/react-query";\n`;
/** TWO guarded things on ONE line, from ONE ImportDeclaration — the §4.3a subject. */
const TWO = `import { ${VIOLATION}, ${SIBLING} } from "@tanstack/react-query";\n`;
/** The SCRIPTS-side fixture dir (the 2026-08-08 scanRoot extension): a SUBDIR of the gate corpus, so the
 *  workspace walk loads the fixtures (`tooling/src/verify/gates/**` glob) while the loader's flat `*.ts` glob
 *  and `discoverGateNames`'s flat readdir never see them — no import side effects, no name pollution. */
const SCRIPTS_DIR = "tooling/src/verify/gates/__g_gi";
/** The scripts-side carrier: the SAME node-anchored, token-carrying gate as the node arm, because its
 *  `scanRoot: () => true` ADMITS the gate corpus — which is precisely what this arm exists to prove (a
 *  marker in a gate file is LIVE vocabulary for every wide-scanRoot gate, and was uninventoried until the
 *  2026-08-08 extension). One carrier, two dirs: the arm is about the DIRECTORY, not about a second gate. */
const SCRIPTS_CARRIER = CARRIER;
const SCRIPTS_VIOLATION = VIOLATION;
/** A registered LEGACY gate that cannot possibly consume anything in the gate corpus — its scanRoot is
 *  `tests/`. The STALE arm needs a well-formed, REGISTERED marker that suppresses nothing. */
const ELSEWHERE_CARRIER = "no-test-fabrication";

/** case → the fixture source planted at `${DIR}/__g_<case>.ts`. */
const CASES: Readonly<Record<string, string>> = {
  // 1 — the gate bites at all: a violation with NO marker.
  unmarked: ONE,
  // 2 — the promise is honourable: a well-formed marker suppresses.
  reasoned: `// @orb-gate-ignore query-machine-seals: probe — a well-formed marker must suppress\n${ONE}`,
  // 3 — two-sided on the NAME: a marker naming a gate that does not exist.
  deadgate: `// @orb-gate-ignore g-no-such-gate: probe — names a gate that does not exist\n${ONE}`,
  // 3b — two-sided on the POSITION: a marker naming a position that is not live.
  deadposition: `// @orb-gate-ignore query-machine-seals(useQuery): probe — names a position not present\n${ONE}`,
  // 4 — MALFORMED as its OWN flavour: bare, no `: <reason>`.
  bare: `// @orb-gate-ignore query-machine-seals\n${ONE}`,
  // 4b — MALFORMED: an empty `()` names no position at all.
  emptyposition: `// @orb-gate-ignore query-machine-seals(): probe — empty position\n${ONE}`,
  // §4.3a POSITIVE — one line, two guarded things, the marker names ONE of them.
  positioned: `// @orb-gate-ignore query-machine-seals(${VIOLATION}): probe — position-scoped\n${TWO}`,
  // §4.3a COUNTERFACTUAL — the same line under ONE unpositioned marker: the over-exemption.
  overexempt: `// @orb-gate-ignore query-machine-seals: probe — unpositioned, absolves BOTH\n${TWO}`,
  // MENTION-FENCE COUNTERFACTUAL — a well-formed marker with a LIVE position, QUOTED inside a prose
  // comment. Until 2026-08-08 the suppressor's unanchored parse consumed this and the violation vanished.
  quotation: `// see \`// @orb-gate-ignore query-machine-seals(${VIOLATION}): x\` — a quotation must never suppress\n${ONE}`,
};

/** case → the fixture source planted at `${SCRIPTS_DIR}/__g_<case>.ts` — the SAME vocabulary AND the same
 *  carrier probed inside the gate corpus, where markers were UNINVENTORIED until the 2026-08-08 scanRoot
 *  extension. The carrier reads the import specifier's TEXT, so a corpus fixture needs no dependency. */
const SCRIPTS_CASES: Readonly<Record<string, string>> = {
  // the carrier bites in the corpus at all — a violation with NO marker.
  corpusUnmarked: ONE,
  // a marker in a gate file naming a gate that does not exist.
  corpusUnregistered: "// @orb-gate-ignore g-no-such-gate: probe — names a gate that does not exist\nexport const s1 = 1;\n",
  // MALFORMED: bare, no `: <reason>` — and it suppresses nothing, so the carrier reds too.
  corpusBare: `// @orb-gate-ignore ${SCRIPTS_CARRIER}\n${ONE}`,
  // STALE: well-formed, registered, but the named gate consumes nothing in this file.
  corpusStale: `// @orb-gate-ignore ${ELSEWHERE_CARRIER}: probe — consumes nothing in the gate corpus\nexport const s3 = 1;\n`,
  // the promise is honourable IN the corpus: a positioned marker suppresses, and is not flagged.
  corpusSuppressed: `// @orb-gate-ignore ${SCRIPTS_CARRIER}(${SCRIPTS_VIOLATION}): probe — a corpus marker must still suppress\n${ONE}`,
  // §4.3a in the corpus: one unpositioned marker over TWO guarded things in ONE statement.
  corpusOverexempt: `// @orb-gate-ignore ${SCRIPTS_CARRIER}: probe — unpositioned, absolves BOTH\n${TWO}`,
  // the founding false-positive shape: gate prose QUOTING the grammar — a mention, and no shield.
  corpusMention: `// the grammar is \`// @orb-gate-ignore ${SCRIPTS_CARRIER}(${SCRIPTS_VIOLATION}): <reason>\` — a quotation\n${ONE}`,
};

/** The FINDING-ARM fixture dir (#828): under `tests/`, which is `no-test-fabrication`'s scanRoot. */
const TESTS_DIR = "tests/tooling/__g_gi";
/** The Finding-arm carrier: a `visitFile` line scanner with no node, reporting file+line+column-0. Its
 *  choice is PINNED in the header — re-point it only after re-deriving `gate:contract`, never by filename. */
const TESTS_CARRIER = "no-test-fabrication";

/** The fabrication the Finding-arm fixtures carry: an `X as unknown as Y` double-cast, which the carrier
 *  reports with token `double-cast`. Spelled literally rather than assembled — unlike the previous
 *  ambient-clock carrier, this one reads the AST (`AsExpression` nodes), so the same spelling inside THIS
 *  file's fixture strings is a StringLiteral and can never make the probe file its own violation. */
const FABRICATION = "{} as unknown as { a: number }";

/** case → the fixture planted at `${TESTS_DIR}/__g_<case>.ts`. The violation is that double-cast; the
 *  marker (when present) sits on the line IMMEDIATELY above it. */
const TESTS_CASES: Readonly<Record<string, string>> = {
  // the Finding-arm carrier bites at all — a violation with NO marker.
  findingUnmarked: `export const f0 = ${FABRICATION};\n`,
  // the #828 fix: a well-formed marker one line above a Finding-arm violation suppresses it.
  findingMarked: `// @orb-gate-ignore no-test-fabrication: probe — a deliberate invalid-input shape\nexport const f1 = ${FABRICATION};\n`,
  // LINE-ADJACENCY: one line too far suppresses nothing AND the marker reds as stale (two-sided).
  findingFar: `// @orb-gate-ignore no-test-fabrication: probe — one line too far to bind\n\nexport const f2 = ${FABRICATION};\n`,
  // MALFORMED in the Finding arm: bare, no `: <reason>` — shields nothing, and reds as its own flavour.
  findingBare: `// @orb-gate-ignore no-test-fabrication\nexport const f3 = ${FABRICATION};\n`,
  // MENTION FENCE holds on the Finding arm too: a quoted marker in prose is not a marker.
  findingMention: `// the grammar is \`// @orb-gate-ignore no-test-fabrication: <reason>\` — a quotation\nexport const f4 = ${FABRICATION};\n`,
};

/** THE CLEANUP ROOTS ARE DERIVED FROM THE PLANT DIRS, never hand-listed (#2200). They were
 *  `["packages", "tests", "scripts"]` while `SCRIPTS_DIR` planted into **`tooling/`** — a root the list
 *  never named, because the gate corpus used to live under `scripts/` and the rename never reached this
 *  line. So every run, INCLUDING A GREEN ONE, left seven fixtures in `tooling/src/verify/gates/__g_gi/`,
 *  and `.gitignore:109` (an any-depth `__g_` glob) made them invisible to `git status` and to every census that reads
 *  `git ls-files` — they simply sat in the gate corpus for whoever ran next. Deriving the roots means a
 *  fourth plant dir joins the sweep by construction instead of by somebody remembering. */
const PLANT_DIRS = [DIR, SCRIPTS_DIR, TESTS_DIR] as const;
const CLEAN_ROOTS = [...new Set(PLANT_DIRS.map((dir) => dir.split("/")[0] as string))];

/** Fixture paths still on disk under the plant roots. The cleanup's own verdict, asked separately so a
 *  leak is a LOUD assertion in this suite rather than a silent inheritance by the next run. */
function strayFixtures(): readonly string[] {
  return execFileSync("find", [...CLEAN_ROOTS, "-name", "__g_*", "-print"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");
}

function clean(): void {
  execFileSync("find", [...CLEAN_ROOTS, "-name", "__g_*", "-prune", "-exec", "rm", "-rf", "{}", "+"], { cwd: ROOT });
  execFileSync("find", [...CLEAN_ROOTS, "-type", "d", "-empty", "-delete"], { cwd: ROOT });
}

function plant(): void {
  for (const [name, src] of Object.entries(CASES)) {
    const abs = join(ROOT, DIR, `__g_${name}.ts`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, src);
  }
  for (const [name, src] of Object.entries(SCRIPTS_CASES)) {
    const abs = join(ROOT, SCRIPTS_DIR, `__g_${name}.ts`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, src);
  }
  for (const [name, src] of Object.entries(TESTS_CASES)) {
    const abs = join(ROOT, TESTS_DIR, `__g_${name}.ts`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, src);
  }
}

// THE HOOK BUDGET IS LOAD-SCALED (#1174 -> #1232 section 7.1). The fixed 300s here ran ~60s on a quiet
// box and 470-485s at load 40+ with five lanes live, so the SAME code was red on both sides of any change
// and the red read as a broken gate corpus rather than as contention. The base is MEASURED, not guessed:
// 120_000 was tried first and timed out at exactly its budget on 2026-09-02 while this suite ran beside
// ui-audit's CLI tests at --maxWorkers=4, loadavg 11.7 on 24 cores — per-core 0.49, so `computeLoadFactor`
// classified the box QUIET and applied no stretch at all, and the hook needed >120s anyway. The scaling
// threshold (per-core >= 1) is about a SATURATED box; a half-loaded box still slows a single-threaded
// whole-corpus pass. So the base covers the contended-but-unsaturated case that the factor cannot see,
// and the factor stretches it for the saturated one (#1174 measured 470-485s at load 40+, which
// 300_000 x that factor covers). A hook that STILL blows this is a genuinely wedged pass — which is
// exactly what the ceiling exists to surface.
const HOOK_BUDGET_MS = scaledBudget(300_000);

let pass: PassResult;

// One real-tree pass over the whole gate corpus (~1min); every case reads from it.
beforeAll(async () => {
  clean();
  plant();
  try {
    const gates = await loadGates(ROOT);
    pass = runPass(gates, projectCtx(ROOT));
  } finally {
    clean();
  }
}, HOOK_BUDGET_MS);

afterAll(() => {
  clean();
});

/** Every finding a gate reported against one case's fixture file. */
function findings(gate: string, kase: keyof typeof CASES): readonly Finding[] {
  const file = `${DIR}/__g_${kase}.ts`;
  return (pass.gates.find((g) => g.name === gate)?.findings ?? []).filter((f) => f.file === file);
}

function tokens(gate: string, kase: keyof typeof CASES): readonly string[] {
  return findings(gate, kase).map((f) => f.token ?? "(no token)");
}

function messages(kase: keyof typeof CASES): string {
  return findings(INVENTORY, kase)
    .map((f) => f.message ?? "")
    .join("\n");
}

/** The scripts-side mirrors of findings/tokens/messages, over `${SCRIPTS_DIR}/__g_<case>.ts`. */
function sFindings(gate: string, kase: keyof typeof SCRIPTS_CASES): readonly Finding[] {
  const file = `${SCRIPTS_DIR}/__g_${kase}.ts`;
  return (pass.gates.find((g) => g.name === gate)?.findings ?? []).filter((f) => f.file === file);
}

function sTokens(gate: string, kase: keyof typeof SCRIPTS_CASES): readonly string[] {
  return sFindings(gate, kase).map((f) => f.token ?? "(no token)");
}

function sMessages(kase: keyof typeof SCRIPTS_CASES): string {
  return sFindings(INVENTORY, kase)
    .map((f) => f.message ?? "")
    .join("\n");
}

/** The FINDING-arm mirrors, over `${TESTS_DIR}/__g_<case>.ts`. */
function fFindings(gate: string, kase: keyof typeof TESTS_CASES): readonly Finding[] {
  const file = `${TESTS_DIR}/__g_${kase}.ts`;
  return (pass.gates.find((g) => g.name === gate)?.findings ?? []).filter((f) => f.file === file);
}

function fMessages(kase: keyof typeof TESTS_CASES): string {
  return fFindings(INVENTORY, kase)
    .map((f) => f.message ?? "")
    .join("\n");
}

// THE CARRIER TRIPWIRE (#1974). Every carrier below is a LEGACY gate BY REQUIREMENT — the engine under
// test reaches legacy owners only — so every one of them is perishable: a #1584 conversion silently
// removes it from this roster, and the arms that ASSERT A SUPPRESSION then pass vacuously while the arms
// that assert a finding spray unrelated assertion failures. This test exists so the failure NAMES ITS
// CAUSE. At the atomic cutover the legacy roster empties entirely and there is no fourth re-point: this
// suite RETIRES with the `@orb-gate-ignore` grammar it exists to test, its corpus transplanted into
// `tests/tooling/verify/lib/ordinary-waiver.test.ts`.
// THE CLEANUP IS ITSELF A CLAIM, so it is asserted rather than assumed (#2200). `beforeAll` has already
// planted, passed and cleaned in its `finally` by the time any test body runs, so a fixture still on disk
// here means the sweep does not cover where the plant writes. That was true of EVERY run — including the
// green ones — for as long as `clean()` named `scripts/` instead of `tooling/`: 22/22 passed, seven files
// stayed in the gate corpus, and `git status` showed nothing because the ignore rule hides them. This
// assertion is the difference between the next regression failing HERE, loudly, and failing silently in
// whichever slot inherits the fixtures.
test("cleanup is TOTAL — no planted fixture survives the pass, on the green path too", () => {
  expect(strayFixtures()).toEqual([]);
  // The sweep's own reach is the claim underneath: every directory the plant writes into must be covered.
  expect(CLEAN_ROOTS.toSorted()).toEqual([...new Set(PLANT_DIRS.map((dir) => dir.split("/")[0] as string))].toSorted());
  expect(CLEAN_ROOTS).toContain("tooling");
});

test("the probe ran at all — every carrier gate is still LEGACY and the corpus loaded", () => {
  expect(pass.toolErrors).toEqual([]);
  const legacy = pass.gates.map((g) => g.name);
  for (const carrier of [CARRIER, SCRIPTS_CARRIER, ELSEWHERE_CARRIER, INVENTORY]) {
    expect(
      legacy,
      `carrier \`${carrier}\` is no longer in the LEGACY roster — it converted to \`defineGate\` (#1584). Marker routing is fenced, so every arm riding it now measures nothing. Re-point that arm at a legacy gate with the same reporting shape (see this file's header), or retire the suite if the legacy roster is empty.`,
    ).toContain(carrier);
  }
});

test("case 1 — a violation with NO marker is RED", () => {
  expect(tokens(CARRIER, "unmarked")).toEqual([VIOLATION]);
  expect(findings(INVENTORY, "unmarked")).toEqual([]);
});

test("case 2 — a marker WITH its reason is GREEN, and is not itself flagged", () => {
  expect(tokens(CARRIER, "reasoned")).toEqual([]);
  expect(findings(INVENTORY, "reasoned")).toEqual([]);
});

test("case 3 — a marker naming a DEAD GATE is RED, two-sided: the violation reds AND the marker reds", () => {
  expect(tokens(CARRIER, "deadgate")).toEqual([VIOLATION]);
  expect(messages("deadgate")).toContain("isn't registered");
});

test("case 3b — a marker naming a DEAD POSITION is RED, two-sided: it suppresses nothing AND reds as stale", () => {
  expect(tokens(CARRIER, "deadposition")).toEqual([VIOLATION]);
  expect(messages("deadposition")).toContain("STALE");
});

test("case 4 — a MALFORMED marker is RED as its OWN flavour, not merged into 'no marker'", () => {
  // A bare marker and an empty `()` position each suppress NOTHING (so the violation reds, exactly as the
  // unmarked case) AND draw their own MALFORMED finding — which is what distinguishes them from case 1: a
  // marker that exempts nothing must not sit there LOOKING like protection.
  for (const kase of ["bare", "emptyposition"] as const) {
    expect(tokens(CARRIER, kase)).toEqual([VIOLATION]);
    expect(messages(kase)).toContain("MALFORMED");
  }
  expect(messages("unmarked")).not.toContain("MALFORMED");
});

test("§4.3a — a POSITION-named marker absolves only its own position; the sibling on the SAME line still reds", () => {
  expect(tokens(CARRIER, "positioned")).toEqual([SIBLING]);
  expect(findings(INVENTORY, "positioned")).toEqual([]);
  // Both guarded things are on the same source line — this is the `record(chatId, sessionId)` shape.
  expect(findings(CARRIER, "positioned").map((f) => f.line)).toEqual([2]);
});

test("§4.3a — one UNPOSITIONED marker over two guarded things absolves BOTH, and that is RED", () => {
  expect(tokens(CARRIER, "overexempt")).toEqual([]);
  expect(messages("overexempt")).toContain("OVER-EXEMPTING");
  // The count is reported so the author can see how many exemptions they granted by accident.
  expect(messages("overexempt")).toContain("it absolved 2 guarded things");
});

test("MENTION FENCE — a quoted marker inside a prose comment must NOT suppress (the closed bypass)", () => {
  // Until 2026-08-08 this fixture's violation VANISHED: the unanchored parse read the backtick quotation
  // as a live-position marker and absolved the finding, while the inventory counted it consumed (green).
  expect(tokens(CARRIER, "quotation")).toEqual([VIOLATION]);
  expect(findings(INVENTORY, "quotation")).toEqual([]);
});

// ---- the SCRIPTS side (the 2026-08-08 scanRoot extension): the same vocabulary, probed inside the gate
// corpus, where a marker could always SUPPRESS (the suppressor has no scanRoot) but was never audited.

test("scripts — the carrier bites inside the gate corpus at all, and an unmarked violation is RED", () => {
  expect(sTokens(SCRIPTS_CARRIER, "corpusUnmarked")).toEqual([SCRIPTS_VIOLATION]);
  expect(sFindings(INVENTORY, "corpusUnmarked")).toEqual([]);
});

test("scripts — a marker naming a DEAD GATE in a gate file is RED (it was silently inert before)", () => {
  expect(sMessages("corpusUnregistered")).toContain("isn't registered");
});

test("scripts — a BARE marker in a gate file is RED as MALFORMED, and shields nothing", () => {
  expect(sMessages("corpusBare")).toContain("MALFORMED");
  expect(sTokens(SCRIPTS_CARRIER, "corpusBare")).toEqual([SCRIPTS_VIOLATION]);
});

test("scripts — a well-formed marker that consumes nothing in the corpus is RED as STALE", () => {
  expect(sMessages("corpusStale")).toContain("STALE");
});

test("scripts — a positioned marker in a gate file still SUPPRESSES, and is not itself flagged", () => {
  expect(sTokens(SCRIPTS_CARRIER, "corpusSuppressed")).toEqual([]);
  expect(sFindings(INVENTORY, "corpusSuppressed")).toEqual([]);
});

test("scripts — §4.3a holds in the corpus: one unpositioned marker over two calls is RED as over-exempting", () => {
  expect(sTokens(SCRIPTS_CARRIER, "corpusOverexempt")).toEqual([]);
  expect(sMessages("corpusOverexempt")).toContain("OVER-EXEMPTING");
  expect(sMessages("corpusOverexempt")).toContain("it absolved 2 guarded things");
});

test("scripts — gate prose QUOTING the grammar is a MENTION: silent to the inventory, and no shield", () => {
  expect(sFindings(INVENTORY, "corpusMention")).toEqual([]);
  expect(sTokens(SCRIPTS_CARRIER, "corpusMention")).toEqual([SCRIPTS_VIOLATION]);
});

test("the LIVE corpus carries no malformed / unregistered / stale / over-exempting marker", () => {
  // Covers the gate corpus too since the scanRoot extension: the 12 live doc-prose grammar quotations
  // (the false positives that blocked the naive extension) must stay silent under the mention fence.
  const live = (pass.gates.find((g) => g.name === INVENTORY)?.findings ?? []).filter(
    (f) => !(f.file.startsWith(DIR) || f.file.startsWith(SCRIPTS_DIR) || f.file.startsWith(TESTS_DIR)),
  );
  expect(live).toEqual([]);
});

// ---- the FINDING ARM (#828): a `visitFile` line scanner has no node, so the marker binds LINE-ADJACENTLY.
// Before #828 every one of these cases behaved identically — the marker was inert by construction and the
// carrier gate had no per-site escape at all.

test("finding arm — the carrier bites, and an unmarked Finding-overload violation is RED", () => {
  expect(fFindings(TESTS_CARRIER, "findingUnmarked").map((f) => f.line)).toEqual([1]);
  expect(fFindings(INVENTORY, "findingUnmarked")).toEqual([]);
});

test("finding arm — a well-formed marker one line above SUPPRESSES, and is not itself flagged", () => {
  expect(fFindings(TESTS_CARRIER, "findingMarked")).toEqual([]);
  expect(fFindings(INVENTORY, "findingMarked")).toEqual([]);
});

test("finding arm — LINE-ADJACENCY is two-sided: one line too far reds the violation AND the marker", () => {
  expect(fFindings(TESTS_CARRIER, "findingFar").map((f) => f.line)).toEqual([3]);
  expect(fMessages("findingFar")).toContain("STALE");
});

test("finding arm — a BARE marker is MALFORMED and shields nothing", () => {
  expect(fFindings(TESTS_CARRIER, "findingBare").map((f) => f.line)).toEqual([2]);
  expect(fMessages("findingBare")).toContain("MALFORMED");
});

test("finding arm — the MENTION FENCE holds: a quoted marker is no shield and no inventory entry", () => {
  expect(fFindings(TESTS_CARRIER, "findingMention").map((f) => f.line)).toEqual([2]);
  expect(fFindings(INVENTORY, "findingMention")).toEqual([]);
});
