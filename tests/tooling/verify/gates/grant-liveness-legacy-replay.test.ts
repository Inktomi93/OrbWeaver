// THE §4.6 CONVERSION DIFFERENTIAL FOR THE `grant-liveness` CONFIG PAIR — the NON-VACUOUS arm that
// `biome-grant-liveness` and `tsconfig-entry-liveness` have owed since #2273 (board row #2319).
//
// WHAT WAS OWED, AND WHY IT COULD NOT BE PAID BEFORE. Both modules' headers carry a §4.6 record
// classified "category 5 with a ZERO legacy side" — a liveness-and-outcome receipt over the REAL tree,
// explicitly NOT catch parity, because the legacy side reported nothing there and a zero legacy side is
// guide §4.6 vacuity shape 2. The fixture-level method that reaches catch parity was UNAVAILABLE: the
// shared harness replays on an in-memory project and `frozenLegacyGate` REFUSES a filesystem-reading
// descriptor (#2119), and both frozen blobs at `c97de9d2f` are `readdirSync`/`existsSync`/`readFileSync`
// readers — which is exactly what the conversion retired. §4.6's own instruction for that class is
// *"replay a filesystem-reading legacy gate on a REAL TMPDIR, never a virtual root"*, and
// `tests/support/legacy-differential.ts` now carries that door.
//
// THE REFUSAL IS PRESERVED, NOT RELAXED, and this file pins BOTH directions of it. The in-memory door
// still throws on these two blobs — that arm lives beside its controls in `grant-liveness-family.test.ts`
// and is deliberately not duplicated here. What this file adds is the OPPOSITE fence, the one that
// matters once a frozen descriptor is allowed near real disk: a replay root inside the running checkout
// is refused, so a legacy `existsSync` arm can never answer about THIS repository instead of about the
// fixture. Plus the wrong-door refusal: a descriptor with no filesystem reach belongs on the cheaper
// in-memory substrate and is turned away here.
//
// WHAT THE TABLE BELOW IS. Every one of the 25 legacy `GateExample` file maps — 14 from
// `biome-grant-liveness`, 11 from `tsconfig-entry-liveness` — materialized ONCE per replay into a real
// tmpdir repository, driven through the FROZEN legacy descriptor via `runPass` and through the FINAL
// policy pair via `runPolicyPass`, with findings, populations, subjects and tool errors all declared.
// Each row also declares its SUCCESSOR: the final finding or tool error that carries the legacy catch,
// asserted by match — or `null` plus a `retiredWhy`, which is how the two genuinely retired arms are
// recorded rather than hidden inside a larger final count.
//
// THE SUBSTRATE PORT IS MEASURED, NOT ASSUMED. The legacy conformance runner (`ops/conformance.ts`
// `runFsBackedExample`) `git init`s and does NOT `git add`; the final resource runner
// (`ops/policy-conformance.ts` `runResourceExample`) adds, because every `grant-liveness` policy reads
// the tracked-file oracle. One root serves both engines here, so it carries the index — and
// `runTmpdirScenarios` re-runs the LEGACY side on an unindexed root for every example and asserts the
// verdict did not move. Both legacy descriptors gate their `git ls-files` half behind an `existsSync` on
// their own module path, which no fixture plants, so the index is inert; that is now a receipt.
//
// WHAT IT FOUND. Catch parity is REAL for the founding file-exact arm on both gates (3 rows `identical`);
// the two blindness tripwires each landed in the `-health` sibling with a MEASURED successor (3 rows
// `split`, and `tsconfig-entry-liveness-health`'s UNPARSEABLE arm also moved its anchor from line 0 to
// line 1 and gained a token); MISSING-CONFIG and UNPARSEABLE-CONFIG became population-phase TOOL ERRORS
// exactly as both headers claim (3 rows `runtime-refusal`, now an executed fact rather than a reading);
// the two `EXEMPT` tables' STALE and DEAD-CITE arms have NO fixture-level successor and say so (4 rows
// `retired-arm` — the DEAD-CITE half confirms `biome-grant-liveness.ts`'s own header, which states that
// a grant whose cited decision moved is caught by nothing); the glob arm is strictly STRONGER, because
// the legacy pattern half was gated behind a real-tree anchor no fixture could clear (5 rows, corrected
// 2026-09-13 from "7 rows"); and the THREE exemption-HONOURED examples are genuine category 5, driven with
// the SHIPPED reviewed-grant rows so the falsifier "did every hidden site become exactly ONE live,
// CONSUMED row" is answered per fixture rather than in prose (3 rows, corrected 2026-09-13 from "two
// exemption-HONOURED examples").
//
// THE TALLY IS DERIVED, NEVER HAND-KEPT — the two numbers above were wrong from the first landing until
// 2026-09-13, and both independent reviews re-derived the same census the table itself states:
//   rg --only-matching 'classification: "([a-z-]+)"' --replace '$1' <this file> | sort | uniq -c
// 5 stronger-reader · 4 vacuous-both-zero · 4 retired-arm · 3 split · 3 runtime-refusal · 3 identical ·
// 3 exemption-mechanism-move = 25, against the runner's own 14 + 11 assertion on the live example count.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, parse } from "node:path";
import process from "node:process";
import { withProcessEnv } from "../../../../tooling/src/_shared/process-env.ts";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as biomeGrantLiveness } from "../../../../tooling/src/verify/gates/biome-grant-liveness.ts";
import { gate as biomeGrantLivenessHealth } from "../../../../tooling/src/verify/gates/biome-grant-liveness-health.ts";
import { gate as tsconfigEntryLiveness } from "../../../../tooling/src/verify/gates/tsconfig-entry-liveness.ts";
import { gate as tsconfigEntryLivenessHealth } from "../../../../tooling/src/verify/gates/tsconfig-entry-liveness-health.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import type { TmpdirScenario } from "../../../support/legacy-differential.ts";
import {
  assertReplayRootIsScratch,
  createTmpdirDifferential,
  frozenClosureOf,
  frozenFilesystemLegacyGate,
  label,
  shimHeaderImports,
  stagedReplayTarget,
} from "../../../support/legacy-differential.ts";
import { expect, fixturePath, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** The parent of `97e68be91`, the conversion that landed both pairs. Both modules' headers cite it. */
const LEGACY_BASE = "c97de9d2f";
const BIOME_LEGACY = "tooling/src/verify/gates/biome-grant-liveness.ts";
const TSCONFIG_LEGACY = "tooling/src/verify/gates/tsconfig-entry-liveness.ts";
/** Never used — every legacy example carries a full `files` MAP. Named so a dropped map is visible. */
const BIOME_FALLBACK = "__no-example-files-map__/biome.json";
const TSCONFIG_FALLBACK = "__no-example-files-map__/tsconfig.json";

/** An in-memory-only frozen blob, for the wrong-door refusal below (the parent of `99b7429e2`). */
const PURE_BASE = "d6f36904f";
const PURE_LEGACY = "tooling/src/verify/gates/no-color-literals.ts";

const BIOME_CONFIG = "biome.json";
const TSCONFIG = "tsconfig.json";
const LIVE_REL = "packages/client/src/live.ts";
const CATALOG_TMP = "docs/catalog/catalog.tmp.*.json";
const CATALOG_SERIALIZER = "tooling/src/doc-catalog/ops/tree.ts";
const ST_RUNTIME = "scripts/probes/st-goldens/sillytavern-runtime";
const ST_README = "scripts/probes/st-goldens/README.md";
const GONE = "packages/client/src/gone.ts";

/** THE 46-CHARACTER MESSAGE HEADS the shared label compares in. Spelled out rather than sliced off the
 *  modules' own constants on purpose: they are not exported, and a message edit that changes what a gate
 *  CLAIMS should red a parity table rather than silently re-baseline it. */
const LEGACY_BIOME_EXACT = "a FILE-EXACT path in a `biome.json` override `";
const LEGACY_BIOME_MISSING = "biome.json is not at the repo root — this gate";
const LEGACY_BIOME_UNPARSEABLE = "biome.json did not parse as STRICT JSON. Fail ";
const LEGACY_BIOME_NO_ROWS = "biome.json parsed but ZERO file-exact grant ro";
const LEGACY_BIOME_STALE = "a biome-grant-liveness EXEMPT row forgives a g";
const LEGACY_BIOME_DEAD_CITE = "a biome-grant-liveness EXEMPT row's `cite` no ";
const FINAL_BIOME_EXACT = "a path in a `biome.json` override `includes` n";
const FINAL_BIOME_GLOB = "a GLOB in a `biome.json` override `includes` m";
const FINAL_BIOME_NO_ROWS = "biome.json parsed but ZERO file-exact grant ro";

const LEGACY_TS_EXACT = "a FILE-EXACT `include`/`exclude` entry in a ts";
const LEGACY_TS_MISSING = "tsconfig.json is not at the repo root — this g";
const LEGACY_TS_UNPARSEABLE = "a tsconfig*.json did not parse as JSONC. Fail ";
const LEGACY_TS_NO_ROWS = "the tsconfig set parsed but ZERO file-exact in";
const LEGACY_TS_STALE = "a tsconfig-entry-liveness EXEMPT row forgives ";
const LEGACY_TS_DEAD_CITE = "a tsconfig-entry-liveness EXEMPT row's `cite` ";
const FINAL_TS_EXACT = "a FILE-EXACT `include`/`exclude` entry in a ts";
const FINAL_TS_GLOB = "a GLOB `include`/`exclude` entry in a tsconfig";
const FINAL_TS_TEMPLATE = "a `${configDir}` TEMPLATE entry in a tsconfig ";
const FINAL_TS_UNPARSEABLE = "a tsconfig*.json did not parse. Fail LOUD, nev";
const FINAL_TS_NO_ROWS = "the tsconfig roster parsed but ZERO file-exact";

/** THE TOOL-ERROR CLASSIFIER, and it is TOTAL: an unrecognised refusal shape THROWS rather than being
 *  compressed into a code, because a differential that silently absorbs a new refusal is the vacuity the
 *  whole mechanism exists to prevent. */
const REFUSAL_CODES: readonly (readonly [string, string])[] = [
  ["json:biome MISSING", "resource declaration json:biome is missing"],
  ["json:biome UNPARSEABLE", "did not parse as strict JSON"],
  ["tsconfig ROSTER EMPTY", "tsconfig roster is EMPTY"],
];

function toolErrorCode(owner: string, phase: string, message: string): string {
  const matched = REFUSAL_CODES.find(([, needle]) => message.includes(needle));
  if (matched === undefined) {
    throw new Error(`unclassified refusal from ${owner}/${phase}: ${message}`);
  }
  return `${owner}/${phase}: ${matched[0]}`;
}

/** Both refusal phases every withheld owner emits: the phase that refused, and authority's re-report. */
function refusal(owners: readonly string[], phase: string, code: string): readonly string[] {
  return owners.flatMap((owner) => [`${owner}/${phase}: ${code}`, `${owner}/authority: ${code}`]);
}

const B = "biome-grant-liveness";
const BH = "biome-grant-liveness-health";
const T = "tsconfig-entry-liveness";
const TH = "tsconfig-entry-liveness-health";

/** One reporter's label builder over one config — the shared harness's `label` vocabulary,
 *  `<policy> | <file>:<line> | <token> | <message head>`, curried by who reports where. */
type Anchor = (line: number, token: string, message: string) => string;

function labelFor(policy: string, file: string): Anchor {
  return (line, token, message) => `${policy} | ${file}:${line} | ${token} | ${message}`;
}

const bLegacy = labelFor("legacy", BIOME_CONFIG);
const bFinal = labelFor(B, BIOME_CONFIG);
const bHealth = labelFor(BH, BIOME_CONFIG);
const tLegacy = labelFor("legacy", TSCONFIG);
const tFinal = labelFor(T, TSCONFIG);
const tHealth = labelFor(TH, TSCONFIG);

/** The anchor filler both legacy fixtures build from `REAL_CONFIG_MIN_*`: `packages/p0/**` upward. BUILT
 *  here for the same reason the modules build theirs — change the anchor constant and the table follows
 *  instead of thirty hand-typed rows going quietly stale. */
function fillerGlobs(anchor: Anchor, line: number, count: number, message: string): readonly string[] {
  return Array.from({ length: count }, (_, index) => anchor(line, `packages/p${String(index)}/**`, message));
}

/** The SHIPPED reviewed-grant row, never a hand-written twin: category 5's falsifier asks whether the
 *  hidden site became exactly one LIVE, CONSUMED row, and only the real row can answer that. */
function shippedGrant(id: string): ReviewedGateGrant {
  const row = REVIEWED_GRANTS.find((grant) => grant.id === id);
  if (row === undefined) {
    throw new Error(`no reviewed grant is named ${id} — the category-5 arm cannot be driven with a twin`);
  }
  return row;
}

const BIOME_SCENARIOS: readonly TmpdirScenario[] = [
  {
    why: "mustFlag[0] the founding shape — a file-exact grant whose file is GONE",
    classification: "identical",
    successor: GONE,
    legacy: [bLegacy(4, GONE, LEGACY_BIOME_EXACT)],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=1 scanned=1"],
    final: [bFinal(4, GONE, FINAL_BIOME_EXACT)],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG],
  },
  {
    why: "mustFlag[1] the exact/glob classifier — CATCH CARRIED, plus the glob arm the legacy anchor gated off",
    classification: "stronger-reader",
    successor: GONE,
    legacy: [bLegacy(4, GONE, LEGACY_BIOME_EXACT)],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=3 scanned=2"],
    final: [bFinal(4, GONE, FINAL_BIOME_EXACT), bFinal(4, "packages/ui/**", FINAL_BIOME_GLOB)],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG, LIVE_REL],
  },
  {
    why: "mustFlag[2] MISSING-CONFIG — the legacy FINDING is the runtime's population refusal now",
    classification: "runtime-refusal",
    successor: "json:biome MISSING",
    legacy: [bLegacy(0, "-", LEGACY_BIOME_MISSING)],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=0 scanned=0"],
    final: [],
    finalPopulation: 0,
    finalSubjects: [],
    finalErrors: refusal([B, BH], "population", "json:biome MISSING"),
  },
  {
    why: "mustFlag[3] UNPARSEABLE-CONFIG — same move, and the parse failure is named by the runtime rather than by the gate",
    classification: "runtime-refusal",
    successor: "json:biome UNPARSEABLE",
    legacy: [bLegacy(0, "-", LEGACY_BIOME_UNPARSEABLE)],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=0 scanned=0"],
    final: [],
    finalPopulation: 0,
    finalSubjects: [],
    finalErrors: refusal([B, BH], "population", "json:biome UNPARSEABLE"),
  },
  {
    why: "mustFlag[4] NO-ROWS — the blindness tripwire SPLIT into the -health sibling, and it fires (anchor moved line 0 → 1)",
    classification: "split",
    successor: BH,
    legacy: [bLegacy(0, "-", LEGACY_BIOME_NO_ROWS)],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=30 scanned=0"],
    final: [...fillerGlobs(bFinal, 2, 30, FINAL_BIOME_GLOB), bHealth(1, "-", FINAL_BIOME_NO_ROWS)],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG],
  },
  {
    why: "mustFlag[5] STALE-EXEMPT — a gate-owned table forgiving a row biome.json no longer carries",
    classification: "retired-arm",
    successor: null,
    retiredWhy:
      "the table is GONE and its successor is the CENTRAL engine's stale-grant reconciliation, which is a fact about a " +
      "complete owner run and not about one fixture — a grant consumed zero times reds there. Its identity arms are " +
      "grant-liveness-family.test.ts's §4.3 rows (a wrong operation and a renamed subject both alarm).",
    legacy: [bLegacy(0, CATALOG_TMP, LEGACY_BIOME_STALE)],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=30 scanned=1"],
    final: fillerGlobs(bFinal, 2, 29, FINAL_BIOME_GLOB),
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG, LIVE_REL],
  },
  {
    why: "mustFlag[6] DEAD-CITE — the exemption's justification MOVED",
    classification: "retired-arm",
    successor: null,
    retiredWhy:
      "NO SUCCESSOR AT ALL, and biome-grant-liveness.ts's own header says so after #2124 corrected the claim that " +
      "dangling-refs still caught it: lib/reviewed-grants.ts is in no arm's population, so a grant whose cited " +
      "decision moved or was deleted is caught by nothing. This row is that gap MEASURED rather than asserted.",
    legacy: [bLegacy(0, CATALOG_SERIALIZER, LEGACY_BIOME_DEAD_CITE)],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=31 scanned=1"],
    final: [...fillerGlobs(bFinal, 2, 29, FINAL_BIOME_GLOB), bFinal(2, CATALOG_TMP, FINAL_BIOME_GLOB)],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG, LIVE_REL],
  },
  {
    why: "mustPass[0] the legacy DECLARED LIMIT on the pattern half — the final glob arm needs no real-tree anchor",
    classification: "stronger-reader",
    successor: null,
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=1 scanned=0"],
    final: [bFinal(1, "packages/definitely-not-here/**", FINAL_BIOME_GLOB)],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG],
  },
  {
    why: "mustPass[1] the sanctioned shape — a live file-exact grant is silent on BOTH engines",
    classification: "vacuous-both-zero",
    successor: null,
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=1 scanned=1"],
    final: [],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG, LIVE_REL],
  },
  {
    why: "mustPass[2] the exemption HONOURED — CATEGORY 5: the legacy table HID this row, the shipped grant licenses it",
    classification: "exemption-mechanism-move",
    successor: null,
    grants: [shippedGrant("biome-grant-liveness:catalog-tmp")],
    granted: ["biome-grant-liveness:catalog-tmp"],
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=31 scanned=1"],
    final: fillerGlobs(bFinal, 2, 29, FINAL_BIOME_GLOB),
    finalRaw: [...fillerGlobs(bFinal, 2, 29, FINAL_BIOME_GLOB), bFinal(2, CATALOG_TMP, FINAL_BIOME_GLOB)],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG, LIVE_REL, CATALOG_SERIALIZER],
  },
  {
    why: "mustPass[3] every glob spelling — the legacy DECLARED LIMIT is four live findings now",
    classification: "stronger-reader",
    successor: null,
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=4 scanned=0"],
    final: [
      bFinal(4, "packages/client/**", FINAL_BIOME_GLOB),
      bFinal(4, "**/*.config.ts", FINAL_BIOME_GLOB),
      bFinal(4, "playwright*.config.ts", FINAL_BIOME_GLOB),
      bFinal(4, "tests/{a,b}/x.ts", FINAL_BIOME_GLOB),
    ],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG],
  },
  {
    why: "mustPass[4] a NEGATED entry excludes rather than grants — the fence survived the conversion byte-for-byte",
    classification: "vacuous-both-zero",
    successor: null,
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=2 scanned=1"],
    final: [],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG, LIVE_REL],
  },
  {
    why: "mustPass[5] the legacy RULE-liveness limit — arm six left the policy entirely (#2074), so both sides are silent",
    classification: "vacuous-both-zero",
    successor: null,
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=1 scanned=1"],
    final: [],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG, LIVE_REL],
  },
  {
    why: "mustPass[6] the anchor-sized rule-list variant — CATEGORY 5 again, same grant, same single consumption",
    classification: "exemption-mechanism-move",
    successor: null,
    grants: [shippedGrant("biome-grant-liveness:catalog-tmp")],
    granted: ["biome-grant-liveness:catalog-tmp"],
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["grant row: candidates=31 scanned=1"],
    final: fillerGlobs(bFinal, 2, 29, FINAL_BIOME_GLOB),
    finalRaw: [...fillerGlobs(bFinal, 2, 29, FINAL_BIOME_GLOB), bFinal(2, CATALOG_TMP, FINAL_BIOME_GLOB)],
    finalPopulation: 0,
    finalSubjects: [BIOME_CONFIG, LIVE_REL, CATALOG_SERIALIZER],
  },
];

const TSCONFIG_SCENARIOS: readonly TmpdirScenario[] = [
  {
    why: "mustFlag[0] the founding shape — a file-exact EXCLUDE whose file is GONE",
    classification: "identical",
    successor: GONE,
    legacy: [tLegacy(2, GONE, LEGACY_TS_EXACT)],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=1 scanned=1"],
    final: [tFinal(2, GONE, FINAL_TS_EXACT)],
    finalPopulation: 0,
    finalSubjects: [TSCONFIG],
  },
  {
    why: "mustFlag[1] the exact/glob classifier — identical on both engines, line identity included",
    classification: "identical",
    successor: GONE,
    legacy: [tLegacy(2, GONE, LEGACY_TS_EXACT)],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=3 scanned=2"],
    final: [tFinal(2, GONE, FINAL_TS_EXACT)],
    finalPopulation: 0,
    finalSubjects: [TSCONFIG, LIVE_REL],
  },
  {
    why: "mustFlag[2] MISSING-CONFIG — its premise died with the roster; the honest successor is the EMPTY-ROSTER throw",
    classification: "runtime-refusal",
    successor: "tsconfig ROSTER EMPTY",
    legacy: [tLegacy(0, "-", LEGACY_TS_MISSING)],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=0 scanned=0"],
    final: [],
    finalPopulation: 0,
    finalSubjects: ["not-tsconfig.json"],
    finalErrors: refusal([T, TH], "evaluate", "tsconfig ROSTER EMPTY"),
  },
  {
    why: "mustFlag[3] UNPARSEABLE — SPLIT to the -health sibling, which anchors at line 1 with the config as its token",
    classification: "split",
    successor: TH,
    legacy: [tLegacy(0, "-", LEGACY_TS_UNPARSEABLE)],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=0 scanned=0"],
    final: [tHealth(1, TSCONFIG, FINAL_TS_UNPARSEABLE)],
    finalPopulation: 0,
    finalSubjects: [TSCONFIG],
  },
  {
    why: "mustFlag[4] NO-ROWS — SPLIT to the -health sibling, beside the glob arm the legacy anchor gated off",
    classification: "split",
    successor: TH,
    legacy: [tLegacy(0, "-", LEGACY_TS_NO_ROWS)],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=30 scanned=0"],
    final: [...fillerGlobs(tFinal, 2, 30, FINAL_TS_GLOB), tHealth(1, "-", FINAL_TS_NO_ROWS)],
    finalPopulation: 0,
    finalSubjects: [TSCONFIG],
  },
  {
    why: "mustFlag[5] STALE-EXEMPT — the gate-owned table's first two-sided arm",
    classification: "retired-arm",
    successor: null,
    retiredWhy:
      "the nine EXEMPT/RATIFIED rows are central `(policy, subject, operation)` rows now, and a row the config no " +
      "longer carries is caught by the CENTRAL engine's zero-consumption staleness after a complete owner run — a " +
      "whole-run fact no single fixture can produce. Its identity arms are grant-liveness-family.test.ts's §4.3 rows.",
    legacy: [tLegacy(0, ST_RUNTIME, LEGACY_TS_STALE)],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=30 scanned=1"],
    final: fillerGlobs(tFinal, 2, 29, FINAL_TS_GLOB),
    finalPopulation: 0,
    finalSubjects: [TSCONFIG, LIVE_REL],
  },
  {
    why: "mustFlag[6] DEAD-CITE — the exemption's justification MOVED",
    classification: "retired-arm",
    successor: null,
    retiredWhy:
      "the same gap biome-grant-liveness.ts's header records for its own half: a reviewed grant's `why`/`endsWhen` " +
      "prose is in no gate's population, so a moved justification is caught by nothing. Recorded here as a measured " +
      "fact about BOTH members of the pair rather than a claim about one.",
    legacy: [tLegacy(0, ST_README, LEGACY_TS_DEAD_CITE)],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=30 scanned=1"],
    final: [...fillerGlobs(tFinal, 2, 29, FINAL_TS_GLOB), tFinal(2, ST_RUNTIME, FINAL_TS_EXACT)],
    finalPopulation: 0,
    finalSubjects: [TSCONFIG],
  },
  {
    why: "mustPass[0] the legacy DECLARED LIMIT on the pattern half — no anchor gate on the final glob arm",
    classification: "stronger-reader",
    successor: null,
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=1 scanned=0"],
    final: [tFinal(1, "packages/definitely-not-here/**/*.ts", FINAL_TS_GLOB)],
    finalPopulation: 0,
    finalSubjects: [TSCONFIG],
  },
  {
    why: "mustPass[1] the sanctioned shape — a live file-exact exclude is silent on BOTH engines",
    classification: "vacuous-both-zero",
    successor: null,
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=1 scanned=1"],
    final: [],
    finalPopulation: 0,
    finalSubjects: [TSCONFIG, LIVE_REL],
  },
  {
    why: "mustPass[2] the legacy glob + configDir DECLARED SKIPS — all three are judged now, the template as IRREDUCIBLE",
    classification: "stronger-reader",
    successor: null,
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=3 scanned=0"],
    final: [
      tFinal(2, "packages/*/src", FINAL_TS_GLOB),
      tFinal(2, "tests/**/*.tsx", FINAL_TS_GLOB),
      tFinal(2, ["$", "{configDir}/src"].join(""), FINAL_TS_TEMPLATE),
    ],
    finalPopulation: 0,
    finalSubjects: [TSCONFIG],
  },
  {
    why: "mustPass[3] the exemption HONOURED — CATEGORY 5: the legacy table HID this entry, the shipped grant licenses it",
    classification: "exemption-mechanism-move",
    successor: null,
    grants: [shippedGrant("tsconfig-entry-liveness:st-goldens-runtime")],
    granted: ["tsconfig-entry-liveness:st-goldens-runtime"],
    legacy: [],
    legacyPopulation: 0,
    legacySubjects: ["tsconfig entry: candidates=30 scanned=1"],
    final: fillerGlobs(tFinal, 2, 29, FINAL_TS_GLOB),
    finalRaw: [...fillerGlobs(tFinal, 2, 29, FINAL_TS_GLOB), tFinal(2, ST_RUNTIME, FINAL_TS_EXACT)],
    finalPopulation: 0,
    finalSubjects: [TSCONFIG, ST_README],
  },
];

// Every scenario materializes its own tmpdir repository and runs `git init` (+ `git add`) in a niced
// child — three per example, 75 in all — so the arm carries an explicit load-scaled budget rather than
// sitting one contention spike away from vitest's default.
test("§4.6 — the biome-grant-liveness pair replays its whole legacy corpus on a real tmpdir", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const differential = createTmpdirDifferential(toolErrorCode);
  const legacy = await frozenFilesystemLegacyGate(scratch, LEGACY_BASE, BIOME_LEGACY);
  expect(legacy.name, "the frozen blob is the LEGACY descriptor, not an already-converted policy").toBe(B);
  expect(differential.runScenarios(legacy, [biomeGrantLiveness, biomeGrantLivenessHealth], BIOME_FALLBACK, BIOME_SCENARIOS)).toBe(14);
});

test("§4.6 — the tsconfig-entry-liveness pair replays its whole legacy corpus on a real tmpdir", { timeout: scaledBudget(300_000) }, async ({ scratch }) => {
  const differential = createTmpdirDifferential(toolErrorCode);
  const legacy = await frozenFilesystemLegacyGate(scratch, LEGACY_BASE, TSCONFIG_LEGACY);
  expect(legacy.name, "the frozen blob is the LEGACY descriptor, not an already-converted policy").toBe(T);
  expect(differential.runScenarios(legacy, [tsconfigEntryLiveness, tsconfigEntryLivenessHealth], TSCONFIG_FALLBACK, TSCONFIG_SCENARIOS)).toBe(11);
});

// ── THE REFUSALS THIS DOOR PRESERVES, both directions each ────────────────────────────────────────────
// #2119's in-memory refusal is pinned with its own controls in `grant-liveness-family.test.ts` and is
// NOT relaxed by anything here. These two arms are the fences the tmpdir door adds beside it.

test("§4.6 — a replay root inside the running checkout is REFUSED, and a tmpdir root is not", ({ scratch }) => {
  expect(() => {
    assertReplayRootIsScratch(scratch);
  }, "the clean control — a mkdtemp root outside the checkout is the sanctioned substrate").not.toThrow();
  expect(() => {
    assertReplayRootIsScratch(process.cwd());
  }, "the checkout ROOT itself").toThrow("must live OUTSIDE the running checkout");
  expect(() => {
    assertReplayRootIsScratch(join(process.cwd(), "tooling"));
  }, "a directory INSIDE the checkout — a legacy existsSync arm here answers about this repository").toThrow("must live OUTSIDE the running checkout");
});

test("§4.6 — the tmpdir door REFUSES a legacy descriptor that reads no filesystem", async ({ scratch }) => {
  await expect(frozenFilesystemLegacyGate(scratch, PURE_BASE, PURE_LEGACY)).rejects.toThrow("the real-tmpdir door is the wrong one");
  // The other direction: the two blobs this file DOES replay are exactly the ones that reach disk.
  await expect(frozenFilesystemLegacyGate(scratch, LEGACY_BASE, BIOME_LEGACY)).resolves.toBeDefined();
});

// ── CONTAINMENT — THE SHARED WRITE SITE, BOTH BOUNDARIES (cb-x-replay-boundary) ────────────────────────
//
// Codex's security review of `df2cda4c8` found two shared WRITE boundaries open, and both are the same
// shape: bytes landed before the guard that was supposed to fence them. A fixture KEY carrying `../`
// escaped the mkdtemp root that the `finally` reaps, and the frozen loader wrote into whatever staging
// directory a caller handed it — including the checkout — because the door's own anti-live-tree refusal
// had exactly one caller and it was somewhere else. Measured before the repair, in a throwaway parent:
// the escaping key OVERWROTE a sentinel and the sentinel survived the root's removal.
//
// EVERY RED SIDE HERE IS UNWRITEABLE BY CONSTRUCTION, which is the condition the review set. The traversal
// arms drive the PURE resolver, or a door whose refusal precedes its own `mkdtemp`. The two live-tree arms
// hand the MUTATOR a root inside the checkout that is a regular FILE (and a symlink to one), so a
// regression that dropped the guard fails with ENOTDIR instead of planting a frozen module in the tree:
// this suite can never become the incident it is pinning.
const SENTINEL_BYTES = "sentinel-must-not-change";
/** Each escaping key with the clause of the IMPORTED grammar (`lib/policy-repo-inventory.ts`) it trips. */
const ESCAPING_KEYS: readonly (readonly [string, string, string])[] = [
  ["../escaped.txt", "has an invalid path segment", "a bare traversal"],
  ["a/../../escaped.txt", "has an invalid path segment", "a traversal hidden mid-path"],
  ["/etc/passwd", "must be a repo-relative POSIX path", "an absolute key"],
  ["C:/windows/x.ts", "must be a repo-relative POSIX path", "a drive-letter key"],
  ["..\\escaped.txt", "must be a repo-relative POSIX path", "the backslash spelling"],
  ["", "must be a repo-relative POSIX path", "an empty key"],
  ["a//b.ts", "has an invalid path segment", "an empty segment"],
  ["./a.ts", "has an invalid path segment", "a leading dot segment"],
  ["a/./b.ts", "has an invalid path segment", "a dot segment mid-path"],
  ["control\u0001char.ts", "must be a repo-relative POSIX path", "an ASCII control character"],
  ["trailing/", "must be a repo-relative POSIX path", "a trailing slash"],
];

test("§4.6 — the staged write target REFUSES every escaping path, and creates nothing refusing it", ({ scratch }) => {
  const root = join(scratch, "staging");
  mkdirSync(root);
  expect(stagedReplayTarget(root, "a/b/c.ts"), "the PLANTED POSITIVE CONTROL — an ordinary key resolves INSIDE the root").toBe(
    join(realpathSync(root), "a/b/c.ts"),
  );
  for (const [key, clause, why] of ESCAPING_KEYS) {
    expect(() => stagedReplayTarget(root, key), `${why} — ${JSON.stringify(key)}`).toThrow(clause);
    expect(() => stagedReplayTarget(root, key), `${why} — the refusal says what containment it protects`).toThrow("would land OUTSIDE the root");
  }
  expect(readdirSync(root), "the resolver is PURE — nothing was created while refusing, which is why it can carry the red side").toEqual([]);
});

test("§4.6 — a staged path that crosses a symlink OUT of the staging root is REFUSED", ({ scratch }) => {
  const root = join(scratch, "linked-staging");
  const sibling = join(scratch, "outside-the-root");
  mkdirSync(root);
  mkdirSync(sibling);
  mkdirSync(join(root, "real"));
  symlinkSync(process.cwd(), join(root, "to-checkout"));
  symlinkSync(parse(root).root, join(root, "to-filesystem-root"));
  symlinkSync(sibling, join(root, "to-sibling"));
  symlinkSync(join(root, "real"), join(root, "to-inside"));
  for (const link of ["to-checkout", "to-filesystem-root", "to-sibling"]) {
    expect(() => stagedReplayTarget(root, `${link}/planted.ts`), `${link} — writeFileSync FOLLOWS a link, so lexical containment is not enough`).toThrow(
      "OUTSIDE the staging root",
    );
  }
  expect(stagedReplayTarget(root, "to-inside/planted.ts"), "the positive control — a link that stays INSIDE resolves through").toBe(
    join(realpathSync(root), "real/planted.ts"),
  );
  expect(existsSync(join(process.cwd(), "planted.ts")), "the checkout-link refusal planted nothing in the tree").toBe(false);
});

test("§4.6 — BOTH tmpdir replay legs refuse an escaping fixture key before a root exists", async ({ scratch }) => {
  const differential = createTmpdirDifferential(toolErrorCode);
  const legacy = await frozenFilesystemLegacyGate(scratch, LEGACY_BASE, BIOME_LEGACY);
  // THE SENTINEL, in the one place a `materialize` traversal can actually reach. The door's root is its OWN
  // mkdtemp directly under `tmpdir()`, so `../<rel>` resolves to a sibling THERE — and the sibling this test
  // names is a directory it OWNS (#2332): the escaping key carries the owned dir's own basename, so the
  // escape target is a file inside an invocation-owned root rather than a predictable litter path in the
  // shared `tmpdir()`. Same geometry, same assertion, and `policy-fixture-substrate` can now prove the
  // sentinel write is not a checkout write instead of refusing it as unreadable.
  const sentinelRoot = mkdtempSync(join(tmpdir(), "orb-replay-boundary-sentinel-"));
  const sentinelName = `${basename(sentinelRoot)}/sentinel.txt`;
  const sentinel = fixturePath(sentinelRoot, "sentinel.txt");
  const liveRoots = (): readonly string[] => readdirSync(tmpdir()).filter((entry) => entry.startsWith(`orb-legacy-differential-${String(process.pid)}-`));
  writeFileSync(sentinel, SENTINEL_BYTES);
  try {
    expect(liveRoots(), "no replay root of this process is live before the control").toEqual([]);
    const escaping = { [`../${sentinelName}`]: "escape-control" };
    expect(() => differential.legacyReplay(legacy, escaping, label), "the LEGACY leg").toThrow("would land OUTSIDE the root");
    expect(() => differential.finalReplay([biomeGrantLiveness], escaping, label), "the FINAL leg").toThrow("would land OUTSIDE the root");
    expect(readFileSync(sentinel, "utf8"), "both legs refused BEFORE the sentinel could be overwritten").toBe(SENTINEL_BYTES);
    expect(liveRoots(), "the key is judged before `mkdtemp`, so no root was created — nothing to leak, nothing to reap").toEqual([]);
  } finally {
    rmSync(sentinelRoot, { recursive: true, force: true });
  }
});

test("§4.6 — the frozen loader binds the anti-live-tree guard BEFORE its staging write", async ({ scratch }) => {
  const fileInsideCheckout = join(process.cwd(), "package.json");
  const linkIntoCheckout = join(scratch, "link-into-checkout");
  symlinkSync(fileInsideCheckout, linkIntoCheckout);
  await expect(
    frozenFilesystemLegacyGate(fileInsideCheckout, LEGACY_BASE, BIOME_LEGACY),
    "a staging root inside the checkout — an unguarded loader would have written a frozen `.ts` module into the tree",
  ).rejects.toThrow("must live OUTSIDE the running checkout");
  await expect(
    frozenFilesystemLegacyGate(linkIntoCheckout, LEGACY_BASE, BIOME_LEGACY),
    "a staging root that reaches the checkout THROUGH A SYMLINK",
  ).rejects.toThrow("must live OUTSIDE the running checkout");
  // The checkout ROOT itself is the one arm that cannot be driven through the mutator without performing
  // the unsafe write, so it is driven through the pure resolver — at the exact staged name the loader
  // computes for this blob, which is what makes it the same write rather than a lookalike.
  const stagedEntry = `${LEGACY_BASE.slice(0, 8)}--${BIOME_LEGACY.split("/").join("__")}`;
  expect(() => stagedReplayTarget(process.cwd(), stagedEntry), "the checkout root").toThrow("must live OUTSIDE the running checkout");
  expect(existsSync(join(process.cwd(), stagedEntry)), "no frozen module was planted in the checkout by any arm of this suite").toBe(false);
  // The clean control: the same loader, the sanctioned scratch root, still loads.
  await expect(frozenFilesystemLegacyGate(scratch, LEGACY_BASE, BIOME_LEGACY)).resolves.toBeDefined();
});

// ── THE SHIM'S HEADER/BODY BOUNDARY (LD-2319-8) ───────────────────────────────────────────────────────
//
// The independent security review of `6144f3183` found the wrapped-import opener matching far more than a
// wrapped import — `export const gate: GateDescriptor = {` among them — which put the scanner in block mode
// for the REST of the module. Two consequences, both silent: the body byte-identity assertion went VACUOUS
// (everything was "header", so it compared "" to ""), and a column-0 `} from "…";` in the swallowed region
// — INCLUDING one inside an authored FIXTURE TEMPLATE LITERAL — was rewritten to an absolute URL. Both
// engines then judge the same corrupted fixture and agree on a WRONG number, which is the one failure a
// count comparison structurally cannot see, and which this module's header claims the shim prevents.
//
// The control below is NON-VACUOUS by construction: it asserts the fixture line is byte-identical AND that
// the real header import was rewritten, so it cannot pass by the shim doing nothing.
const FIXTURE_SPECIFIER = '} from "../lib/authored-fixture-only.ts";';
/** A frozen module shaped like the ones that bite: a real header import, then a `{`-terminated body opener,
 *  then an authored fixture string whose OWN source contains a column-0 wrapped-import closing line. */
const FIXTURE_CARRYING_MODULE = [
  "// a frozen gate module",
  'import { runPass } from "../lib/pass.ts";',
  "",
  "export const gate: GateDescriptor = {",
  "  id: 'x',",
  "  examples: [",
  "    `import {",
  "  alpha,",
  FIXTURE_SPECIFIER,
  "`,",
  "  ],",
  "};",
].join("\n");

test("§4.6 — the header shim rewrites the header and leaves an authored FIXTURE specifier byte-identical", () => {
  const resolved = "file:///resolved/lib/pass.ts";
  const shimmed = shimHeaderImports(FIXTURE_CARRYING_MODULE, () => resolved);
  const bodyStart = FIXTURE_CARRYING_MODULE.indexOf("\nexport const gate");
  expect(shimmed, "the REAL header import is rewritten — without this the control could pass by doing nothing").toContain(`from "${resolved}";`);
  expect(shimmed.slice(shimmed.indexOf("\nexport const gate")), "everything from the body opener down is byte-identical").toBe(
    FIXTURE_CARRYING_MODULE.slice(bodyStart),
  );
  expect(shimmed, "the specifier inside the authored FIXTURE STRING is untouched").toContain(FIXTURE_SPECIFIER);
  expect(shimmed.split(resolved).length - 1, "exactly ONE specifier was rewritten — the header's").toBe(1);
});

test("§4.6 — the header scan REFUSES a wrapped import it cannot close instead of swallowing the module", () => {
  const unterminated = ["import {", "  alpha,", "", "export const gate = {};"].join("\n");
  expect(() => shimHeaderImports(unterminated, () => "file:///x"), "a blank line is not a brace-list member").toThrow(
    "neither a brace-list member nor its closing",
  );
  const runaway = ["import {", "  alpha,", "  beta,"].join("\n");
  expect(() => shimHeaderImports(runaway, () => "file:///x"), "a block that reaches EOF").toThrow("without its closing");
});

// ── THE ARMS THE INDEPENDENT REVIEW DROVE AND THIS SUITE LACKED ───────────────────────────────────────
// Persisted as committed controls so they are pinned rather than re-derived: the symlink planted at the
// loader's EXACT staged filename driven through the MUTATOR (the only path on which `writeFileSync` would
// actually have followed a link), and the non-authored fixture-key fence, which had no control at all.
const VICTIM_BYTES = "victim-bytes-must-not-change";

test("§4.6 — a symlink planted at the loader's own staged filename is REFUSED by the mutator", async ({ scratch }) => {
  const staging = join(scratch, "loader-staging");
  const outside = join(scratch, "outside-the-staging-root");
  mkdirSync(staging);
  mkdirSync(outside);
  const victim = join(outside, "victim.ts");
  writeFileSync(victim, VICTIM_BYTES);
  // The link's own name is the loader's staged spelling, computed from the SHA and the legacy path, so the
  // composed segment has no authored value; `fixturePath` bounds it at runtime instead (#2332).
  symlinkSync(victim, fixturePath(staging, `${LEGACY_BASE.slice(0, 8)}--${BIOME_LEGACY.split("/").join("__")}`));
  await expect(
    frozenFilesystemLegacyGate(staging, LEGACY_BASE, BIOME_LEGACY),
    "the frozen entry would be written THROUGH the link — the one place writeFileSync follows one",
  ).rejects.toThrow("the staging path crosses the symlink");
  expect(readFileSync(victim, "utf8"), "the victim's bytes are untouched").toBe(VICTIM_BYTES);
});

test("§4.6 — the tmpdir door REFUSES a non-authored fixture key, before any root exists", async ({ scratch }) => {
  const differential = createTmpdirDifferential(toolErrorCode);
  const legacy = await frozenFilesystemLegacyGate(scratch, LEGACY_BASE, BIOME_LEGACY);
  const liveRoots = (): readonly string[] => readdirSync(tmpdir()).filter((entry) => entry.startsWith(`orb-legacy-differential-${String(process.pid)}-`));
  for (const key of ["node_modules/x.ts", ".git/config", "dist/x.ts", ".cache/x.ts"]) {
    expect(() => differential.legacyReplay(legacy, { [key]: "export const x = 1;" }, label), `${key} — the LEGACY leg`).toThrow(
      "refuses the non-authored fixture path",
    );
    expect(() => differential.finalReplay([biomeGrantLiveness], { [key]: "export const x = 1;" }, label), `${key} — the FINAL leg`).toThrow(
      "refuses the non-authored fixture path",
    );
  }
  // The semantic fence and the containment grammar are SEPARATE refusals: neither implies the other.
  expect(() => stagedReplayTarget(scratch, "node_modules/x.ts"), "the grammar admits it — only the door's semantic fence refuses").not.toThrow();
  expect(liveRoots(), "the non-authored refusal also precedes the mkdtemp").toEqual([]);
});

test("§4.6 — the replay-root guard NAMES a non-directory root instead of falling through to ENOTDIR", ({ scratch }) => {
  const regularFile = join(scratch, "not-a-directory");
  writeFileSync(regularFile, "");
  const dangling = join(scratch, "dangling-link");
  symlinkSync(join(scratch, "no-such-target"), dangling);
  expect(() => {
    assertReplayRootIsScratch(regularFile);
  }, "a regular file OUTSIDE the checkout used to pass this guard and refuse later as a bare ENOTDIR").toThrow("must be a DIRECTORY");
  expect(() => {
    assertReplayRootIsScratch(dangling);
  }, "a dangling symlink root").toThrow("does not resolve at all");
  expect(() => {
    assertReplayRootIsScratch(join(scratch, "no-such-root"));
  }, "an absent root").toThrow("does not resolve at all");
  expect(() => {
    assertReplayRootIsScratch(join(process.cwd(), "package.json"));
  }, "IDENTITY answers before KIND — a file INSIDE the checkout still refuses with the live-tree sentence").toThrow("must live OUTSIDE the running checkout");
  expect(readdirSync(scratch).toSorted(), "the guard writes nothing").toEqual(["dangling-link", "not-a-directory"]);
});

test("§4.6 — a poisoned GIT_DIR in the parent environment does not steer the frozen read", async ({ scratch }) => {
  // LD-2319-9. The frozen blob is WRITTEN into scratch and `import()`ed, so the object store it resolves
  // against is the store whose code executes. A run inside a git HOOK is the case: git exports `GIT_DIR`
  // and `GIT_INDEX_FILE` to hooks, and `tests/tooling/**` runs on the `--full` tier.
  //
  // `withProcessEnv` is the door for the poison ITSELF: it restores a present key byte-for-byte and an
  // absent one as actual ABSENCE in its own `finally`, so this control leaks nothing into the next test
  // file sharing this pooled worker — and needs no `process.env` suppression to say so (LD-2319-11).
  const foreign = join(scratch, "foreign-repository");
  const pinned = join(scratch, "pinned");
  mkdirSync(foreign);
  mkdirSync(pinned);
  execFileSync("git", ["init", "--quiet", foreign]);
  // BOTH READS HAPPEN INSIDE THE POISONED WINDOW — the control and the pinned one; only the assertions
  // about the result are outside it. The callback is synchronous, so it hands its value back through a
  // resolved promise rather than wearing an `async` modifier it would never use.
  const closure = await withProcessEnv("GIT_DIR", join(foreign, ".git"), () => {
    // THE POSITIVE CONTROL — the poison is real: an UNPINNED read of the same ref fails under it.
    expect(
      () => execFileSync("git", ["show", `${LEGACY_BASE}:${BIOME_LEGACY}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
      "an unpinned `git show`",
    ).toThrow();
    return Promise.resolve(frozenClosureOf(pinned, LEGACY_BASE, BIOME_LEGACY));
  });
  expect(closure.extracted[0], "the PINNED read resolves against THIS repository under the same poison").toBe(BIOME_LEGACY);
  expect(closure.extracted.length, "and the whole closure comes back").toBeGreaterThan(1);
});
