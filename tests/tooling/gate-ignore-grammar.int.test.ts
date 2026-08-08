// The GATE-AUTHORING.md §5 SIX-CASE REAL-TREE PROBE for the house suppression marker
// `// @orb-gate-ignore <gate>[(<position>)]: <reason>` — made permanent.
//
// Why this exists and why gate-conformance cannot replace it: conformance runs ONE gate standalone
// (scripts/check/conformance.ts `runGateStandalone`), so in a mini-project no SIBLING gate can ever consume
// a marker — every suppression-consumption verdict (STALE, OVER-EXEMPT) is unobservable there. This suite
// runs the REAL loaded gate corpus over the REAL workspace with planted `__g_` fixtures, which is the only
// substrate where "did the marker actually suppress, and how many things did it suppress" is answerable.
// The grammar itself (parse/malformed) is proven by conformance; the EXEMPTION VOCABULARY is proven here.
//
// The carrier is `no-color-literals`: it is token-anchored, scans plain string literals under
// packages/ui/src (no JSX carrier fence), and reports MULTIPLE tokens from ONE node — the only live shape
// that reproduces §4.3a's "one line, two guarded things" (`record(chatId: string, sessionId: string)`).
// The SCRIPTS side (2026-08-08) probes the same vocabulary inside the gate corpus — carrier
// `no-raw-intl-time`, whose scanRoot admits it — plus the MENTION FENCE both ways: a quoted marker in
// prose neither suppresses (the closed bypass) nor gets inventoried (what made the corpus scannable).
// Fixtures use the reserved `__g_` sentinel so every other tree consumer excludes them and a crashed run
// leaves nothing that can red an independent pass (scripts/check/pass.ts PROBE_ARTIFACT_RE).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import type { Finding } from "../../scripts/check/contract.ts";
import { loadGates } from "../../scripts/check/loader.ts";
import type { PassResult } from "../../scripts/check/pass.ts";
import { projectCtx, runPass } from "../../scripts/check/pass.ts";
import { expect, test } from "../support/fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DIR = "packages/ui/src/__g_gi";
const CARRIER = "no-color-literals";
const INVENTORY = "gate-ignore-inventory";
/** The violation every fixture carries: a non-token color literal, reported with token `bg-black`. */
const VIOLATION = "bg-black";
/** The §4.3a sibling on the SAME line — a different token of the SAME gate. */
const SIBLING = "text-[#abc]";
/** The SCRIPTS-side fixture dir (the 2026-08-08 scanRoot extension): a SUBDIR of the gate corpus, so the
 *  workspace walk loads the fixtures (`scripts/check/gates/**` glob) while the loader's flat `*.ts` glob
 *  and `discoverGateNames`'s flat readdir never see them — no import side effects, no name pollution. */
const SCRIPTS_DIR = "scripts/check/gates/__g_gi";
/** The scripts-side carrier: node-anchored, token-carrying, and its scanRoot ADMITS the gate corpus
 *  (`(p) => !p.startsWith("packages/kit/src/time/")`), so a marker in a gate file is LIVE vocabulary. */
const SCRIPTS_CARRIER = "no-raw-intl-time";
const SCRIPTS_VIOLATION = "tolocale";

/** case → the fixture source planted at `${DIR}/__g_<case>.ts`. */
const CASES: Readonly<Record<string, string>> = {
  // 1 — the gate bites at all: a violation with NO marker.
  unmarked: 'export const g1 = "bg-black";\n',
  // 2 — the promise is honourable: a well-formed marker suppresses.
  reasoned: '// @orb-gate-ignore no-color-literals: probe — a well-formed marker must suppress\nexport const g2 = "bg-black";\n',
  // 3 — two-sided on the NAME: a marker naming a gate that does not exist.
  deadgate: '// @orb-gate-ignore g-no-such-gate: probe — names a gate that does not exist\nexport const g3 = "bg-black";\n',
  // 3b — two-sided on the POSITION: a marker naming a position that is not live.
  deadposition: '// @orb-gate-ignore no-color-literals(bg-white): probe — names a position not present\nexport const g4 = "bg-black";\n',
  // 4 — MALFORMED as its OWN flavour: bare, no `: <reason>`.
  bare: '// @orb-gate-ignore no-color-literals\nexport const g5 = "bg-black";\n',
  // 4b — MALFORMED: an empty `()` names no position at all.
  emptyposition: '// @orb-gate-ignore no-color-literals(): probe — empty position\nexport const g6 = "bg-black";\n',
  // §4.3a POSITIVE — one line, two guarded things, the marker names ONE of them.
  positioned: '// @orb-gate-ignore no-color-literals(bg-black): probe — position-scoped\nexport const g7 = "bg-black text-[#abc]";\n',
  // §4.3a COUNTERFACTUAL — the same line under ONE unpositioned marker: the over-exemption.
  overexempt: '// @orb-gate-ignore no-color-literals: probe — unpositioned, absolves BOTH\nexport const g8 = "bg-black text-[#abc]";\n',
  // MENTION-FENCE COUNTERFACTUAL — a well-formed marker with a LIVE position, QUOTED inside a prose
  // comment. Until 2026-08-08 the suppressor's unanchored parse consumed this and the violation vanished.
  quotation: '// see `// @orb-gate-ignore no-color-literals(bg-black): x` — a quotation must never suppress\nexport const g9 = "bg-black";\n',
};

/** case → the fixture source planted at `${SCRIPTS_DIR}/__g_<case>.ts` — the SAME vocabulary probed
 *  inside the gate corpus, where markers were UNINVENTORIED until the 2026-08-08 scanRoot extension.
 *  The carrier matches `.toLocale*()` by PROPERTY NAME, so the receiver is a deterministic `(0)` —
 *  fixture SOURCE must not spell ambient-clock calls (test-determinism scans this file's strings). */
const SCRIPTS_CASES: Readonly<Record<string, string>> = {
  // the carrier bites in the corpus at all — a violation with NO marker.
  corpusUnmarked: "export const s0 = (0).toLocaleString();\n",
  // a marker in a gate file naming a gate that does not exist.
  corpusUnregistered: "// @orb-gate-ignore g-no-such-gate: probe — names a gate that does not exist\nexport const s1 = 1;\n",
  // MALFORMED: bare, no `: <reason>` — and it suppresses nothing, so the carrier reds too.
  corpusBare: "// @orb-gate-ignore no-raw-intl-time\nexport const s2 = (0).toLocaleString();\n",
  // STALE: well-formed, registered, but the named gate consumes nothing in this file.
  corpusStale: "// @orb-gate-ignore no-color-literals: probe — consumes nothing in the gate corpus\nexport const s3 = 1;\n",
  // the promise is honourable IN the corpus: a positioned marker suppresses, and is not flagged.
  corpusSuppressed: "// @orb-gate-ignore no-raw-intl-time(tolocale): probe — a corpus marker must still suppress\nexport const s4 = (0).toLocaleString();\n",
  // §4.3a in the corpus: one unpositioned marker over TWO guarded calls in ONE statement.
  corpusOverexempt:
    "// @orb-gate-ignore no-raw-intl-time: probe — unpositioned, absolves BOTH calls\nexport const s5 = [(0).toLocaleString(), (0).toLocaleTimeString()];\n",
  // the founding false-positive shape: gate prose QUOTING the grammar — a mention, and no shield.
  corpusMention: "// the grammar is `// @orb-gate-ignore no-raw-intl-time(tolocale): <reason>` — a quotation\nexport const s6 = (0).toLocaleString();\n",
};

function clean(): void {
  execFileSync("find", ["packages", "tests", "scripts", "-name", "__g_*", "-prune", "-exec", "rm", "-rf", "{}", "+"], { cwd: ROOT });
  execFileSync("find", ["packages", "tests", "scripts", "-type", "d", "-empty", "-delete"], { cwd: ROOT });
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
}

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
}, 300_000);

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

test("the probe ran at all — the carrier gate is live and the corpus loaded", () => {
  expect(pass.toolErrors).toEqual([]);
  expect(pass.gates.map((g) => g.name)).toContain(CARRIER);
  expect(pass.gates.map((g) => g.name)).toContain(INVENTORY);
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
  const live = (pass.gates.find((g) => g.name === INVENTORY)?.findings ?? []).filter((f) => !(f.file.startsWith(DIR) || f.file.startsWith(SCRIPTS_DIR)));
  expect(live).toEqual([]);
});
