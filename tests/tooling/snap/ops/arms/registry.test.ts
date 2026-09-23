// THE ARM REGISTRY'S DERIVATIONS (tooling/src/snap/ops/arms/registry.ts + contract/arms.ts). Every claim
// the plug-in contract makes about "a new arm lands in ONE file" is a DERIVATION from `ARM_DEFS`, and a
// derivation that quietly stops covering an arm looks exactly like a working one — an unlisted
// required-value flag has its value counted as the positional ROUTE, a missing help row simply is not
// printed, and a dropped RESULT pair reads as a field the run did not measure. So each derivation is
// pinned BOTH WAYS here: the real roster is covered, and the mechanism refuses when it cannot cover.
//
// @instrument-proof: plants an arm-owned flag whose scanner class is derived (`--contrast <selector>`)
// and asserts a bogus value REDs at parse time; plants a claim for a RESULT pair no arm produced and
// asserts the ledger THROWS rather than dropping the field.
// @instrument-absence-proof: the leftover sweep — an arm the help template never placed still reaches
// `--help`, and an arm whose pairs the RESULT spine never claims still reaches the RESULT line. A
// derivation that silently omitted an arm would read as a clean, complete instrument.
import type { ResultPair } from "../../../../../tooling/src/_shared/artifacts.ts";
import type { Arm } from "../../../../../tooling/src/snap/contract/arm-vocabulary.ts";
import { ARMS } from "../../../../../tooling/src/snap/contract/arm-vocabulary.ts";
import type { ArmArgs, ArmPairInput } from "../../../../../tooling/src/snap/contract/arms.ts";
import { SNAP_HELP } from "../../../../../tooling/src/snap/contract/help.ts";
import { SESSION_ONLY_FLAGS } from "../../../../../tooling/src/snap/lib/session-plan.ts";
import {
  ARM_DEFS,
  armArgDefaults,
  armFlagHandlers,
  armFlags,
  armFlagsOfKind,
  armLaunchNeeds,
  armPairLedger,
  armSessionCallBaseMs,
  assertPageArmLifecycle,
  assertRunArmInstance,
  pageArmFailures,
  pageArms,
  pageTargetableArmFlags,
  sessionLevelArmFlags,
} from "../../../../../tooling/src/snap/ops/arms/registry.ts";
import { OPTIONAL_SELECTOR_FLAGS, OPTIONAL_VALUE_FLAGS, PAGE_TARGET_FLAGS, REQUIRED_VALUE_FLAGS } from "../../../../../tooling/src/snap/ops/flags-classes.ts";
import { FLAG_HANDLERS } from "../../../../../tooling/src/snap/ops/flags-handlers.ts";
import { parseSnapArgs } from "../../../../../tooling/src/snap/ops/parse.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

function pairInput(): ArmPairInput {
  return {
    opts: parseSnapArgs(["/chats"]),
    outcomes: [],
    ctx: { url: "/x", out: "reports/snaps/x.png", produceShot: true, failed: [], totalPages: 1 },
  };
}

test("every arm reaches the CLI through its own row: flags, scanner class, handler, page-suffix rule", () => {
  expect(ARMS.length).toBeGreaterThan(0);
  const flags = armFlags();
  expect(flags.length).toBeGreaterThan(0);
  for (const spec of flags) {
    // The handler table is spread from the registry, so a flag with no reachable handler would be an
    // "unknown flag" refusal on a documented spelling.
    expect(FLAG_HANDLERS[spec.flag], spec.flag).toBeTypeOf("function");
    expect(armFlagHandlers()[spec.flag], spec.flag).toBe(spec.handler);
    // Which value class the flag lands in is a FUNCTION of its declared kind — asserted as a tuple so a
    // boolean flag proves its ABSENCE from all three (a boolean in a value class eats the next token).
    expect([REQUIRED_VALUE_FLAGS.has(spec.flag), OPTIONAL_SELECTOR_FLAGS.has(spec.flag), OPTIONAL_VALUE_FLAGS.has(spec.flag)], spec.flag).toEqual([
      spec.kind === "required-value",
      spec.kind === "optional-selector",
      spec.kind === "optional-value",
    ]);
    expect(PAGE_TARGET_FLAGS.has(spec.flag), spec.flag).toBe(spec.pageTargetable);
  }
  // A boolean arm flag really parses, and a page suffix on a non-targetable one really refuses.
  expect(parseSnapArgs(["/chats", "--no-deadcss"]).deadCss).toBe(false);
  expect(parseSnapArgs(["/chats", "--no-deadcss@1"]).errors).toEqual([expect.stringContaining("does not accept a @<page> suffix")]);
});

// The derived scanner class BITES: `--contrast` is required-value ONLY because its `ArmDef` row says so,
// and the value it consumes is held to the selector-shape refusal. Drop the row's `kind` and this run
// counts "choose who speaks next" as four positional routes instead.
test("an arm's derived value class is what refuses a bad value", () => {
  expect(parseSnapArgs(["/chats", "--contrast", "choose who speaks next"]).errors).not.toEqual([]);
  expect(parseSnapArgs(["/chats", "--contrast", ".rail"]).errors).toEqual([]);
  expect(parseSnapArgs(["/chats", "--contrast"]).errors).toEqual([expect.stringContaining("--contrast requires a value")]);
});

test("the session-level flag set derives from each arm's declared level, not from a second list", () => {
  const declared = ARMS.filter((arm) => ARM_DEFS[arm].level === "session");
  expect(declared).toEqual(["cascade", "react-profile"]);
  for (const flag of sessionLevelArmFlags()) {
    expect(SESSION_ONLY_FLAGS.has(flag), flag).toBe(true);
  }
  // ...and a CALL-level arm's flags stay legal on a later session call.
  for (const arm of ARMS.filter((candidate) => ARM_DEFS[candidate].level === "call")) {
    for (const spec of ARM_DEFS[arm].flags) {
      expect(SESSION_ONLY_FLAGS.has(spec.flag), spec.flag).toBe(false);
    }
  }
});

// @instrument-proof: TypeScript already makes prepare required, but a JS row or cast can still enter the
// registry at runtime. The planted mutant proves beginRunArms' runtime fence refuses that arm before a
// navigation can turn its missing pre-mount work into a comfortable empty measurement.
test("a run arm without the required pre-navigation prepare phase is refused", () => {
  expect(() => assertRunArmInstance("react-profile", {})).toThrow(/react-profile.*prepare/u);
});

test("a run arm without the required post-settle phase is refused", () => {
  const incomplete = {
    prepare: async (): Promise<void> => undefined,
    afterNavigation: async (): Promise<void> => undefined,
    beforeAction: async (): Promise<null> => null,
    afterAction: async (): Promise<void> => undefined,
    afterActions: async (): Promise<void> => undefined,
  };
  expect(() => assertRunArmInstance("filmstrip", incomplete)).toThrow(/filmstrip.*afterSettle/u);
});

test("a page arm without the required terminal exit phase is refused", () => {
  const identity = (): undefined => undefined;
  expect(() =>
    assertPageArmLifecycle("map", { at: "page", enabled: identity, run: identity, pairs: identity, evidence: identity, facts: identity, failures: identity }),
  ).toThrow(/map.*exit/u);
});

test("a page arm that files NO evidence for what it prints is refused (#1342)", () => {
  // The values an arm prints have to reach the run slot: `EVIDENCE <run.json>` is the receipt every review
  // in this repo cites, and an arm whose numbers are in the index while its VALUES are on the terminal made
  // a cited P1 unverifiable (the eval arm, measured 2026-09-04). The member is required, and the runtime
  // twin refuses a JS/cast row that skipped it — the same posture as the missing-`exit` case above.
  const identity = (): undefined => undefined;
  expect(() =>
    assertPageArmLifecycle("eval", { at: "page", enabled: identity, run: identity, pairs: identity, facts: identity, failures: identity, exit: identity }),
  ).toThrow(/eval.*evidence/u);
});

test("every arm defaults its own slice of Args, and parseSnapArgs takes those defaults verbatim", () => {
  const defaults = armArgDefaults();
  const parsed = parseSnapArgs(["/chats"]);
  for (const key of Object.keys(defaults) as (keyof ArmArgs)[]) {
    expect(parsed[key], key).toEqual(defaults[key]);
  }
  // The factory shape is load-bearing: two parses must not share one arm's queue array.
  const a = parseSnapArgs(["/chats", "--eval", "1"]);
  const b = parseSnapArgs(["/chats"]);
  expect(a.eval).toHaveLength(1);
  expect(b.eval).toHaveLength(0);
});

test("launch provisions are asked for only by the arms this argv turned on", () => {
  expect(armLaunchNeeds(parseSnapArgs(["/chats"]))).toEqual({});
  expect(armLaunchNeeds(parseSnapArgs(["/chats", "--lighthouse", "desktop"]))).toEqual({ debuggingPort: true });
  expect(armLaunchNeeds(parseSnapArgs(["/chats", "--cascade", "p=color"]))).toEqual({ devtoolsSdk: true });
  // #1259: ONE mechanism, so the pair composes instead of being refused.
  expect(armLaunchNeeds(parseSnapArgs(["/chats", "--lighthouse", "desktop", "--cascade", "p=color"]))).toEqual({ debuggingPort: true, devtoolsSdk: true });
});

test("the page pass runs the arms in ARMS order, and the pixel arm runs LAST", () => {
  const order = pageArms().map(([arm]) => arm);
  expect(order).toEqual(ARMS.filter((arm) => ARM_DEFS[arm].lifecycle.at === "page"));
  // Every settled-surface read happens before the shutter, or the PNG shows a page the run's own text
  // evidence disagrees with.
  expect(order.at(-1)).toBe("shot");
});

test("an arm's RESULT pairs are TOTAL — an arm that did not run still says so", () => {
  const pairs = new Map<string, ResultPair[1]>();
  for (const [, lifecycle] of pageArms()) {
    for (const [key, value] of lifecycle.pairs(pairInput())) {
      pairs.set(String(key), value);
    }
  }
  // No flag was passed, so every one of these is the "off" answer rather than an absent field.
  expect(pairs.get("aria")).toBe("no");
  expect(pairs.get("map")).toBe("no");
  expect(pairs.get("map-dom-fallbacks")).toBe("no");
  expect(pairs.get("evals")).toBe(0);
  expect(pairs.get("deadcss")).toBe(0);
  expect(pairs.get("out")).toBe("reports/snaps/x.png");
  expect(pairs.get("crop")).toBe("none");
});

test("the RESULT ledger: claimed pairs keep their position, unclaimed ones reach the tail, a bogus claim THROWS", () => {
  const ledger = armPairLedger(pairInput(), new Map<Arm, readonly ResultPair[]>());
  expect(ledger.arm("aria").map(([key]) => key)).toEqual(["aria", "aria-fails"]);
  expect(ledger.some("dead-css", "deadcss-fails").map(([key]) => key)).toEqual(["deadcss-fails"]);
  const rest = ledger.rest().map(([key]) => String(key));
  // Claimed once, never twice — the leftover sweep must not re-emit what the spine already placed.
  expect(rest).not.toContain("aria");
  expect(rest).not.toContain("deadcss-fails");
  // ...and everything the spine did NOT claim still reaches the line.
  expect(rest).toContain("emptycss-fails");
  expect(rest).toContain("out");
  expect(() => ledger.some("aria", "not-a-pair")).toThrow(/did not produce it/u);
});

test("every arm-owned verdict member has exactly one owner, and the fold refuses a second claimant", () => {
  const failures = pageArmFailures(pairInput()) as Record<string, number>;
  expect(Object.keys(failures).sort()).toEqual(["aria", "assertions", "contrast", "deadCss", "emptyCss", "eval", "map"]);
  for (const value of Object.values(failures)) {
    expect(value).toBe(0);
  }
});

test("HELP IS DERIVED: every arm's operator block reaches --help, and no arm can ship without one", () => {
  for (const arm of ARMS) {
    const { help } = ARM_DEFS[arm];
    expect(help.trim(), arm).not.toBe("");
    // Whether contract/help.ts places the block by name or the leftover sweep does, it is PRESENT.
    expect(SNAP_HELP, arm).toContain(help);
  }
  // And the blocks are the operator's real vocabulary, not placeholders.
  expect(SNAP_HELP).toContain("--no-deadcss");
  expect(SNAP_HELP).toContain("--expect-no-overflow");
  expect(SNAP_HELP).toContain("--request-body <url-substring>");
});

test("every arm flag is a flag the parser actually accepts — no advertised spelling is unknown", () => {
  for (const spec of armFlags()) {
    const argv = ["/chats", spec.flag, spec.kind === "required-value" ? "body" : "--json"];
    expect(parseSnapArgs(argv).errors.join(" "), spec.flag).not.toContain(`unknown flag ${spec.flag}`);
  }
});

test("the page-target class is exactly the arms that declared it (a @<page> suffix elsewhere refuses)", () => {
  const declared = new Set(pageTargetableArmFlags());
  expect(declared.has("--eval")).toBe(true);
  expect(declared.has("--lighthouse")).toBe(false);
  expect(parseSnapArgs(["/chats", "--pages", "2", "--eval@1", "1"]).errors).toEqual([]);
  expect(parseSnapArgs(["/chats", "--lighthouse@1", "desktop"]).errors).toEqual([expect.stringContaining("does not accept a @<page> suffix")]);
});

test("the optional-inline classes are entirely arm-owned, which is why they exist", () => {
  expect([...OPTIONAL_SELECTOR_FLAGS].sort()).toEqual([...armFlagsOfKind("optional-selector")].sort());
  expect([...OPTIONAL_VALUE_FLAGS].sort()).toEqual([...armFlagsOfKind("optional-value")].sort());
  // `--requests /route` leaves the ROUTE alone; `--map .rail` swallows its selector.
  expect(parseSnapArgs(["--requests", "/chat"]).route).toBe("/chat");
  expect(parseSnapArgs(["/chats", "--map", ".rail"]).mapSelector).toBe(".rail");
});

/** #1259: the refusal that stood through phase 1 is GONE, and the pair is a legal argv. */
test("--session with --lighthouse is no longer refused — one debugging endpoint, one browser", () => {
  const args = parseSnapArgs(["--session", "p-x", "--lighthouse", "desktop"]);
  expect(args.errors).toEqual([]);
  expect(args.lighthouse).toBe("desktop");
  // F10: matrix is the second promoted session composition. Its cells own disposable contexts in the
  // existing browser; it is no longer one of the phase-1 refusals.
  expect(parseSnapArgs(["--session", "p-x", "--matrix", "--isolated"]).errors).toEqual([]);
});

test("the heap row owns one page lifecycle plus its exact flags, defaults, and help", () => {
  const row = ARM_DEFS.heap;
  expect(row.lifecycle.at).toBe("page");
  expect(row.flags.map((flag) => [flag.flag, flag.kind, flag.pageTargetable])).toEqual([
    ["--heap", "required-value", true],
    ["--heap-compare", "required-value", true],
    ["--heap-retainers", "required-value", true],
  ]);
  expect(row.defaults()).toEqual({ heapCaptures: [], heapComparisons: [], heapRetainers: [] });
  expect(row.sessionCallBaseMs(parseSnapArgs(["/", "--heap", "before"]))).toBe(30_000);
  expect(armSessionCallBaseMs(parseSnapArgs(["/"]))).toBeNull();
  expect(armSessionCallBaseMs(parseSnapArgs(["/", "--heap", "before"]))).toBe(30_000);
  expect(row.help).toContain("--heap <label>");
  expect(row.help).toContain("--heap-compare <left=right>");
  expect(row.help).toContain("--heap-retainers <snapshot=selector>");
});

test("the arm roster names every capability snap advertises as an arm", () => {
  const roster: readonly Arm[] = [
    "dead-css",
    "aria",
    "eval",
    "contrast",
    "map",
    "assert",
    "app-snapshot",
    "filmstrip",
    "heap",
    "shot",
    "cascade",
    "requests",
    "lighthouse",
    "motion",
    "interaction-perf",
    "cpu-profile",
    "boot-trace",
    "react-profile",
    // #1315: the deterministic UI defect scanner is an ARM, not a sibling CLI — the retired `pnpm design-audit`
    // ceased to exist and `pnpm snap <route> --design-audit` is its one spelling.
    "design-audit",
  ];
  expect([...ARMS].sort()).toEqual([...roster].sort());
});
