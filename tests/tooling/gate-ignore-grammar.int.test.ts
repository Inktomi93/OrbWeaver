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

test("the LIVE corpus carries no malformed / unregistered / stale / over-exempting marker", () => {
  const live = (pass.gates.find((g) => g.name === INVENTORY)?.findings ?? []).filter((f) => !f.file.startsWith(DIR));
  expect(live).toEqual([]);
});
